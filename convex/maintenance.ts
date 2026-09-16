import { DAY } from "../src/domain/time";
import { internalMutation } from "./_generated/server";

/** Rate-limit windows are operational data only (not compliance records) and can be pruned. */
export const cleanRateLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 2 * DAY;
    const rows = await ctx.db.query("rateLimits").take(1000);
    let removed = 0;
    for (const row of rows) {
      if (row.windowStart < cutoff) {
        await ctx.db.delete(row._id);
        removed++;
      }
    }
    return { removed };
  },
});
