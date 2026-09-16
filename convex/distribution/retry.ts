import { v } from "convex/values";
import { MINUTE } from "../../src/domain/time";
import { internal } from "../_generated/api";
import { internalAction, internalMutation } from "../_generated/server";
import { writeAudit } from "../lib/audit";
import { SYSTEM_ACTOR } from "../lib/auth";
import { notifyStaff } from "../lib/notify";
import { runDistribution } from "./engine";

/** Scheduled retry step. Stale jobs (superseded by a newer attempt or a requeue) are no-ops. */
export const retryLead = internalMutation({
  args: { leadId: v.id("leads"), attempt: v.number() },
  handler: async (ctx, { leadId, attempt }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead || lead.retryAttempt !== attempt) return { skipped: true };
    if (lead.status !== "unassigned_pending" && lead.status !== "partially_assigned" && lead.status !== "queued") {
      return { skipped: true };
    }
    const result = await runDistribution(ctx, leadId, { trigger: "retry" });
    return { skipped: false, outcome: result.outcome };
  },
});

/** ~2h after the first attempt: tell staff a lead is still waiting. */
export const alertIfUnassigned = internalMutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead || lead.status !== "unassigned_pending" || lead.adminAlertedAt) return;
    await ctx.db.patch(leadId, { adminAlertedAt: Date.now() });
    await notifyStaff(ctx, {
      type: "system",
      title: `Lead ${lead.reference} still unassigned`,
      body: `No eligible agent has taken this ${lead.leadType} ${lead.coverageType} lead in ${lead.state}. Diagnose it in the simulator.`,
      link: `/admin/leads/${leadId}`,
      relatedLeadId: leadId,
    });
  },
});

/** ~48h after the first attempt: stop retrying, mark unassignable, alert staff. Nothing is deleted. */
export const markUnassignableIfStill = internalMutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const lead = await ctx.db.get(leadId);
    if (!lead || lead.status !== "unassigned_pending") return;
    const now = Date.now();
    await ctx.db.patch(leadId, { status: "unassignable", unassignableAt: now, nextRetryAt: undefined });
    await writeAudit(ctx, SYSTEM_ACTOR, {
      action: "lead.unassignable",
      entityType: "lead",
      entityId: leadId,
      summary: `Lead ${lead.reference} marked unassignable after the retry ladder`,
    });
    await notifyStaff(ctx, {
      type: "system",
      title: `Lead ${lead.reference} is unassignable`,
      body: "The retry ladder finished without an eligible agent. Re-queue it or assign manually if an agent becomes eligible.",
      link: `/admin/leads/${leadId}`,
      relatedLeadId: leadId,
    });
  },
});

/** Safety net for lost scheduled jobs (cron, every 5 minutes). */
export const sweepOverdueRetries = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 2 * MINUTE;
    let scheduled = 0;
    for (const status of ["unassigned_pending", "partially_assigned"] as const) {
      const overdue = await ctx.db
        .query("leads")
        .withIndex("by_status_nextRetryAt", (q) => q.eq("status", status).gt("nextRetryAt", 0).lte("nextRetryAt", cutoff))
        .take(50);
      for (const lead of overdue) {
        await ctx.scheduler.runAfter(0, internal.distribution.retry.retryLead, { leadId: lead._id, attempt: lead.retryAttempt });
        scheduled++;
      }
    }
    return { scheduled };
  },
});

/** Releases held leads oldest-first, one transaction per lead. */
export const releaseQueueWorker = internalAction({
  args: { leadIds: v.array(v.id("leads")) },
  handler: async (ctx, { leadIds }) => {
    let assigned = 0;
    for (const leadId of leadIds) {
      const result = await ctx.runMutation(internal.distribution.engine.processLead, { leadId, trigger: "release_queue" });
      assigned += result.assigned;
    }
    return { considered: leadIds.length, assigned };
  },
});
