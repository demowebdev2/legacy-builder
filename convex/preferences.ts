import { v } from "convex/values";
import { DAILY_PACE_OPTIONS, RECEIVING_END_HOURS, RECEIVING_START_HOURS } from "../src/domain/constants";
import { assertValidAutoReload, PurchaseRuleError } from "../src/domain/purchase";
import { DAY } from "../src/domain/time";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx, query } from "./_generated/server";
import { maybeTriggerAutoReload } from "./autoReload";
import { verifiedStates } from "./licenses";
import { writeAudit } from "./lib/audit";
import { type AccountViewer, actorFromViewer, assertAccountWritable, requireAccountViewer } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { loadCoverageTypes } from "./lib/settings";

/**
 * Agent preferences are hard limits applied by the distribution engine (rules 3, 4, 7, 10, 11).
 * They are never decorative.
 */

async function loadPrefs(ctx: MutationCtx, viewer: AccountViewer): Promise<Doc<"agentPreferences">> {
  const prefs = await ctx.db
    .query("agentPreferences")
    .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
    .unique();
  if (!prefs) throw notFound("Preferences");
  return prefs;
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "preferences");
    const prefs = await ctx.db
      .query("agentPreferences")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .unique();
    const dayStart = Date.now() - DAY;
    const recent = await ctx.db
      .query("leadAssignments")
      .withIndex("by_account_assignedAt", (q) => q.eq("accountId", viewer.account._id).gte("assignedAt", dayStart))
      .collect();
    return {
      preferences: prefs,
      verifiedStates: [...(await verifiedStates(ctx, viewer.account._id))],
      releasedLast24h: recent.filter((a) => !a.revokedAt).length,
      timezone: viewer.account.timezone,
    };
  },
});

export const update = mutation({
  args: {
    coverageTypes: v.optional(v.array(v.string())),
    states: v.optional(v.array(v.string())),
    dailyPace: v.optional(v.number()),
    receivingStartHour: v.optional(v.number()),
    receivingEndHour: v.optional(v.number()),
    notifyEmailOnLead: v.optional(v.boolean()),
    notifySmsOnLead: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireAccountViewer(ctx, "preferences");
    assertAccountWritable(viewer.account, "Changing preferences");
    const prefs = await loadPrefs(ctx, viewer);
    const patch: Partial<Doc<"agentPreferences">> = { updatedAt: Date.now(), updatedBy: viewer.userId };

    if (args.coverageTypes) {
      const valid = new Set((await loadCoverageTypes(ctx)).map((c) => c.key));
      const unique = [...new Set(args.coverageTypes)];
      if (!unique.length) throw invalid("You must take at least one product.");
      if (unique.some((k) => !valid.has(k))) throw invalid("Unknown product.");
      patch.coverageTypes = unique;
    }
    if (args.states) {
      const unique = [...new Set(args.states)];
      if (!unique.length) throw invalid("Keep at least one state, otherwise nothing can reach you.");
      const verified = await verifiedStates(ctx, viewer.account._id);
      const added = unique.filter((s) => !prefs.states.includes(s));
      const unlicensed = added.filter((s) => !verified.has(s));
      if (unlicensed.length) throw invalid(`${unlicensed.join(", ")} ${unlicensed.length === 1 ? "has" : "have"} no verified licence.`);
      patch.states = unique;
    }
    if (args.dailyPace !== undefined) {
      if (!(DAILY_PACE_OPTIONS as readonly number[]).includes(args.dailyPace)) throw invalid("Choose a listed daily pace.");
      patch.dailyPace = args.dailyPace;
    }
    const start = args.receivingStartHour ?? prefs.receivingStartHour;
    const end = args.receivingEndHour ?? prefs.receivingEndHour;
    if (args.receivingStartHour !== undefined && !(RECEIVING_START_HOURS as readonly number[]).includes(start)) throw invalid("Invalid start hour.");
    if (args.receivingEndHour !== undefined && !(RECEIVING_END_HOURS as readonly number[]).includes(end)) throw invalid("Invalid end hour.");
    if (start >= end) throw invalid("Receiving hours must end after they start.");
    patch.receivingStartHour = start;
    patch.receivingEndHour = end;
    if (args.notifyEmailOnLead !== undefined) patch.notifyEmailOnLead = args.notifyEmailOnLead;
    if (args.notifySmsOnLead !== undefined) patch.notifySmsOnLead = args.notifySmsOnLead;

    await ctx.db.patch(prefs._id, patch);
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "preferences.update",
      entityType: "account",
      entityId: viewer.account._id,
      accountId: viewer.account._id,
      summary: "Lead preferences updated",
      metadata: { changes: Object.keys(args) },
    });
  },
});

export const setPaused = mutation({
  args: { paused: v.boolean(), until: v.optional(v.number()) },
  handler: async (ctx, { paused, until }) => {
    const viewer = await requireAccountViewer(ctx, "preferences");
    assertAccountWritable(viewer.account, "Pausing lead flow");
    const prefs = await loadPrefs(ctx, viewer);
    if (paused && until !== undefined && (until <= Date.now() || until > Date.now() + 90 * DAY)) {
      throw invalid("Pause end date must be within the next 90 days.");
    }
    await ctx.db.patch(prefs._id, { paused, pausedUntil: paused ? until : undefined, updatedAt: Date.now(), updatedBy: viewer.userId });
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: paused ? "preferences.pause" : "preferences.resume",
      entityType: "account",
      entityId: viewer.account._id,
      accountId: viewer.account._id,
      summary: paused ? "Lead flow paused" : "Lead flow resumed",
    });
  },
});

export const setAutoReload = mutation({
  args: { enabled: v.boolean(), threshold: v.optional(v.number()), quantity: v.optional(v.number()) },
  handler: async (ctx, { enabled, threshold, quantity }) => {
    const viewer = await requireAccountViewer(ctx, "purchase");
    assertAccountWritable(viewer.account, "Auto-reload");
    const prefs = await loadPrefs(ctx, viewer);
    const nextThreshold = threshold ?? prefs.autoReloadThreshold;
    const nextQuantity = quantity ?? prefs.autoReloadQuantity;
    try {
      assertValidAutoReload(nextThreshold, nextQuantity);
    } catch (error) {
      throw invalid(error instanceof PurchaseRuleError ? error.message : "Invalid auto-reload settings.");
    }
    await ctx.db.patch(prefs._id, {
      autoReloadEnabled: enabled,
      autoReloadThreshold: nextThreshold,
      autoReloadQuantity: nextQuantity,
      updatedAt: Date.now(),
      updatedBy: viewer.userId,
    });
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "autoreload.update",
      entityType: "account",
      entityId: viewer.account._id,
      accountId: viewer.account._id,
      summary: enabled ? `Auto-reload on: ${nextQuantity} leads at a balance of ${nextThreshold}` : "Auto-reload off",
    });
    if (enabled) await maybeTriggerAutoReload(ctx, viewer.account._id);
  },
});
