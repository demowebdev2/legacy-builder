import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { PASSWORD_MIN_LENGTH } from "../src/domain/constants";
import { normalizeEmail } from "../src/domain/normalize";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalQuery } from "./_generated/server";

export const adminExists = internalQuery({
  args: {},
  handler: async (ctx) =>
    !!(await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "ADMIN"))
      .first()),
});

/**
 * Creates the FIRST administrator login from the CLI. Internal (not callable from the internet) and
 * refuses once any admin exists — further staff are invited from Admin → Users & roles.
 *
 *   npx convex run --prod bootstrap:createFirstAdmin '{"email":"owner@example.com","password":"…","firstName":"…","lastName":"…"}'
 */
export const createFirstAdmin = internalAction({
  args: { email: v.string(), password: v.string(), firstName: v.string(), lastName: v.string() },
  handler: async (ctx, args): Promise<{ userId: Id<"users"> }> => {
    if (await ctx.runQuery(internal.bootstrap.adminExists, {})) {
      throw new Error("An admin already exists. Invite further staff from Admin → Users & roles.");
    }
    const email = normalizeEmail(args.email);
    if (!email) throw new Error("Invalid email.");
    if (args.password.length < PASSWORD_MIN_LENGTH) throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    const { user } = await createAccount(ctx, { provider: "password", account: { id: email, secret: args.password }, profile: { email } });
    const userId = user._id as Id<"users">;
    await ctx.runMutation(internal.users.bootstrapAdmin, { email, firstName: args.firstName, lastName: args.lastName });
    return { userId };
  },
});
