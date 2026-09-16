import { v } from "convex/values";
import { roleHasPermission } from "../src/domain/permissions";
import { DAY, HOUR } from "../src/domain/time";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireStaff } from "./lib/auth";
import { integrationStatus } from "./lib/env";
import { loadCoverageTypes, loadDistributionSettings, loadPricing } from "./lib/settings";

const SCAN = 5000;

async function recentLeads(ctx: QueryCtx, since: number) {
  return await ctx.db.query("leads").withIndex("by_capturedAt", (q) => q.gte("capturedAt", since)).take(SCAN);
}

async function recentAssignments(ctx: QueryCtx, since: number) {
  return (await ctx.db.query("leadAssignments").withIndex("by_assignedAt", (q) => q.gte("assignedAt", since)).take(SCAN)).filter((a) => !a.revokedAt);
}

const isPaid = (o: Doc<"orders">) => o.status === "paid" || o.status === "partially_refunded";

/** The admin dashboard: four operating queues first, then trading stats. */
export const adminDashboard = query({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx, "reports.read");
    const now = Date.now();
    const pricing = await loadPricing(ctx);
    const cost = (t: "exclusive" | "standard") => (t === "exclusive" ? pricing.acquisitionCostExclusiveCents : pricing.acquisitionCostStandardCents);
    const { settings } = await loadDistributionSettings(ctx);

    const pending = await ctx.db.query("accounts").withIndex("by_status", (q) => q.eq("status", "pending_verification")).collect();
    let unbanked = 0;
    for (const a of pending) {
      const order = a.openingOrderId ? await ctx.db.get(a.openingOrderId) : null;
      if (order && order.status === "authorized") unbanked += order.totalCents;
    }
    const unassigned = await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", "unassigned_pending")).collect();
    const openDisputes = await ctx.db.query("disputes").withIndex("by_status", (q) => q.eq("status", "pending")).collect();
    const declined = (await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "failed")).collect()).filter((o) => !o.declineResolvedAt);

    const orders30 = (await ctx.db.query("orders").withIndex("by_createdAt", (q) => q.gte("createdAt", now - 30 * DAY)).take(SCAN)).filter(isPaid);
    const leads24 = await recentLeads(ctx, now - DAY);
    const released24 = await recentAssignments(ctx, now - DAY);
    const activeAccounts = await ctx.db.query("accounts").withIndex("by_status", (q) => q.eq("status", "active")).collect();
    const runs24 = await ctx.db.query("distributionRuns").withIndex("by_startedAt", (q) => q.gte("startedAt", now - DAY)).take(SCAN);

    const canSeePii = roleHasPermission(staff.role, "leads.pii");
    const coverage = new Map((await loadCoverageTypes(ctx, true)).map((c) => [c.key, c.name]));
    const latestLeads = [];
    for (const lead of await ctx.db.query("leads").withIndex("by_capturedAt").order("desc").take(9)) {
      const holders = (await ctx.db.query("leadAssignments").withIndex("by_lead", (q) => q.eq("leadId", lead._id)).collect()).filter((a) => !a.revokedAt);
      const firstHolder = holders[0] ? await ctx.db.get(holders[0].accountId) : null;
      latestLeads.push({
        id: lead._id,
        reference: lead.reference,
        name: canSeePii ? `${lead.firstName} ${lead.lastName}` : `${lead.firstName.charAt(0)}. ${lead.lastName.charAt(0)}.`,
        coverageName: coverage.get(lead.coverageType) ?? lead.coverageType,
        city: lead.city ?? null,
        state: lead.state,
        leadType: lead.leadType,
        status: lead.status,
        holder: firstHolder?.name ?? null,
        holderCount: holders.length,
        capturedAt: lead.capturedAt,
      });
    }

    const allLeads30 = await recentLeads(ctx, now - 30 * DAY);
    const released30 = await recentAssignments(ctx, now - 30 * DAY);
    const balances = await ctx.db.query("accountBalances").collect();
    const supply = (["exclusive", "standard"] as const).map((type) => {
      const captured = allLeads30.filter((l) => l.leadType === type).length;
      const owed = balances.reduce((s, b) => s + b[type], 0);
      return {
        type,
        captured,
        released: released30.filter((a) => a.leadType === type).length,
        owed,
        costCents: cost(type),
        coverPercent: owed ? Math.min(Math.round((captured / owed) * 100), 100) : 100,
      };
    });

    return {
      queues: {
        verification: { count: pending.length, oldestAt: pending.length ? Math.min(...pending.map((a) => a.appliedAt)) : null, unbankedCents: unbanked },
        unassigned: { count: unassigned.length, oldestAt: unassigned.length ? Math.min(...unassigned.map((l) => l.capturedAt)) : null, atRiskCents: unassigned.reduce((s, l) => s + cost(l.leadType), 0) },
        disputes: { count: openDisputes.length, slaRisk: openDisputes.filter((d) => now - d.submittedAt > 40 * HOUR).length },
        declined: { count: declined.length, valueCents: declined.reduce((s, o) => s + o.totalCents, 0) },
      },
      stats: {
        sales30Cents: orders30.reduce((s, o) => s + o.totalCents - o.refundedCents, 0),
        leadsSold30: orders30.reduce((s, o) => s + o.quantity, 0),
        activeAccounts: activeAccounts.length,
        leads24: leads24.length,
        releases24: released24.length,
        spend24Cents: leads24.reduce((s, l) => s + cost(l.leadType), 0),
        engineEnabled: settings.engineEnabled,
        runs24: runs24.length,
      },
      latestLeads,
      supply,
    };
  },
});

