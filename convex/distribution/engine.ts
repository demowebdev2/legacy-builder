import { v } from "convex/values";
import { type DistributionSettings, recipientTarget } from "../../src/domain/distribution";
import { MINUTE } from "../../src/domain/time";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { templates } from "../integrations/templates";
import type { Actor } from "../lib/auth";
import { SYSTEM_ACTOR } from "../lib/auth";
import { loadDistributionSettings } from "../lib/settings";
import { findActiveSuppression } from "../suppression";
import { releaseLeadToAccount } from "./assignment";
import { type EvaluatedCandidate, evaluateLead, scoreSnapshot, toEligibilityLead } from "./evaluate";

export type DistributionTrigger = Doc<"distributionRuns">["trigger"];

export interface DistributionOutcome {
  outcome: Doc<"distributionRuns">["outcome"];
  assigned: Array<{ assignmentId: Id<"leadAssignments">; accountId: Id<"accounts">; accountName: string }>;
  eligibleCount: number;
  evaluatedCount: number;
  slotsTarget: number;
  reason?: string;
  runId?: Id<"distributionRuns">;
}

const AUTOMATIC_STATUSES = new Set(["queued", "unassigned_pending", "partially_assigned"]);
const MANUAL_STATUSES = new Set(["queued", "unassigned_pending", "partially_assigned", "unassignable"]);
const MAX_TRACE_ROWS = 200;

