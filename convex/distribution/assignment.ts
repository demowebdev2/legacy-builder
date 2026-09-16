import { disputeDeadline } from "../../src/domain/distribution";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { maybeTriggerAutoReload } from "../autoReload";
import { debitLeads, getBalanceDoc } from "../ledger";
import { writeAudit } from "../lib/audit";
import type { Actor } from "../lib/auth";
import { appError, conflict } from "../lib/errors";
import { notifyAccount } from "../lib/notify";

export interface ReleaseInput {
  lead: Doc<"leads">;
  accountId: Id<"accounts">;
  method: "auto" | "manual";
  actor: Actor;
  now: number;
  disputeWindowHours: number;
  settingsVersionId: Id<"distributionSettings"> | null;
  scoreSnapshot?: Doc<"leadAssignments">["scoreSnapshot"];
  /** "backfill" records history (seed/import): no notifications, no auto-reload. */
  mode?: "live" | "backfill";
}

/**
 * Releases one lead to one account. MUST be called inside a mutation: the assignment, the ledger
 * debit, the balance cache update and the audit record commit together or not at all. A concurrent
 * release that reads the same balance or lead documents conflicts and is retried by Convex.
 */
export async function releaseLeadToAccount(ctx: MutationCtx, input: ReleaseInput): Promise<Id<"leadAssignments">> {
  const { lead, accountId, now } = input;

  const existing = await ctx.db
    .query("leadAssignments")
    .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
    .collect();
  if (existing.some((a) => a.accountId === accountId)) throw conflict("This account has already received this lead.");

  const account = await ctx.db.get(accountId);
  if (!account || account.status !== "active") throw appError("FORBIDDEN", "Only active accounts can receive leads.");

  // Re-verify the balance inside the transaction — never trust an earlier read.
  const balance = await getBalanceDoc(ctx, accountId);
  if (!balance || balance[lead.leadType] < 1) {
    throw appError("INSUFFICIENT_BALANCE", `${account.name} has no ${lead.leadType} leads left.`);
  }

  const assignmentId = await ctx.db.insert("leadAssignments", {
    leadId: lead._id,
    accountId,
    leadType: lead.leadType,
    method: input.method,
    assignedAt: now,
    assignedBy: input.actor.kind === "user" ? input.actor.userId : undefined,
    settingsVersionId: input.settingsVersionId ?? undefined,
    scoreSnapshot: input.scoreSnapshot,
    status: "new",
    statusUpdatedAt: now,
    disputeDeadlineAt: disputeDeadline(now, input.disputeWindowHours),
  });

  const ledgerEntryId = await debitLeads(ctx, {
    accountId,
    leadType: lead.leadType,
    quantity: 1,
    entryType: "ASSIGNMENT",
    reason: `Lead ${lead.reference} released${input.method === "manual" ? " (manual assignment)" : ""}`,
    source: input.method === "manual" ? "admin" : "engine",
    actor: input.actor,
    relatedLeadId: lead._id,
    relatedAssignmentId: assignmentId,
    createdAt: now,
  });
  await ctx.db.patch(assignmentId, { ledgerEntryId });
  await ctx.db.patch(accountId, { lastAssignedAt: now });

  await ctx.db.insert("assignmentEvents", {
    assignmentId,
    leadId: lead._id,
    accountId,
    kind: "released",
    status: "new",
    actorUserId: input.actor.kind === "user" ? input.actor.userId : undefined,
    actorName: input.actor.kind === "user" ? `${input.actor.name} (manual)` : "System",
    at: now,
  });

  const live = input.mode !== "backfill";
  const coverage = await ctx.db
    .query("coverageTypes")
    .withIndex("by_key", (q) => q.eq("key", lead.coverageType))
    .unique();
  if (live) await notifyAccount(ctx, {
    accountId,
    type: "lead",
    title: "New lead assigned",
    body: `${coverage?.name ?? lead.coverageType} · ${lead.city ? lead.city + ", " : ""}${lead.state} · reference ${lead.reference}`,
    link: `/agent/leads/${assignmentId}`,
    relatedLeadId: lead._id,
  });

  await writeAudit(ctx, input.actor, {
    action: input.method === "manual" ? "assignment.manual" : "assignment.auto",
    entityType: "lead",
    entityId: lead._id,
    accountId,
    summary: `Lead ${lead.reference} (${lead.leadType}) released to ${account.name}`,
    metadata: { assignmentId, ledgerEntryId, score: input.scoreSnapshot?.total },
  });

  if (live) await maybeTriggerAutoReload(ctx, accountId);
  return assignmentId;
}

/** Recomputes a lead's assignment counters and status from its assignment rows. */
export async function refreshLeadAssignmentState(ctx: MutationCtx, leadId: Id<"leads">, now: number) {
  const lead = await ctx.db.get(leadId);
  if (!lead) return null;
  const rows = await ctx.db
    .query("leadAssignments")
    .withIndex("by_lead", (q) => q.eq("leadId", leadId))
    .collect();
  const active = rows.filter((r) => !r.revokedAt).length;
  const terminal = new Set(["withdrawn", "suppressed", "duplicate", "out_of_area", "rejected"]);
  let status = lead.status;
  if (!terminal.has(lead.status)) {
    if (active >= lead.recipientTarget) status = "assigned";
    else if (active > 0) status = "partially_assigned";
    else if (lead.status === "assigned" || lead.status === "partially_assigned") status = "unassigned_pending";
  }
  await ctx.db.patch(leadId, {
    assignedCount: active,
    status,
    firstAssignedAt: lead.firstAssignedAt ?? (active > 0 ? now : undefined),
    nextRetryAt: status === "assigned" ? undefined : lead.nextRetryAt,
  });
  return { active, status };
}
