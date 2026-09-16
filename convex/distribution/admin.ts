import { v } from "convex/values";
import { assertValidDistributionSettings, type DistributionSettings, recipientTarget } from "../../src/domain/distribution";
import { DAY } from "../../src/domain/time";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { mutation, type MutationCtx, query } from "../_generated/server";
import { writeAudit } from "../lib/audit";
import { actorFromViewer, requireStaff, type StaffViewer } from "../lib/auth";
import { invalid } from "../lib/errors";
import { loadDistributionSettings } from "../lib/settings";
import { rankingWeightsV } from "../lib/validators";
import { ELIGIBILITY_RULES } from "./rules";
import { evaluateLead, toEligibilityLead } from "./evaluate";

async function saveSettingsVersion(ctx: MutationCtx, staff: StaffViewer, next: DistributionSettings, note: string) {
  try {
    assertValidDistributionSettings(next);
  } catch (error) {
    throw invalid(error instanceof Error ? error.message : "Invalid settings.");
  }
  const { settings: previous } = await loadDistributionSettings(ctx);
  const id = await ctx.db.insert("distributionSettings", {
    ...next,
    createdAt: Date.now(),
    createdBy: staff.userId,
    createdByName: staff.name,
    note,
  });
  const changed = (Object.keys(next) as (keyof DistributionSettings)[]).filter(
    (k) => JSON.stringify(next[k]) !== JSON.stringify(previous[k]),
  );
  await writeAudit(ctx, actorFromViewer(staff), {
    action: "distribution.settings",
    entityType: "distributionSettings",
    entityId: id,
    summary: `${note}${changed.length ? ` (${changed.join(", ")})` : ""}`,
    metadata: { previous, next },
  });
  return id;
}

export const settings = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "distribution.read");
    const { settings, versionId } = await loadDistributionSettings(ctx);
    const history = await ctx.db.query("distributionSettings").withIndex("by_createdAt").order("desc").take(20);
    return {
      settings,
      versionId,
      history: history.map((h) => ({ id: h._id, createdAt: h.createdAt, createdByName: h.createdByName, note: h.note ?? null, weights: h.weights, standardRecipientCount: h.standardRecipientCount, engineEnabled: h.engineEnabled })),
      rules: ELIGIBILITY_RULES.map((r) => ({ key: r.key, label: r.label, hard: r.hard })),
    };
  },
});

export const updateSettings = mutation({
  args: {
    weights: v.optional(rankingWeightsV),
    standardRecipientCount: v.optional(v.number()),
    retryScheduleMinutes: v.optional(v.array(v.number())),
    adminAlertAfterMinutes: v.optional(v.number()),
    unassignableAfterMinutes: v.optional(v.number()),
    disputeWindowHours: v.optional(v.number()),
    starvationGuardHours: v.optional(v.number()),
    waitNormalizationHours: v.optional(v.number()),
    holdOnDeclinedPurchase: v.optional(v.boolean()),
    disputePenaltyThreshold: v.optional(v.number()),
    disputePenaltyMinAssignments: v.optional(v.number()),
    contactRateWindowDays: v.optional(v.number()),
    gradingMode: v.optional(v.union(v.literal("ratio"), v.literal("source"))),
    exclusiveEvery: v.optional(v.number()),
    dedupWindowDays: v.optional(v.number()),
    dedupMatchPhone: v.optional(v.boolean()),
    dedupMatchEmail: v.optional(v.boolean()),
    dedupSameCoverageOnly: v.optional(v.boolean()),
    note: v.string(),
  },
  handler: async (ctx, { note, ...changes }) => {
    const staff = await requireStaff(ctx, "distribution.manage");
    if (note.trim().length < 5) throw invalid("Describe why the settings are changing.");
    const { settings } = await loadDistributionSettings(ctx);
    const defined = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    return await saveSettingsVersion(ctx, staff, { ...settings, ...defined }, note.trim());
  },
});

export const setEngineEnabled = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const staff = await requireStaff(ctx, "distribution.manage");
    const { settings } = await loadDistributionSettings(ctx);
    if (settings.engineEnabled === enabled) return null;
    return await saveSettingsVersion(ctx, staff, { ...settings, engineEnabled: enabled }, enabled ? "Lead distribution switched ON" : "Lead distribution switched OFF");
  },
});