function summarizeRejections(evaluated: EvaluatedCandidate[]): string {
  if (!evaluated.length) return "No approved accounts to evaluate";
  const counts = new Map<string, number>();
  for (const e of evaluated) {
    const reason = e.result.failedRule?.label;
    if (reason) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top
    ? `No eligible account — most common block: "${top[0]}" (${top[1]} of ${evaluated.length})`
    : "No eligible account passed every filter";
}

/** Chooses the next retry step that is still in the future. Returns null when the ladder is exhausted. */
export function nextRetryStep(settings: DistributionSettings, baseAt: number, fromAttempt: number, now: number) {
  for (let i = fromAttempt; i < settings.retryScheduleMinutes.length; i++) {
    const at = baseAt + settings.retryScheduleMinutes[i] * MINUTE;
    if (at > now) return { attempt: i + 1, at };
  }
  return null;
}

/**
 * THE DISTRIBUTION ENGINE — one lead, one transaction.
 * compliance re-check → evaluate every candidate → rank → release to the top N → ledger debits →
 * lead status → run trace → retry scheduling. Everything commits atomically.
 */
export async function runDistribution(
  ctx: MutationCtx,
  leadId: Id<"leads">,
  options: { trigger: DistributionTrigger; actor?: Actor; now?: number; mode?: "live" | "backfill" },
): Promise<DistributionOutcome> {
  const live = options.mode !== "backfill";
  const now = options.now ?? Date.now();
  const actor = options.actor ?? SYSTEM_ACTOR;
  const lead = await ctx.db.get(leadId);
  const skipped = (reason: string): DistributionOutcome => ({
    outcome: "skipped",
    assigned: [],
    eligibleCount: 0,
    evaluatedCount: 0,
    slotsTarget: lead?.recipientTarget ?? 0,
    reason,
  });
  if (!lead) return skipped("Lead not found");
  const allowed = options.trigger === "requeue" || options.trigger === "manual" ? MANUAL_STATUSES : AUTOMATIC_STATUSES;
  if (!allowed.has(lead.status)) return skipped(`Lead is ${lead.status.replace(/_/g, " ")}`);

  const { settings, versionId } = await loadDistributionSettings(ctx);
  const target = Math.max(recipientTarget(lead.leadType, settings), lead.assignedCount);

  const recordRun = async (fields: Partial<Doc<"distributionRuns">> & Pick<Doc<"distributionRuns">, "outcome">) =>
    await ctx.db.insert("distributionRuns", {
      leadId,
      trigger: options.trigger,
      startedAt: now,
      settingsVersionId: versionId ?? undefined,
      engineEnabled: settings.engineEnabled,
      slotsTarget: target,
      slotsFilledBefore: lead.assignedCount,
      evaluatedCount: 0,
      eligibleCount: 0,
      assignedCount: 0,
      actorUserId: actor.kind === "user" ? actor.userId : undefined,
      trace: [],
      traceTruncated: false,
      ...fields,
    });

  // Compliance is re-checked at release time, not just at capture.
  if (lead.withdrawnAt) {
    await ctx.db.patch(leadId, { status: "withdrawn", nextRetryAt: undefined });
    await recordRun({ outcome: "skipped", reason: "Consumer withdrew consent" });
    return skipped("Consumer withdrew consent");
  }
  const suppression = await findActiveSuppression(ctx, { phone: lead.phone, email: lead.email });
  if (suppression) {
    await ctx.db.patch(leadId, { status: "suppressed", suppressedAt: now, nextRetryAt: undefined });
    const reason = `Contact is on the suppression register (${suppression.channel})`;
    const runId = await recordRun({ outcome: "skipped", reason });
    return { ...skipped(reason), runId };
  }

  if (!settings.engineEnabled) {
    if (lead.assignedCount === 0) await ctx.db.patch(leadId, { status: "queued", nextRetryAt: undefined });
    const reason = "Distribution is paused by admin — lead held in the queue, nothing lost";
    const runId = await recordRun({ outcome: "held", reason });
    return { outcome: "held", assigned: [], eligibleCount: 0, evaluatedCount: 0, slotsTarget: target, reason, runId };
  }

  const evaluation = await evaluateLead(ctx, await toEligibilityLead(ctx, lead), leadId, now, settings);
  const filledBefore = evaluation.activeAssignments.length;
  const slots = Math.max(0, target - filledBefore);

  const assigned: DistributionOutcome["assigned"] = [];
  for (const candidate of evaluation.ranked) {
    if (assigned.length >= slots) break;
    const assignmentId = await releaseLeadToAccount(ctx, {
      lead,
      accountId: candidate.account._id,
      method: "auto",
      actor,
      now,
      disputeWindowHours: settings.disputeWindowHours,
      settingsVersionId: versionId,
      scoreSnapshot: candidate.ranking ? scoreSnapshot(candidate.ranking) : undefined,
      mode: options.mode,
    });
    assigned.push({ assignmentId, accountId: candidate.account._id, accountName: candidate.account.name });
  }

  const filled = filledBefore + assigned.length;
  const outcome: DistributionOutcome["outcome"] =
    assigned.length === 0 ? "none" : filled >= target ? "assigned" : "partial";
  const reason =
    assigned.length === 0
      ? slots === 0
        ? "All recipient slots already filled"
        : summarizeRejections(evaluation.evaluated)
      : filled < target
        ? `${filled} of ${target} recipient slots filled — waiting for more eligible agents`
        : undefined;

  const assignedIds = new Set(assigned.map((a) => a.accountId));
  const traceRows = [...evaluation.evaluated].sort((a, b) => Number(b.result.eligible) - Number(a.result.eligible));
  const trace = traceRows.slice(0, MAX_TRACE_ROWS).map((e) => ({
    accountId: e.account._id,
    accountName: e.account.name,
    eligible: e.result.eligible,
    failedRule: e.result.failedRule?.label,
    rules: e.result.trace,
    score: e.ranking ? scoreSnapshot(e.ranking) : undefined,
    assigned: assignedIds.has(e.account._id),
  }));
  const runId = await recordRun({
    outcome,
    reason,
    slotsFilledBefore: filledBefore,
    evaluatedCount: evaluation.evaluated.length,
    eligibleCount: evaluation.ranked.length,
    assignedCount: assigned.length,
    trace,
    traceTruncated: traceRows.length > MAX_TRACE_ROWS || evaluation.truncated,
  });
  for (const a of assigned) await ctx.db.patch(a.assignmentId, { distributionRunId: runId });

  // Lead state + retry ladder
  const patch: Partial<Doc<"leads">> = {
    assignedCount: filled,
    recipientTarget: target,
    status: filled >= target ? "assigned" : filled > 0 ? "partially_assigned" : "unassigned_pending",
    firstAssignedAt: lead.firstAssignedAt ?? (filled > 0 ? now : undefined),
  };
  if (filled < target && live) {
    const baseAt = lead.retryBaseAt ?? now;
    if (!lead.retryBaseAt) {
      patch.retryBaseAt = baseAt;
      await ctx.scheduler.runAt(baseAt + settings.adminAlertAfterMinutes * MINUTE, internal.distribution.retry.alertIfUnassigned, {
        leadId,
      });
      await ctx.scheduler.runAt(
        baseAt + settings.unassignableAfterMinutes * MINUTE,
        internal.distribution.retry.markUnassignableIfStill,
        { leadId },
      );
    }
    const next = nextRetryStep(settings, baseAt, lead.retryAttempt, now);
    if (next) {
      patch.retryAttempt = next.attempt;
      patch.nextRetryAt = next.at;
      await ctx.scheduler.runAt(next.at, internal.distribution.retry.retryLead, { leadId, attempt: next.attempt });
    } else {
      patch.nextRetryAt = undefined;
    }
  } else {
    patch.nextRetryAt = undefined;
  }
  await ctx.db.patch(leadId, patch);

  // BD-6: tell the consumer who received their request (once, at first release).
  if (live && assigned.length > 0 && !lead.consumerNotifiedAt) {
    const names = await Promise.all(
      assigned.map(async (a) => {
        const acc = await ctx.db.get(a.accountId);
        return acc?.businessName || acc?.name || "a licensed agent";
      }),
    );
    await ctx.db.patch(leadId, { consumerNotifiedAt: now });
    await ctx.scheduler.runAfter(0, internal.integrations.messaging.sendTransactionalEmail, {
      to: lead.email,
      template: "consumer_matched",
      leadId,
      ...templates.consumerMatched(lead.reference, names),
    });
  }

  return {
    outcome,
    assigned,
    eligibleCount: evaluation.ranked.length,
    evaluatedCount: evaluation.evaluated.length,
    slotsTarget: target,
    reason,
    runId,
  };
}

export const processLead = internalMutation({
  args: {
    leadId: v.id("leads"),
    trigger: v.union(v.literal("capture"), v.literal("release_queue")),
  },
  handler: async (ctx, { leadId, trigger }) => {
    const result = await runDistribution(ctx, leadId, { trigger });
    return { outcome: result.outcome, assigned: result.assigned.length };
  },
});
