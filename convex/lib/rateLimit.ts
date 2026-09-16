import type { MutationCtx } from "../_generated/server";
import { appError } from "./errors";

/**
 * Fixed-window rate limiter stored in Convex so it is shared by every serverless instance.
 *
 * IMPORTANT: a Convex mutation that throws rolls back all of its writes, including this counter. Use
 * `enforceRateLimit` only where the protected operation cannot fail after the check (so every counted
 * attempt commits). Where the operation can fail — code verification, lookups by secret — consume the
 * attempt in its own mutation first (`consumeRateLimit` via an action) and then run the check.
 */
export async function consumeRateLimit(
  ctx: MutationCtx,
  key: string,
  options: { max: number; windowMs: number },
): Promise<boolean> {
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row || now - row.windowStart >= options.windowMs) {
    if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
    else await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
    return true;
  }
  if (row.count >= options.max) return false;
  await ctx.db.patch(row._id, { count: row.count + 1 });
  return true;
}

export async function enforceRateLimit(
  ctx: MutationCtx,
  key: string,
  options: { max: number; windowMs: number; message?: string },
): Promise<void> {
  if (!(await consumeRateLimit(ctx, key, options))) {
    throw appError("RATE_LIMITED", options.message ?? "Too many attempts. Please wait a few minutes and try again.");
  }
}
