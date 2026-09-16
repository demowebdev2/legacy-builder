import type { MutationCtx } from "../_generated/server";

/** Atomic monotonic sequence. Concurrent callers conflict on the counter row and are retried by Convex. */
export async function nextCounter(ctx: MutationCtx, name: string): Promise<number> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!row) {
    await ctx.db.insert("counters", { name, value: 1 });
    return 1;
  }
  const value = row.value + 1;
  await ctx.db.patch(row._id, { value });
  return value;
}
