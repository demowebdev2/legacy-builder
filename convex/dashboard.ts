import { DAY, startOfLocalDay } from "../src/domain/time";
import { query } from "./_generated/server";
import { currentEoPolicy } from "./eoPolicies";
import { getBalanceDoc, summarizeBalance } from "./ledger";
import { canViewAssignment, isAccountReadOnly, requireAccountViewer } from "./lib/auth";
import { loadCoverageTypes } from "./lib/settings";

/** Sidebar pills: new leads, pending disputes, unread notifications. */
export const agentNavCounts = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "leads.read");
    const newLeads = (
      await ctx.db
        .query("leadAssignments")
        .withIndex("by_account_status", (q) => q.eq("accountId", viewer.account._id).eq("status", "new"))
        .collect()
    ).filter((a) => !a.revokedAt && canViewAssignment(viewer, a)).length;
    const disputes = await ctx.db.query("disputes").withIndex("by_account", (q) => q.eq("accountId", viewer.account._id)).collect();
    const unread = (await ctx.db.query("notifications").withIndex("by_account", (q) => q.eq("accountId", viewer.account._id)).order("desc").take(200)).filter(
      (n) => !n.readAt,
    ).length;
    return { newLeads, pendingDisputes: disputes.filter((d) => d.status === "pending").length, unread };
  },
});

/** Agent dashboard — everything is scoped to the caller's own account (and seat, for producers). */
export const agent = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "leads.read");
    const account = viewer.account;
    const now = Date.now();
    const prefs = await ctx.db.query("agentPreferences").withIndex("by_account", (q) => q.eq("accountId", account._id)).unique();
    const balance = summarizeBalance(await getBalanceDoc(ctx, account._id));
    const assignments = (
      await ctx.db
        .query("leadAssignments")
        .withIndex("by_account_assignedAt", (q) => q.eq("accountId", account._id))
        .order("desc")
        .take(1000)
    ).filter((a) => !a.revokedAt && canViewAssignment(viewer, a));
    const coverage = new Map((await loadCoverageTypes(ctx, true)).map((c) => [c.key, c.name]));

    const newOnes = assignments.filter((a) => a.status === "new");
    const dayStart = startOfLocalDay(now, account.timezone);
    const releasedToday = assignments.filter((a) => a.assignedAt >= dayStart).length;
    const recent90 = assignments.filter((a) => a.assignedAt >= now - 90 * DAY);
    const contacted = recent90.filter((a) => a.contactedAt != null || a.status !== "new").length;
    const latest = [];
    for (const a of assignments.slice(0, 7)) {
      const lead = await ctx.db.get(a.leadId);
      if (!lead) continue;
      latest.push({
        assignmentId: a._id,
        name: `${lead.firstName} ${lead.lastName}`,
        reference: lead.reference,
        coverageName: coverage.get(lead.coverageType) ?? lead.coverageType,
        city: lead.city ?? null,
        state: lead.state,
        leadType: a.leadType,
        status: a.status,
        assignedAt: a.assignedAt,
      });
    }
    const orders = await ctx.db.query("orders").withIndex("by_account", (q) => q.eq("accountId", account._id)).collect();
    const paid = orders.filter((o) => o.status === "paid" || o.status === "partially_refunded");
    const eo = await currentEoPolicy(ctx, account._id);
    const seats =
      account.type === "agency"
        ? (await ctx.db.query("agencyMembers").withIndex("by_account", (q) => q.eq("accountId", account._id)).collect()).filter(
            (m) => m.status !== "deactivated",
          ).length
        : 1;
    const activity = await ctx.db.query("notifications").withIndex("by_account", (q) => q.eq("accountId", account._id)).order("desc").take(4);
    const coverageTotal = (await loadCoverageTypes(ctx)).length;

    return {
      now,
      role: viewer.role,
      account: {
        name: account.name,
        type: account.type,
        status: account.status,
        statusReason: account.statusReason ?? null,
        readOnly: isAccountReadOnly(account),
        declinedPurchaseOutstanding: account.declinedPurchaseOutstanding,
      },
      preferences: prefs
        ? {
            dailyPace: prefs.dailyPace,
            paused: prefs.paused && (!prefs.pausedUntil || prefs.pausedUntil > now),
            pausedUntil: prefs.pausedUntil ?? null,
            coverageCount: prefs.coverageTypes.length,
            coverageTotal,
            states: prefs.states,
            autoReloadEnabled: prefs.autoReloadEnabled,
            autoReloadThreshold: prefs.autoReloadThreshold,
            autoReloadQuantity: prefs.autoReloadQuantity,
          }
        : null,
      balance,
      purchases: {
        leadsBought: paid.reduce((s, o) => s + o.quantity, 0),
        exclusiveBought: paid.reduce((s, o) => s + o.exclusiveQty, 0),
        standardBought: paid.reduce((s, o) => s + o.standardQty, 0),
        orderCount: paid.length,
      },
      stats: {
        newUnopened: newOnes.length,
        oldestNewAt: newOnes.length ? Math.min(...newOnes.map((a) => a.assignedAt)) : null,
        releasedToday,
        contactRate: recent90.length ? Math.round((contacted / recent90.length) * 100) : 0,
      },
      pipeline: {
        total: assignments.length,
        new: newOnes.length,
        contacted: assignments.filter((a) => a.status === "contacted").length,
        qualified: assignments.filter((a) => a.status === "qualified").length,
        sold: assignments.filter((a) => a.status === "sold").length,
      },
      latest,
      eoExpiresAt: eo?.expiresAt ?? null,
      seats,
      activity: activity.map((n) => ({ id: n._id, type: n.type, title: n.title, body: n.body, createdAt: n.createdAt })),
    };
  },
});