/** Finance overview, transactions, declined charges and lead economics. */
export const finance = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "payments.read");
    const pricing = await loadPricing(ctx);
    const orders = await ctx.db.query("orders").withIndex("by_createdAt").order("desc").take(SCAN);
    const paid = orders.filter((o) => isPaid(o) || o.status === "refunded");
    const revenue = paid.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
    const activeAccounts = await ctx.db.query("accounts").withIndex("by_status", (q) => q.eq("status", "active")).collect();
    const accounts = await ctx.db.query("accounts").collect();
    const balances = await ctx.db.query("accountBalances").collect();
    const balanceByAccount = new Map(balances.map((b) => [b.accountId, b]));
    const atRisk = accounts.filter((a) => ["suspended", "blocked"].includes(a.status) || a.declinedPurchaseOutstanding);
    const leads = await ctx.db.query("leads").withIndex("by_capturedAt").order("desc").take(SCAN);
    const cost = (t: "exclusive" | "standard") => (t === "exclusive" ? pricing.acquisitionCostExclusiveCents : pricing.acquisitionCostStandardCents);
    const acquisitionSpend = leads.reduce((s, l) => s + cost(l.leadType), 0);
    const assignments = (await ctx.db.query("leadAssignments").withIndex("by_assignedAt").order("desc").take(SCAN)).filter((a) => !a.revokedAt);
    const outstanding = balances.reduce((s, b) => s + b.exclusive + b.standard, 0);
    const rate = { exclusive: pricing.exclusiveRateCents, standard: pricing.standardRateCents };
    const declined = orders.filter((o) => o.status === "failed" && !o.declineResolvedAt);
    const accountName = new Map(accounts.map((a) => [a._id, a.name]));

    return {
      pricing,
      overview: {
        revenueCents: revenue,
        orderCount: paid.length,
        perActiveAccountCents: activeAccounts.length ? Math.round(revenue / activeAccounts.length) : 0,
        activeAccounts: activeAccounts.length,
        atRisk: atRisk.length,
        frozenLeads: atRisk.reduce((s, a) => s + (balanceByAccount.get(a._id)?.exclusive ?? 0) + (balanceByAccount.get(a._id)?.standard ?? 0), 0),
        byKind: (["opening", "top_up", "bundle", "auto_reload"] as const).map((kind) => {
          const rows = paid.filter((o) => o.kind === kind);
          return { kind, orders: rows.length, leads: rows.reduce((s, o) => s + o.quantity, 0), valueCents: rows.reduce((s, o) => s + o.totalCents - o.refundedCents, 0) };
        }),
      },
      declined: declined.map((o) => ({ ...o, accountName: accountName.get(o.accountId) ?? "—" })),
      economics: {
        acquisitionSpendCents: acquisitionSpend,
        leadsAcquired: leads.length,
        blendedCplCents: leads.length ? Math.round(acquisitionSpend / leads.length) : 0,
        leadsSold: paid.reduce((s, o) => s + o.quantity, 0),
        released: assignments.length,
        outstanding,
        byType: (["exclusive", "standard"] as const).map((type) => {
          const sold = paid.reduce((s, o) => s + (type === "exclusive" ? o.exclusiveQty : o.standardQty), 0);
          const margin = rate[type] ? Math.round(((rate[type] - cost(type)) / rate[type]) * 100) : 0;
          return { type, rateCents: rate[type], sold, revenueCents: sold * rate[type], costCents: cost(type), grossCents: rate[type] - cost(type), marginPercent: margin };
        }),
      },
    };
  },
});

