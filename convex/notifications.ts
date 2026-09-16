import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAccountViewer, requireStaff } from "./lib/auth";
import { notFound } from "./lib/errors";

export const mine = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const viewer = await requireAccountViewer(ctx, "notifications", { allowPending: true });
    return await ctx.db
      .query("notifications")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const myUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "notifications", { allowPending: true });
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .order("desc")
      .take(200);
    return recent.filter((n) => !n.readAt).length;
  },
});

export const recentActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const viewer = await requireAccountViewer(ctx, "notifications");
    return await ctx.db
      .query("notifications")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .order("desc")
      .take(Math.min(limit ?? 4, 20));
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const viewer = await requireAccountViewer(ctx, "notifications", { allowPending: true });
    const n = await ctx.db.get(notificationId);
    if (!n || n.accountId !== viewer.account._id) throw notFound("Notification");
    if (!n.readAt) await ctx.db.patch(notificationId, { readAt: Date.now() });
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "notifications", { allowPending: true });
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .order("desc")
      .take(500);
    const now = Date.now();
    for (const n of unread) if (!n.readAt) await ctx.db.patch(n._id, { readAt: now });
  },
});

// ─────────────────────────── staff ───────────────────────────

export const staffFeed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireStaff(ctx, "accounts.read", { skipMfa: false });
    return await ctx.db
      .query("notifications")
      .withIndex("by_audience", (q) => q.eq("audience", "staff"))
      .order("desc")
      .take(Math.min(limit ?? 20, 100));
  },
});

export const outboundLog = query({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(v.union(v.literal("sent"), v.literal("bypassed"), v.literal("failed"))) },
  handler: async (ctx, { paginationOpts, status }) => {
    await requireStaff(ctx, "settings.read");
    if (status) {
      return await ctx.db.query("outboundMessages").withIndex("by_status", (q) => q.eq("status", status)).order("desc").paginate(paginationOpts);
    }
    return await ctx.db.query("outboundMessages").withIndex("by_createdAt").order("desc").paginate(paginationOpts);
  },
});
