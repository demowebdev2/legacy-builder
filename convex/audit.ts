import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireStaff } from "./lib/auth";

/** Read-only access to the append-only audit trail. There is intentionally no write/delete API here. */
export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    accountId: v.optional(v.id("accounts")),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    action: v.optional(v.string()),
    actorUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx, "audit.read");
    if (args.entityType && args.entityId) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_entity", (q) => q.eq("entityType", args.entityType!).eq("entityId", args.entityId!))
        .order("desc")
        .paginate(args.paginationOpts);
    }
    if (args.accountId) {
      return await ctx.db.query("auditLogs").withIndex("by_account", (q) => q.eq("accountId", args.accountId)).order("desc").paginate(args.paginationOpts);
    }
    if (args.action) {
      return await ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", args.action!)).order("desc").paginate(args.paginationOpts);
    }
    if (args.actorUserId) {
      return await ctx.db.query("auditLogs").withIndex("by_actor", (q) => q.eq("actorUserId", args.actorUserId)).order("desc").paginate(args.paginationOpts);
    }
    return await ctx.db.query("auditLogs").withIndex("by_createdAt").order("desc").paginate(args.paginationOpts);
  },
});
