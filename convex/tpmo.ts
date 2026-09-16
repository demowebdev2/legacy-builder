import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, assertAccountWritable, requireAccountViewer, requireStaff } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { notifyAccount, notifyStaff } from "./lib/notify";
import { getPublishedLegalDocument } from "./lib/settings";

/**
 * Medicare Third-Party Marketing Organization approval. Enforced by the `medicare_tpmo` hard
 * eligibility rule — Medicare leads cannot be released (automatically or manually) without it.
 */

export async function tpmoState(ctx: QueryCtx | MutationCtx, accountId: Id<"accounts">) {
  const rows = await ctx.db
    .query("tpmoApprovals")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  const sorted = rows.sort((a, b) => b.requestedAt - a.requestedAt);
  return {
    approved: sorted.some((r) => r.status === "approved" && !r.revokedAt),
    pending: sorted.some((r) => r.status === "requested"),
    history: sorted,
  };
}

export async function createTpmoRequest(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  requestedBy: Id<"users"> | undefined,
): Promise<Id<"tpmoApprovals">> {
  const addendum = await getPublishedLegalDocument(ctx, "medicare_tpmo_addendum");
  return await ctx.db.insert("tpmoApprovals", {
    accountId,
    status: "requested",
    requestedAt: Date.now(),
    requestedBy,
    attestationDocumentId: addendum?._id,
  });
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "compliance");
    const state = await tpmoState(ctx, viewer.account._id);
    const addendum = await getPublishedLegalDocument(ctx, "medicare_tpmo_addendum");
    return { ...state, addendum: addendum ? { id: addendum._id, title: addendum.title, version: addendum.version, content: addendum.content } : null };
  },
});

export const request = mutation({
  args: { attested: v.boolean() },
  handler: async (ctx, { attested }) => {
    const viewer = await requireAccountViewer(ctx, "compliance");
    assertAccountWritable(viewer.account, "Requesting TPMO approval");
    if (!attested) throw invalid("Please confirm the Medicare TPMO attestation.");
    const state = await tpmoState(ctx, viewer.account._id);
    if (state.approved) throw invalid("Your account already holds TPMO approval.");
    if (state.pending) throw invalid("A request is already under review.");
    const id = await createTpmoRequest(ctx, viewer.account._id, viewer.userId);
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "tpmo.request",
      entityType: "tpmoApproval",
      entityId: id,
      accountId: viewer.account._id,
      summary: "Requested Medicare TPMO approval",
    });
    await notifyStaff(ctx, {
      type: "account",
      title: `TPMO request — ${viewer.account.name}`,
      body: "A Medicare TPMO approval is waiting for review.",
      link: `/admin/accounts/${viewer.account._id}?tab=compliance`,
    });
    return id;
  },
});

export const forAccount = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    await requireStaff(ctx, "accounts.read");
    return await tpmoState(ctx, accountId);
  },
});

export const pending = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "tpmo.decide");
    const rows = await ctx.db
      .query("tpmoApprovals")
      .withIndex("by_status", (q) => q.eq("status", "requested"))
      .collect();
    const out = [];
    for (const row of rows) {
      const account = await ctx.db.get(row.accountId);
      out.push({ ...row, accountName: account?.name ?? "—", accountStatus: account?.status ?? null });
    }
    return out.sort((a, b) => a.requestedAt - b.requestedAt);
  },
});

export const decide = mutation({
  args: { approvalId: v.id("tpmoApprovals"), decision: v.union(v.literal("approved"), v.literal("rejected")), notes: v.string() },
  handler: async (ctx, { approvalId, decision, notes }) => {
    const staff = await requireStaff(ctx, "tpmo.decide");
    const approval = await ctx.db.get(approvalId);
    if (!approval || approval.status !== "requested") throw notFound("Pending TPMO request");
    if (notes.trim().length < 3) throw invalid("Decision notes are required.");
    await ctx.db.patch(approvalId, { status: decision, decidedAt: Date.now(), decidedBy: staff.userId, decisionNotes: notes.trim() });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: decision === "approved" ? "tpmo.approve" : "tpmo.reject",
      entityType: "tpmoApproval",
      entityId: approvalId,
      accountId: approval.accountId,
      summary: `Medicare TPMO ${decision}: ${notes.trim()}`,
    });
    await notifyAccount(ctx, {
      accountId: approval.accountId,
      type: "licence",
      title: decision === "approved" ? "Medicare TPMO approved" : "Medicare TPMO not approved",
      body: decision === "approved" ? "Medicare leads can now be released to you when your licences and preferences match." : `Your TPMO request was not approved: ${notes.trim()}`,
      link: "/agent/licenses",
    });
  },
});

export const revoke = mutation({
  args: { approvalId: v.id("tpmoApprovals"), reason: v.string() },
  handler: async (ctx, { approvalId, reason }) => {
    const staff = await requireStaff(ctx, "tpmo.decide");
    const approval = await ctx.db.get(approvalId);
    if (!approval || approval.status !== "approved" || approval.revokedAt) throw notFound("Active TPMO approval");
    if (reason.trim().length < 5) throw invalid("A reason is required.");
    await ctx.db.patch(approvalId, { status: "revoked", revokedAt: Date.now(), revokedBy: staff.userId, decisionNotes: reason.trim() });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "tpmo.revoke",
      entityType: "tpmoApproval",
      entityId: approvalId,
      accountId: approval.accountId,
      summary: `Medicare TPMO revoked: ${reason.trim()}`,
    });
    await notifyAccount(ctx, {
      accountId: approval.accountId,
      type: "licence",
      title: "Medicare TPMO approval revoked",
      body: `Medicare leads will no longer be released to you: ${reason.trim()}`,
      link: "/agent/licenses",
    });
  },
});