export const queueStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "distribution.read");
    const { settings } = await loadDistributionSettings(ctx);
    const held = [
      ...(await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", "queued")).collect()),
      ...(await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", "unassigned_pending")).collect()),
    ].sort((a, b) => a.capturedAt - b.capturedAt);
    const dayStart = Date.now() - DAY;
    const released = await ctx.db.query("leadAssignments").withIndex("by_assignedAt", (q) => q.gte("assignedAt", dayStart)).collect();
    return {
      engineEnabled: settings.engineEnabled,
      heldCount: held.length,
      oldestHeldAt: held[0]?.capturedAt ?? null,
      releasedLast24h: released.filter((a) => !a.revokedAt).length,
      standardRecipientCount: settings.standardRecipientCount,
    };
  },
});

/** Releases held leads oldest-first, one transaction per lead (scheduled worker). */
export const releaseQueue = mutation({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx, "distribution.manage");
    const { settings } = await loadDistributionSettings(ctx);
    if (!settings.engineEnabled) throw invalid("Turn distribution on before releasing the queue.");
    const held = [
      ...(await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", "queued")).collect()),
      ...(await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", "unassigned_pending")).collect()),
    ]
      .sort((a, b) => a.capturedAt - b.capturedAt)
      .slice(0, 200);
    const leadIds: Id<"leads">[] = held.map((l) => l._id);
    if (leadIds.length) await ctx.scheduler.runAfter(0, internal.distribution.retry.releaseQueueWorker, { leadIds });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "distribution.release_queue",
      entityType: "distribution",
      entityId: "queue",
      summary: `Released ${leadIds.length} held lead(s) oldest-first`,
    });
    return { considered: leadIds.length };
  },
});

/**
 * Simulator — runs the real rules and ranking against a hypothetical or existing lead. Read-only:
 * no assignment, no ledger entry, no notification.
 */
export const simulate = query({
  args: {
    leadId: v.optional(v.id("leads")),
    state: v.optional(v.string()),
    coverageType: v.optional(v.string()),
    leadType: v.optional(v.union(v.literal("exclusive"), v.literal("standard"))),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx, "distribution.read");
    const { settings } = await loadDistributionSettings(ctx);
    const now = Date.now();
    let base;
    if (args.leadId) {
      const lead = await ctx.db.get(args.leadId);
      if (!lead) return null;
      base = { state: lead.state, coverageType: lead.coverageType, leadType: lead.leadType };
    } else {
      base = { state: args.state ?? "GA", coverageType: args.coverageType ?? "life", leadType: args.leadType ?? ("standard" as const) };
    }
    const lead = await toEligibilityLead(ctx, base);
    const evaluation = await evaluateLead(ctx, lead, args.leadId ?? null, now, settings);
    const target = recipientTarget(lead.leadType, settings);
    const slots = Math.max(0, target - evaluation.activeAssignments.length);
    return {
      lead,
      engineEnabled: settings.engineEnabled,
      target,
      slots,
      alreadyAssigned: evaluation.activeAssignments.length,
      weights: settings.weights,
      starvationGuardHours: settings.starvationGuardHours,
      ranked: evaluation.ranked.map((e, i) => ({
        accountId: e.account._id,
        name: e.account.name,
        position: i + 1,
        receives: i < slots,
        waitedHours: e.snapshot.lastAssignedAt ? (now - e.snapshot.lastAssignedAt) / 3_600_000 : null,
        balanceOfType: e.snapshot.balance[lead.leadType],
        score: e.ranking!.score,
      })),
      evaluated: evaluation.evaluated.map((e) => ({
        accountId: e.account._id,
        name: e.account.name,
        eligible: e.result.eligible,
        balanceOfType: e.snapshot.balance[lead.leadType],
        trace: e.result.trace,
        failedRule: e.result.failedRule ?? null,
        score: e.ranking?.score.total ?? null,
      })),
      localHourNote: new Date(now).toISOString(),
    };
  },
});

export const runsForLead = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    await requireStaff(ctx, "distribution.read");
    return await ctx.db.query("distributionRuns").withIndex("by_lead", (q) => q.eq("leadId", leadId)).order("desc").take(50);
  },
});
