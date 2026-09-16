import { v } from "convex/values";
import { maskEmail } from "../src/domain/normalize";
import { sha256Hex } from "../src/domain/reference";
import { query } from "./_generated/server";

/**
 * Read-only lookups for public (signed-out) screens. Every function here is gated by an unguessable token
 * and returns only what the screen needs.
 */

/** Staff invitation landing page (`/auth/invite/[token]?type=staff`). Mirrors `agencyMembers.invitationInfo`. */
export const staffInvitationInfo = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (token.length < 16 || token.length > 200) return null;
    const tokenHash = await sha256Hex(token);
    const invitation = await ctx.db
      .query("staffInvitations")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt < Date.now()) return null;
    return { email: invitation.email, maskedEmail: maskEmail(invitation.email), role: invitation.role, expiresAt: invitation.expiresAt };
  },
});