/** Operational reporting (brief §REPORTING). Bounded scans; suitable for Phase 1 volumes. */
export const operations = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    const staff = await requireStaff(ctx, "reports.read");
    const window = Math.min(Math.max(days ?? 30, 1), 365);
    const now = Date.now();
    const since = now - window * DAY;
    const pricing = await loadPricing(ctx);
    const leads = await recentLeads(ctx, since);
    const assignments = await recentAssignments(ctx, since);
    const coverage = new Map((await loadCoverageTypes(ctx, true)).map((c) => [c.key, c.name]));

    const byDay = new Map<string, number>();
    for (let i = window - 1; i >= 0; i--) byDay.set(new Date(now - i * DAY).toISOString().slice(0, 10), 0);
    for (const l of leads) {
      const key = new Date(l.capturedAt).toISOString().slice(0, 10);
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const count = <T>(rows: T[], key: (r: T) => string) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
      return [...m.entries()].map(([k, n]) => ({ key: k, count: n })).sort((a, b) => b.count - a.count);
    };
    const distributable = leads.filter((l) => !["duplicate", "out_of_area", "rejected", "suppressed"].includes(l.status));
    const assignedLeads = distributable.filter((l) => l.assignedCount > 0).length;

    const accounts = await ctx.db.query("accounts").collect();
    const accountName = new Map(accounts.map((a) => [a._id, a.name]));
    const deliveries = count(assignments, (a) => a.accountId).map((r) => ({ accountId: r.key, name: accountName.get(r.key as Doc<"accounts">["_id"]) ?? "—", releases: r.count }));
    const disputes = await ctx.db.query("disputes").collect();
    const recentDisputes = disputes.filter((d) => d.submittedAt >= since);
    const disputeRates = deliveries.slice(0, 25).map((d) => {
      const own = recentDisputes.filter((x) => x.accountId === d.accountId);
      return { ...d, disputes: own.length, upheld: own.filter((x) => x.status === "upheld").length, ratePercent: d.releases ? Math.round((own.length / d.releases) * 100) : 0 };
    });

    const orders = (await ctx.db.query("orders").withIndex("by_createdAt", (q) => q.gte("createdAt", since)).take(SCAN));
    const paid = orders.filter(isPaid);
    const balances = await ctx.db.query("accountBalances").collect();
    const liability = balances
      .filter((b) => b.exclusive + b.standard > 0)
      .map((b) => ({
        accountId: b.accountId,
        name: accountName.get(b.accountId) ?? "—",
        status: accounts.find((a) => a._id === b.accountId)?.status ?? "—",
        exclusive: b.exclusive,
        standard: b.standard,
        valueCents: b.exclusive * pricing.exclusiveRateCents + b.standard * pricing.standardRateCents,
        fulfilmentCostCents: b.exclusive * pricing.acquisitionCostExclusiveCents + b.standard * pricing.acquisitionCostStandardCents,
      }))
      .sort((a, b) => b.valueCents - a.valueCents);
    const canSeePii = roleHasPermission(staff.role, "leads.pii");

    return {
      window,
      leadVolume: { total: leads.length, byDay: [...byDay.entries()].map(([date, n]) => ({ date, count: n })) },
      assignmentRate: { distributable: distributable.length, assigned: assignedLeads, percent: distributable.length ? Math.round((assignedLeads / distributable.length) * 100) : 0, releases: assignments.length },
      unassigned: leads.filter((l) => l.status === "unassigned_pending" || l.status === "unassignable").length,
      byStatus: count(leads, (l) => l.status),
      byLeadType: count(leads, (l) => l.leadType),
      byCoverage: count(leads, (l) => coverage.get(l.coverageType) ?? l.coverageType),
      bySource: count(leads, (l) => l.marketingSource ?? l.source),
      byState: count(leads, (l) => l.state),
      reasons: leads
        .slice(-25)
        .reverse()
        .map((l) => ({ reference: l.reference, reason: canSeePii ? l.reason : l.reason.slice(0, 140), coverageName: coverage.get(l.coverageType) ?? l.coverageType, capturedAt: l.capturedAt })),
      deliveries: deliveries.slice(0, 25),
      disputeRates,
      disputeTotals: { total: recentDisputes.length, upheld: recentDisputes.filter((d) => d.status === "upheld").length, pending: recentDisputes.filter((d) => d.status === "pending").length },
      purchases: {
        orders: paid.length,
        leads: paid.reduce((s, o) => s + o.quantity, 0),
        valueCents: paid.reduce((s, o) => s + o.totalCents - o.refundedCents, 0),
        declinedCount: orders.filter((o) => o.status === "failed").length,
        declinedCents: orders.filter((o) => o.status === "failed").reduce((s, o) => s + o.totalCents, 0),
      },
      liability: {
        rows: liability,
        exclusive: liability.reduce((s, r) => s + r.exclusive, 0),
        standard: liability.reduce((s, r) => s + r.standard, 0),
        valueCents: liability.reduce((s, r) => s + r.valueCents, 0),
        fulfilmentCostCents: liability.reduce((s, r) => s + r.fulfilmentCostCents, 0),
      },
      accounts: {
        byStatus: count(accounts, (a) => a.status),
        applications: accounts.filter((a) => a.appliedAt >= since).length,
        approvals: accounts.filter((a) => (a.approvedAt ?? 0) >= since).length,
      },
    };
  },
});

