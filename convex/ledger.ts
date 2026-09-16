import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { LeadType } from "../src/domain/constants";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { type Actor, actorFromViewer, requireAccountViewer, requireStaff } from "./lib/auth";
import { appError, invalid, notFound } from "./lib/errors";
import { notifyAccount } from "./lib/notify";
import { leadTypeV } from "./lib/validators";

/**
 * APPEND-ONLY LEAD BALANCE LEDGER
 *
 * `leadBalanceLedger` is the authoritative record. `accountBalances` is a cache updated in the SAME
 * mutation as every ledger insert, so both are always consistent (Convex mutations are transactions).
 * There is no update or delete path for ledger rows; corrections are compensating entries.
 */

type EntryType = Doc<"leadBalanceLedger">["entryType"];
type Source = Doc<"leadBalanceLedger">["source"];

const PURCHASE_TYPES = new Set<EntryType>(["PURCHASE", "AUTO_RELOAD"]);

export async function getBalanceDoc(ctx: QueryCtx | MutationCtx, accountId: Id<"accounts">) {
  return await ctx.db
    .query("accountBalances")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .unique();
}

async function getOrCreateBalance(ctx: MutationCtx, accountId: Id<"accounts">): Promise<Doc<"accountBalances">> {
  const existing = await getBalanceDoc(ctx, accountId);
  if (existing) return existing;
  const id = await ctx.db.insert("accountBalances", {
    accountId,
    exclusive: 0,
    standard: 0,
    exclusiveIssued: 0,
    standardIssued: 0,
    exclusivePurchased: 0,
    standardPurchased: 0,
    exclusiveDelivered: 0,
    standardDelivered: 0,
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

export interface LedgerWrite {
  accountId: Id<"accounts">;
  leadType: LeadType;
  quantity: number;
  entryType: EntryType;
  reason: string;
  source: Source;
  actor: Actor;
  relatedOrderId?: Id<"orders">;
  relatedLeadId?: Id<"leads">;
  relatedAssignmentId?: Id<"leadAssignments">;
  relatedDisputeId?: Id<"disputes">;
  reversesEntryId?: Id<"leadBalanceLedger">;
  /** Defaults to now; set only when recording an event at a known earlier moment (e.g. release time). */
  createdAt?: number;
}

async function writeEntry(ctx: MutationCtx, input: LedgerWrite, direction: "credit" | "debit"): Promise<Id<"leadBalanceLedger">> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw invalid("Ledger quantity must be a positive whole number.");
  }
  const balance = await getOrCreateBalance(ctx, input.accountId);
  const typeKey = input.leadType;
  const current = balance[typeKey];
  const delta = direction === "credit" ? input.quantity : -input.quantity;
  const next = current + delta;
  if (next < 0) {
    throw appError(
      "INSUFFICIENT_BALANCE",
      `Not enough ${typeKey} leads in the balance (${current} available, ${input.quantity} required).`,
    );
  }

  const patch: Partial<Doc<"accountBalances">> = { [typeKey]: next, updatedAt: Date.now() };
  const issuedKey = `${typeKey}Issued` as const;
  const purchasedKey = `${typeKey}Purchased` as const;
  const deliveredKey = `${typeKey}Delivered` as const;
  if (direction === "credit") {
    if (input.entryType === "REVOCATION_RETURN") {
      // A revoked release was never delivered; the lead was already counted as issued once.
      patch[deliveredKey] = Math.max(0, balance[deliveredKey] - input.quantity);
    } else {
      patch[issuedKey] = balance[issuedKey] + input.quantity;
    }
    if (PURCHASE_TYPES.has(input.entryType)) patch[purchasedKey] = balance[purchasedKey] + input.quantity;
  } else if (input.entryType === "ASSIGNMENT") {
    patch[deliveredKey] = balance[deliveredKey] + input.quantity;
  } else {
    patch[issuedKey] = Math.max(0, balance[issuedKey] - input.quantity);
    if (input.entryType === "REFUND_REVERSAL") patch[purchasedKey] = Math.max(0, balance[purchasedKey] - input.quantity);
  }
  await ctx.db.patch(balance._id, patch);

  return await ctx.db.insert("leadBalanceLedger", {
    accountId: input.accountId,
    leadType: input.leadType,
    direction,
    quantity: input.quantity,
    delta,
    balanceAfter: next,
    entryType: input.entryType,
    reason: input.reason,
    source: input.source,
    relatedOrderId: input.relatedOrderId,
    relatedLeadId: input.relatedLeadId,
    relatedAssignmentId: input.relatedAssignmentId,
    relatedDisputeId: input.relatedDisputeId,
    reversesEntryId: input.reversesEntryId,
    createdBy: input.actor.kind === "user" ? input.actor.userId : undefined,
    createdByName: input.actor.kind === "user" ? input.actor.name : (input.actor.name ?? "System"),
    createdAt: input.createdAt ?? Date.now(),
  });
}

export function creditLeads(ctx: MutationCtx, input: LedgerWrite) {
  return writeEntry(ctx, input, "credit");
}

/** Throws INSUFFICIENT_BALANCE rather than letting a balance go negative. */
export function debitLeads(ctx: MutationCtx, input: LedgerWrite) {
  return writeEntry(ctx, input, "debit");
}

/** Compensating entry for a previous row. The original row is never modified. */
export async function reverseLedgerEntry(
  ctx: MutationCtx,
  entryId: Id<"leadBalanceLedger">,
  reason: string,
  actor: Actor,
): Promise<Id<"leadBalanceLedger">> {
  const entry = await ctx.db.get(entryId);
  if (!entry) throw notFound("Ledger entry");
  const alreadyReversed = await ctx.db
    .query("leadBalanceLedger")
    .withIndex("by_account", (q) => q.eq("accountId", entry.accountId))
    .filter((q) => q.eq(q.field("reversesEntryId"), entryId))
    .first();
  if (alreadyReversed) throw appError("CONFLICT", "That ledger entry has already been reversed.");
  const write: LedgerWrite = {
    accountId: entry.accountId,
    leadType: entry.leadType,
    quantity: entry.quantity,
    entryType: "REVERSAL",
    reason,
    source: "admin",
    actor,
    reversesEntryId: entryId,
    relatedOrderId: entry.relatedOrderId,
    relatedLeadId: entry.relatedLeadId,
  };
  return entry.direction === "credit" ? debitLeads(ctx, write) : creditLeads(ctx, write);
}

export interface BalanceSummary {
  exclusive: number;
  standard: number;
  total: number;
  exclusiveIssued: number;
  standardIssued: number;
  issued: number;
  exclusivePurchased: number;
  standardPurchased: number;
  purchased: number;
  delivered: number;
}

export function summarizeBalance(doc: Doc<"accountBalances"> | null): BalanceSummary {
  const b = doc ?? {
    exclusive: 0,
    standard: 0,
    exclusiveIssued: 0,
    standardIssued: 0,
    exclusivePurchased: 0,
    standardPurchased: 0,
    exclusiveDelivered: 0,
    standardDelivered: 0,
  };
  return {
    exclusive: b.exclusive,
    standard: b.standard,
    total: b.exclusive + b.standard,
    exclusiveIssued: b.exclusiveIssued,
    standardIssued: b.standardIssued,
    issued: b.exclusiveIssued + b.standardIssued,
    exclusivePurchased: b.exclusivePurchased,
    standardPurchased: b.standardPurchased,
    purchased: b.exclusivePurchased + b.standardPurchased,
    delivered: b.exclusiveDelivered + b.standardDelivered,
  };
}

/** Recomputes the balance from the ledger alone. */
export async function computeBalanceFromLedger(ctx: QueryCtx | MutationCtx, accountId: Id<"accounts">) {
  const rows = await ctx.db
    .query("leadBalanceLedger")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  const out = { exclusive: 0, standard: 0 };
  for (const row of rows) out[row.leadType] += row.delta;
  return { ...out, entries: rows.length };
}

/**
 * A released lead is returned to the balance at most once — by an upheld dispute OR by a revocation with
 * return, never both. Returns the existing return credit for the assignment, if any.
 */
export async function findLeadReturnCredit(ctx: QueryCtx | MutationCtx, assignmentId: Id<"leadAssignments">) {
  const rows = await ctx.db
    .query("leadBalanceLedger")
    .withIndex("by_assignment", (q) => q.eq("relatedAssignmentId", assignmentId))
    .collect();
  return rows.find((r) => r.direction === "credit" && (r.entryType === "DISPUTE_RETURN" || r.entryType === "REVOCATION_RETURN")) ?? null;
}

// ─────────────────────────── queries ───────────────────────────

export const myBalance = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "balance.read");
    return summarizeBalance(await getBalanceDoc(ctx, viewer.account._id));
  },
});

