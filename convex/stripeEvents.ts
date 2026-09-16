import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/** Webhook idempotency: returns false when the event was already processed successfully. */
export const begin = internalMutation({
  args: { eventId: v.string(), type: v.string() },
  handler: async (ctx, { eventId, type }) => {
    const existing = await ctx.db
      .query("stripeEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique();
    if (existing?.processedAt && !existing.error) return false;
    if (!existing) await ctx.db.insert("stripeEvents", { eventId, type, receivedAt: Date.now() });
    return true;
  },
});

export const finish = internalMutation({
  args: { eventId: v.string(), error: v.optional(v.string()) },
  handler: async (ctx, { eventId, error }) => {
    const existing = await ctx.db
      .query("stripeEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { processedAt: Date.now(), error });
  },
});
