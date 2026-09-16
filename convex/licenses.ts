import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, requireAccountViewer, requireStaff } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { notifyAccount } from "./lib/notify";
import { loadServicedStates } from "./lib/settings";

/** Phase 1: manual verification, state by state. NIPR integration is Phase 2. */

type Ctx = QueryCtx | MutationCtx;

export async function currentLicenses(ctx: Ctx, accountId: Id<"accounts">, memberId?: Id<"agencyMembers">) {
  const rows = await ctx.db
    .query("licenses")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .collect();
  return rows
    .filter((l) => !l.supersededAt && (memberId ? l.memberId === memberId : !l.memberId))
    .sort((a, b) => a.state.localeCompare(b.state) || b.submittedAt - a.submittedAt);
}

export function isLicenseUsable(license: Pick<Doc<"licenses">, "verificationStatus" | "expiresAt">, now = Date.now()) {
  return license.verificationStatus === "verified" && license.expiresAt > now;
}

/** States the account holds a usable licence for — the only states it may select in preferences. */
export async function verifiedStates(ctx: Ctx, accountId: Id<"accounts">): Promise<Set<string>> {
  const now = Date.now();
  return new Set((await currentLicenses(ctx, accountId)).filter((l) => isLicenseUsable(l, now)).map((l) => l.state));
}

export const myLicenses = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "leads.read");
    if (viewer.role === "PRODUCER") {
      return { account: [], mine: viewer.member ? await currentLicenses(ctx, viewer.account._id, viewer.member._id) : [] };
    }
    return { account: await currentLicenses(ctx, viewer.account._id), mine: [] };
  },
});

export const submit = mutation({
  args: {
    state: v.string(),
    licenseNumber: v.string(),
    expiresAt: v.number(),
    memberId: v.optional(v.id("agencyMembers")),
  },
  handler: async (ctx, args) => {
    const viewer = await requireAccountViewer(ctx, "leads.read");
    const state = args.state.toUpperCase();
    const serviced = await loadServicedStates(ctx);
    if (!serviced.some((s) => s.code === state)) throw invalid("That state is not serviced.");
    const licenseNumber = args.licenseNumber.trim();
    if (licenseNumber.length < 3 || licenseNumber.length > 40) throw invalid("Enter the licence number.");
    if (args.expiresAt <= Date.now()) throw invalid("That licence has already expired.");

    let memberId: Id<"agencyMembers"> | undefined;
    if (viewer.role === "PRODUCER") {
      if (!viewer.member) throw invalid("No active seat.");
      memberId = viewer.member._id;
    } else if (args.memberId) {
      if (viewer.role !== "AGENCY_PRINCIPAL") throw invalid("Only an agency principal can add producer licences.");
      const member = await ctx.db.get(args.memberId);
      if (!member || member.accountId !== viewer.account._id) throw notFound("Producer seat");
      memberId = member._id;
    }

    const id = await ctx.db.insert("licenses", {
      accountId: viewer.account._id,
      memberId,
      state,
      licenseNumber,
      expiresAt: args.expiresAt,
      verificationStatus: "unverified",
      submittedAt: Date.now(),
      submittedBy: viewer.userId,
    });
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "license.submit",
      entityType: "license",
      entityId: id,
      accountId: viewer.account._id,
      summary: `Submitted ${state} licence ${licenseNumber} for verification${memberId ? " (producer seat)" : ""}`,
    });
    return id;
  },
});

// ─────────────────────────── staff ───────────────────────────

export const forAccount = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    await requireStaff(ctx, "accounts.read");
    const rows = await ctx.db
      .query("licenses")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    const members = new Map<string, string>();
    for (const row of rows) {
      if (row.memberId && !members.has(row.memberId)) members.set(row.memberId, (await ctx.db.get(row.memberId))?.name ?? "Producer");
    }
    return rows
      .sort((a, b) => a.state.localeCompare(b.state) || b.submittedAt - a.submittedAt)
      .map((l) => ({ ...l, memberName: l.memberId ? members.get(l.memberId) ?? null : null }));
  },
});

export const pending = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "licenses.verify");
    const rows = await ctx.db
      .query("licenses")
      .withIndex("by_status", (q) => q.eq("verificationStatus", "unverified"))
      .collect();
    const out = [];
    for (const row of rows.filter((r) => !r.supersededAt)) {
      const account = await ctx.db.get(row.accountId);
      if (!account || account.status === "rejected" || account.status === "closed") continue;
      const member = row.memberId ? await ctx.db.get(row.memberId) : null;
      out.push({ ...row, accountName: account?.name ?? "—", accountStatus: account?.status ?? null, memberName: member?.name ?? null });
    }
    return out.sort((a, b) => a.submittedAt - b.submittedAt);
  },
});

export const verify = mutation({
  args: {
    licenseId: v.id("licenses"),
    decision: v.union(v.literal("verified"), v.literal("failed")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { licenseId, decision, notes }) => {
    const staff = await requireStaff(ctx, "licenses.verify");
    const license = await ctx.db.get(licenseId);
    if (!license || license.supersededAt) throw notFound("Licence");
    if (decision === "failed" && !notes?.trim()) throw invalid("Explain why the licence failed verification.");
    if (decision === "verified" && license.expiresAt <= Date.now()) throw invalid("An expired licence cannot be verified.");
    const now = Date.now();
    await ctx.db.patch(licenseId, {
      verificationStatus: decision,
      verificationNotes: notes?.trim() || undefined,
      verifiedAt: now,
      verifiedBy: staff.userId,
    });
    if (decision === "verified") {
      const siblings = await ctx.db
        .query("licenses")
        .withIndex("by_account_state", (q) => q.eq("accountId", license.accountId).eq("state", license.state))
        .collect();
      for (const s of siblings) {
        if (s._id !== licenseId && !s.supersededAt && s.memberId === license.memberId) await ctx.db.patch(s._id, { supersededAt: now });
      }
      if (license.memberId) await refreshMemberVerification(ctx, license.memberId, staff.userId);
    }
    await writeAudit(ctx, actorFromViewer(staff), {
      action: decision === "verified" ? "license.verify" : "license.fail",
      entityType: "license",
      entityId: licenseId,
      accountId: license.accountId,
      summary: `${license.state} licence ${license.licenseNumber} ${decision}${notes?.trim() ? `: ${notes.trim()}` : ""}`,
    });
    await notifyAccount(ctx, {
      accountId: license.accountId,
      type: "licence",
      title: decision === "verified" ? `${license.state} licence verified` : `${license.state} licence could not be verified`,
      body:
        decision === "verified"
          ? `Your ${license.state} licence is verified and the state is eligible for distribution.`
          : `We could not verify your ${license.state} licence: ${notes?.trim()}. Upload a corrected licence to try again.`,
      link: "/agent/licenses",
    });
  },
});

/** A producer seat is verified once it holds at least one usable licence. */
export async function refreshMemberVerification(ctx: MutationCtx, memberId: Id<"agencyMembers">, verifiedBy?: Id<"users">) {
  const member = await ctx.db.get(memberId);
  if (!member || member.seatRole === "billing_contact") return;
  const licenses = await currentLicenses(ctx, member.accountId, memberId);
  const usable = licenses.some((l) => isLicenseUsable(l));
  const principalUsable = member.seatRole === "principal" && (await verifiedStates(ctx, member.accountId)).size > 0;
  const verified = usable || principalUsable;
  if (verified && member.verificationStatus !== "verified") {
    await ctx.db.patch(memberId, { verificationStatus: "verified", verifiedAt: Date.now(), verifiedBy });
  }
}