export const myLedger = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const viewer = await requireAccountViewer(ctx, "purchase");
    return await ctx.db
      .query("leadBalanceLedger")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const accountLedger = query({
  args: { accountId: v.id("accounts"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { accountId, paginationOpts }) => {
    await requireStaff(ctx, "ledger.read");
    return await ctx.db
      .query("leadBalanceLedger")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const reconcile = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    await requireStaff(ctx, "ledger.read");
    const fromLedger = await computeBalanceFromLedger(ctx, accountId);
    const cached = summarizeBalance(await getBalanceDoc(ctx, accountId));
    return {
      ledger: fromLedger,
      cached: { exclusive: cached.exclusive, standard: cached.standard },
      inSync: fromLedger.exclusive === cached.exclusive && fromLedger.standard === cached.standard,
    };
  },
});

// ─────────────────────────── admin adjustment ───────────────────────────

export const adjust = mutation({
  args: {
    accountId: v.id("accounts"),
    leadType: leadTypeV,
    direction: v.union(v.literal("credit"), v.literal("debit")),
    quantity: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, "ledger.adjust");
    const reason = args.reason.trim();
    if (reason.length < 5) throw invalid("A written reason is required for every adjustment.");
    if (!Number.isInteger(args.quantity) || args.quantity < 1 || args.quantity > 500) {
      throw invalid("Quantity must be a whole number between 1 and 500.");
    }
    const account = await ctx.db.get(args.accountId);
    if (!account) throw notFound("Account");
    const actor = actorFromViewer(staff);
    const write: LedgerWrite = {
      accountId: account._id,
      leadType: args.leadType,
      quantity: args.quantity,
      entryType: "ADMIN_ADJUSTMENT",
      reason,
      source: "admin",
      actor,
    };
    const entryId = args.direction === "credit" ? await creditLeads(ctx, write) : await debitLeads(ctx, write);
    await writeAudit(ctx, actor, {
      action: "ledger.adjust",
      entityType: "account",
      entityId: account._id,
      accountId: account._id,
      summary: `${args.direction === "credit" ? "Added" : "Removed"} ${args.quantity} ${args.leadType} lead(s): ${reason}`,
      metadata: { entryId, ...args },
    });
    await notifyAccount(ctx, {
      accountId: account._id,
      type: "leads",
      title: args.direction === "credit" ? `${args.quantity} leads added` : `${args.quantity} leads removed`,
      body: `Legacy Builders has ${args.direction === "credit" ? "added" : "removed"} ${args.quantity} ${args.leadType} lead${args.quantity === 1 ? "" : "s"} ${args.direction === "credit" ? "to" : "from"} your balance: ${reason}`,
      link: "/agent/balance",
    });
    return entryId;
  },
});

export const reverse = mutation({
  args: { entryId: v.id("leadBalanceLedger"), reason: v.string() },
  handler: async (ctx, { entryId, reason }) => {
    const staff = await requireStaff(ctx, "ledger.adjust");
    if (reason.trim().length < 5) throw invalid("A written reason is required.");
    const actor = actorFromViewer(staff);
    const id = await reverseLedgerEntry(ctx, entryId, reason.trim(), actor);
    const entry = (await ctx.db.get(entryId))!;
    await writeAudit(ctx, actor, {
      action: "ledger.reverse",
      entityType: "ledgerEntry",
      entityId: entryId,
      accountId: entry.accountId,
      summary: `Reversed ledger entry (${entry.entryType} ${entry.delta > 0 ? "+" : ""}${entry.delta} ${entry.leadType}): ${reason.trim()}`,
      metadata: { reversalEntryId: id },
    });
    return id;
  },
});