/** Admin sidebar pills. Each count is only returned to roles allowed to see the underlying queue. */
export const adminNavCounts = query({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx, "settings.read");
    const can = (p: Parameters<typeof roleHasPermission>[1]) => roleHasPermission(staff.role, p);
    const unassigned = can("leads.read") ? (await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", "unassigned_pending")).collect()).length : 0;
    const disputes = can("disputes.read") ? (await ctx.db.query("disputes").withIndex("by_status", (q) => q.eq("status", "pending")).collect()).length : 0;
    let attention = 0;
    let verification = 0;
    if (can("accounts.read")) {
      const accounts = await ctx.db.query("accounts").collect();
      attention = accounts.filter((a) => ["pending_verification", "action_required", "suspended", "blocked"].includes(a.status) || a.declinedPurchaseOutstanding).length;
      verification = accounts.filter((a) => a.status === "pending_verification").length;
    }
    const declined = can("payments.read")
      ? (await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", "failed")).collect()).filter((o) => !o.declineResolvedAt).length
      : 0;
    const support = can("support.manage") ? (await ctx.db.query("supportTickets").withIndex("by_status", (q) => q.eq("status", "open")).collect()).length : 0;
    return { unassigned, disputes, attention, verification, declined, support };
  },
});

export const integrations = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "settings.read");
    return integrationStatus();
  },
});
