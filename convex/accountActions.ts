import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { appError, forbidden, invalid, notFound, unauthenticated } from "./lib/errors";

/**
 * Approval orchestration: capture the opening purchase (Stripe or bypass), which credits the ledger
 * idempotently, then activate the account. Capture happens before activation so an account never
 * goes live on an unpaid opening purchase.
 */
export const approve = action({
  args: { accountId: v.id("accounts"), note: v.optional(v.string()) },
  handler: async (ctx, { accountId, note }): Promise<{ ok: true }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw unauthenticated();
    const staff = await ctx.runQuery(internal.users.getStaffForAction, { userId, permission: "accounts.manage" });
    if (!staff) throw forbidden();
    const context = await ctx.runQuery(internal.accounts.getApprovalContext, { accountId });
    if (!context) throw notFound("Account");
    const { account, order } = context;
    if (account.status !== "pending_verification" && account.status !== "action_required") {
      throw invalid("Only pending applications can be approved.");
    }
    if (!context.verifiedStates.length) throw invalid("Verify at least one state licence before approving.");
    if (!context.eoOk) throw invalid("Verify the applicant's E&O evidence (on file, in force) before approving.");
    if (!order) throw invalid("This application has no opening purchase.");

    if (order.status !== "paid") {
      if (order.status !== "authorized") {
        throw appError("PAYMENT_FAILED", "The opening purchase has not been authorised yet — the applicant needs to add a card.");
      }
      if (order.provider === "stripe") {
        const result = await ctx.runAction(internal.stripeActions.captureOpeningOrder, { orderId: order._id });
        if (!result.ok) {
          await ctx.runMutation(internal.accounts.recordCaptureFailure, {
            accountId,
            staffUserId: userId,
            message: result.message ?? "Capture failed",
          });
          throw appError("PAYMENT_FAILED", `Capture failed: ${result.message ?? "the card was declined"}. The applicant has been asked to update their card.`);
        }
      } else {
        await ctx.runMutation(internal.payments.mockCapture, { orderId: order._id });
      }
    }
    await ctx.runMutation(internal.accounts.finalizeApproval, { accountId, staffUserId: userId, note });
    return { ok: true };
  },
});
