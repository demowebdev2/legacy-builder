import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, requireAccountViewer, requireStaff } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { notifyAccount } from "./lib/notify";

export async function currentEoPolicy(ctx: QueryCtx | MutationCtx, accountId: Id<"accounts">) {
  const rows = await ctx.db
    .query("eoPolicies")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  return rows.filter((p) => !p.supersededAt).sort((a, b) => b.submittedAt - a.submittedAt)[0] ?? null;
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "compliance");
    const rows = await ctx.db
      .query("eoPolicies")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .collect();
    return rows.sort((a, b) => b.submittedAt - a.submittedAt);
  },
});

export const submit = mutation({
  args: { carrier: v.string(), policyNumber: v.optional(v.string()), expiresAt: v.number(), documentStorageId: v.optional(v.id("_storage")) },
  handler: async (ctx, args) => {
    // Allowed while suspended: renewal evidence is exactly how a suspension for lapsed E&O is lifted.
    const viewer = await requireAccountViewer(ctx, "compliance");
    const carrier = args.carrier.trim();
    if (carrier.length < 2) throw invalid("Enter the E&O carrier.");
    if (args.expiresAt <= Date.now()) throw invalid("That policy has already expired.");
    const id = await ctx.db.insert("eoPolicies", {
      accountId: viewer.account._id,
      carrier,
      policyNumber: args.policyNumber?.trim() || undefined,
      expiresAt: args.expiresAt,
      verificationStatus: "unverified",
      documentStorageId: args.documentStorageId,
      submittedAt: Date.now(),
      submittedBy: viewer.userId,
    });
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "eo.submit",
      entityType: "eoPolicy",
      entityId: id,
      accountId: viewer.account._id,
      summary: `Submitted E&O policy (${carrier}) for review`,
    });
    return id;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAccountViewer(ctx, "compliance");
    return await ctx.storage.generateUploadUrl();
  },
});

export const forAccount = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    await requireStaff(ctx, "accounts.read");
    const rows = await ctx.db
      .query("eoPolicies")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    return await Promise.all(
      rows
        .sort((a, b) => b.submittedAt - a.submittedAt)
        .map(async (p) => ({ ...p, documentUrl: p.documentStorageId ? await ctx.storage.getUrl(p.documentStorageId) : null })),
    );
  },
});

export const pending = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "licenses.verify");
    const rows = await ctx.db
      .query("eoPolicies")
      .withIndex("by_status", (q) => q.eq("verificationStatus", "unverified"))
      .collect();
    const out = [];
    for (const row of rows.filter((r) => !r.supersededAt)) {
      const account = await ctx.db.get(row.accountId);
      if (!account || account.status === "rejected" || account.status === "closed") continue;
      out.push({ ...row, accountName: account?.name ?? "—", accountStatus: account?.status ?? null });
    }
    return out.sort((a, b) => a.submittedAt - b.submittedAt);
  },
});

export const verify = mutation({
  args: { policyId: v.id("eoPolicies"), decision: v.union(v.literal("verified"), v.literal("failed")), notes: v.optional(v.string()) },
  handler: async (ctx, { policyId, decision, notes }) => {
    const staff = await requireStaff(ctx, "licenses.verify");
    const policy = await ctx.db.get(policyId);
    if (!policy || policy.supersededAt) throw notFound("E&O policy");
    if (decision === "failed" && !notes?.trim()) throw invalid("Explain why the evidence failed review.");
    const now = Date.now();
    await ctx.db.patch(policyId, { verificationStatus: decision, verificationNotes: notes?.trim() || undefined, verifiedAt: now, verifiedBy: staff.userId });
    if (decision === "verified") {
      const others = await ctx.db
        .query("eoPolicies")
        .withIndex("by_account", (q) => q.eq("accountId", policy.accountId))
        .collect();
      for (const other of others) if (other._id !== policyId && !other.supersededAt) await ctx.db.patch(other._id, { supersededAt: now });
    }
    await writeAudit(ctx, actorFromViewer(staff), {
      action: decision === "verified" ? "eo.verify" : "eo.fail",
      entityType: "eoPolicy",
      entityId: policyId,
      accountId: policy.accountId,
      summary: `E&O (${policy.carrier}) ${decision}${notes?.trim() ? `: ${notes.trim()}` : ""}`,
    });
    await notifyAccount(ctx, {
      accountId: policy.accountId,
      type: "licence",
      title: decision === "verified" ? "E&O cover verified" : "E&O evidence needs attention",
      body: decision === "verified" ? `Your ${policy.carrier} policy is on file.` : `We could not accept your E&O evidence: ${notes?.trim()}`,
      link: "/agent/licenses",
    });
  },
});
