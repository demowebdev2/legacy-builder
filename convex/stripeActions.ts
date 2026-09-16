"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import Stripe from "stripe";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, type ActionCtx, internalAction } from "./_generated/server";
import { appError, forbidden, invalid, notFound, unauthenticated } from "./lib/errors";

/**
 * Stripe integration (Node runtime). Secret keys only ever exist here, in Convex environment variables.
 * State changes are applied through idempotent internal mutations in `payments.ts`.
 */

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw appError("CONFIGURATION", "Stripe is not configured on this deployment.");
  return new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "Legacy Builders Platform" } });
}

interface StripeLikeError {
  type?: string;
  code?: string;
  decline_code?: string;
  message?: string;
  raw?: { payment_intent?: { id?: string } };
}

function describeStripeError(error: unknown): { code?: string; message: string; paymentIntentId?: string } {
  const e = error as StripeLikeError;
  return {
    code: e.decline_code ?? e.code,
    message: e.message ?? "The card was declined.",
    paymentIntentId: e.raw?.payment_intent?.id,
  };
}

interface OrderForPayment {
  order: Doc<"orders">;
  account: Doc<"accounts">;
  userId: Id<"users">;
}

async function loadOrderForUser(ctx: ActionCtx, orderId: Id<"orders">, permission?: string): Promise<OrderForPayment> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw unauthenticated();
  const found: { order: Doc<"orders">; account: Doc<"accounts"> } | null = await ctx.runQuery(
    internal.payments.getOrderForPayment,
    { orderId, userId, permission },
  );
  if (!found) throw notFound("Order");
  return { ...found, userId };
}

async function ensureCustomer(ctx: ActionCtx, stripe: Stripe, account: Doc<"accounts">): Promise<string> {
  if (account.stripeCustomerId) return account.stripeCustomerId;
  const customer = await stripe.customers.create(
    {
      email: account.email,
      name: account.businessName || account.name,
      phone: account.phone,
      metadata: { accountId: account._id },
    },
    { idempotencyKey: `customer-${account._id}` },
  );
  await ctx.runMutation(internal.payments.saveStripeCustomer, { accountId: account._id, customerId: customer.id });
  return customer.id;
}

async function cardFromPaymentIntent(stripe: Stripe, intent: Stripe.PaymentIntent) {
  const pmId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
  if (!pmId) return {};
  const pm = await stripe.paymentMethods.retrieve(pmId);
  return {
    paymentMethodId: pm.id,
    cardBrand: pm.card?.brand,
    cardLast4: pm.card?.last4,
    cardExpMonth: pm.card?.exp_month,
    cardExpYear: pm.card?.exp_year,
  };
}

async function applyIntent(ctx: ActionCtx, stripe: Stripe, order: Doc<"orders">, intent: Stripe.PaymentIntent): Promise<string> {
  const card = await cardFromPaymentIntent(stripe, intent);
  if (card.paymentMethodId && intent.setup_future_usage) {
    await ctx.runMutation(internal.payments.saveDefaultPaymentMethod, {
      accountId: order.accountId,
      paymentMethodId: card.paymentMethodId,
      cardBrand: card.cardBrand,
      cardLast4: card.cardLast4,
      cardExpMonth: card.cardExpMonth,
      cardExpYear: card.cardExpYear,
    });
  }
  const common = {
    orderId: order._id,
    paymentIntentId: intent.id,
    cardBrand: card.cardBrand,
    cardLast4: card.cardLast4,
  };
  if (intent.status === "succeeded") {
    const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    await ctx.runMutation(internal.payments.applyPaymentResult, { ...common, result: "paid", chargeId, captured: order.kind === "opening" });
    return "paid" as const;
  }
  if (intent.status === "requires_capture") {
    await ctx.runMutation(internal.payments.applyPaymentResult, { ...common, result: "authorized" });
    return "authorized" as const;
  }
  if (intent.status === "requires_payment_method" && intent.last_payment_error) {
    await ctx.runMutation(internal.payments.applyPaymentResult, {
      ...common,
      result: "failed",
      failureCode: intent.last_payment_error.decline_code ?? intent.last_payment_error.code,
      failureMessage: intent.last_payment_error.message ?? "Payment failed",
    });
    return "failed" as const;
  }
  return intent.status;
}

/** Creates (or reuses) the PaymentIntent for an order and returns the client secret for Stripe Elements. */
export const createPaymentIntent = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<{ clientSecret: string | null }> => {
    const { order, account } = await loadOrderForUser(ctx, orderId);
    if (order.provider !== "stripe") throw invalid("This order uses bypass payments.");
    if (order.status !== "requires_payment" && order.status !== "failed") throw invalid("This order is not awaiting payment.");
    const stripe = stripeClient();
    if (order.stripePaymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
      if (existing.status === "requires_payment_method" || existing.status === "requires_confirmation" || existing.status === "requires_action") {
        return { clientSecret: existing.client_secret };
      }
    }
    const customer = await ensureCustomer(ctx, stripe, account);
    const intent = await stripe.paymentIntents.create(
      {
        amount: order.totalCents,
        currency: "usd",
        customer,
        description: `${order.label} — ${order.quantity} leads (${order.orderNumber})`,
        capture_method: order.kind === "opening" ? "manual" : "automatic",
        setup_future_usage: "off_session",
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata: { orderId: order._id, accountId: account._id, orderNumber: order.orderNumber, kind: order.kind },
      },
      { idempotencyKey: `order-${order._id}-attempt-${order.attemptCount}` },
    );
    await ctx.runMutation(internal.payments.setPaymentIntent, { orderId: order._id, paymentIntentId: intent.id });
    return { clientSecret: intent.client_secret };
  },
});

/** Reconciles an order with Stripe after client-side confirmation (webhooks remain the primary path). */
export const syncPaymentIntent = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<{ status: string }> => {
    const { order } = await loadOrderForUser(ctx, orderId);
    if (order.provider !== "stripe" || !order.stripePaymentIntentId) return { status: order.status };
    const stripe = stripeClient();
    const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    return { status: await applyIntent(ctx, stripe, order, intent) };
  },
});

async function chargeOffSession(ctx: ActionCtx, order: Doc<"orders">, account: Doc<"accounts">): Promise<string> {
  const stripe = stripeClient();
  if (!account.stripeCustomerId || !account.defaultPaymentMethodId) {
    await ctx.runMutation(internal.payments.applyPaymentResult, {
      orderId: order._id,
      result: "failed",
      failureCode: "no_payment_method",
      failureMessage: "No saved card on file",
    });
    return "failed";
  }
  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: order.totalCents,
        currency: "usd",
        customer: account.stripeCustomerId,
        payment_method: account.defaultPaymentMethodId,
        off_session: true,
        confirm: true,
        description: `${order.label} — ${order.quantity} leads (${order.orderNumber})`,
        metadata: { orderId: order._id, accountId: account._id, orderNumber: order.orderNumber, kind: order.kind },
      },
      { idempotencyKey: `order-${order._id}-offsession-${order.attemptCount}` },
    );
    await ctx.runMutation(internal.payments.setPaymentIntent, { orderId: order._id, paymentIntentId: intent.id });
    return await applyIntent(ctx, stripe, order, intent);
  } catch (error) {
    const info = describeStripeError(error);
    await ctx.runMutation(internal.payments.applyPaymentResult, {
      orderId: order._id,
      result: "failed",
      paymentIntentId: info.paymentIntentId,
      failureCode: info.code,
      failureMessage: info.message,
    });
    return "failed";
  }
}

export const chargeAutoReload = internalAction({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<void> => {
    const found = await ctx.runQuery(internal.payments.getOrderForPayment, { orderId });
    if (!found || found.order.status !== "requires_payment") return;
    await chargeOffSession(ctx, found.order, found.account);
  },
});

/** Agent or finance retry of a declined off-session purchase. */
export const retryDeclinedOrder = action({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<{ status: string }> => {
    const { order, account } = await loadOrderForUser(ctx, orderId, "purchases.retry");
    if (order.status !== "failed") throw invalid("Only declined orders can be retried.");
    return { status: await chargeOffSession(ctx, order, account) };
  },
});

/** Approval step: capture the application authorisation, or charge the saved card if it lapsed. */
export const captureOpeningOrder = internalAction({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<{ ok: boolean; message?: string }> => {
    const found = await ctx.runQuery(internal.payments.getOrderForPayment, { orderId });
    if (!found) throw notFound("Order");
    const { order, account } = found;
    if (order.status === "paid") return { ok: true };
    const stripe = stripeClient();
    if (order.stripePaymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
      if (intent.status === "requires_capture") {
        try {
          const captured = await stripe.paymentIntents.capture(intent.id, {}, { idempotencyKey: `capture-${order._id}` });
          const result = await applyIntent(ctx, stripe, order, captured);
          return { ok: result === "paid" };
        } catch (error) {
          return { ok: false, message: describeStripeError(error).message };
        }
      }
      if (intent.status === "succeeded") {
        await applyIntent(ctx, stripe, order, intent);
        return { ok: true };
      }
    }
    // Authorisation expired or was never completed: try the saved card off-session.
    const status = await chargeOffSession(ctx, { ...order, status: "requires_payment" }, account);
    return status === "paid" ? { ok: true } : { ok: false, message: "The saved card could not be charged." };
  },
});

export const cancelOpeningAuthorization = internalAction({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }): Promise<void> => {
    const found = await ctx.runQuery(internal.payments.getOrderForPayment, { orderId });
    if (!found?.order.stripePaymentIntentId) return;
    const stripe = stripeClient();
    const intent = await stripe.paymentIntents.retrieve(found.order.stripePaymentIntentId);
    if (intent.status === "requires_capture" || intent.status === "requires_payment_method" || intent.status === "requires_confirmation") {
      await stripe.paymentIntents.cancel(intent.id);
    }
  },
});

export const refundOrder = action({
  args: { orderId: v.id("orders"), amountCents: v.number(), reason: v.string(), removeLeads: v.boolean() },
  handler: async (ctx, args): Promise<{ creditNote: string }> => {
    const { order, userId } = await loadOrderForUser(ctx, args.orderId, "refunds.issue");
    const user = await ctx.runQuery(internal.users.getStaffForAction, { userId, permission: "refunds.issue" });
    if (!user) throw forbidden();
    const refundable = order.totalCents - order.refundedCents;
    if (!Number.isInteger(args.amountCents) || args.amountCents <= 0 || args.amountCents > refundable) {
      throw invalid(`Refund must be between $0.01 and the refundable amount.`);
    }
    if (args.reason.trim().length < 5) throw invalid("A written reason is required.");
    let stripeRefundId: string | undefined;
    if (order.provider === "stripe") {
      if (!order.stripePaymentIntentId) throw invalid("This order has no Stripe payment to refund.");
      const stripe = stripeClient();
      const refund = await stripe.refunds.create(
        {
          payment_intent: order.stripePaymentIntentId,
          amount: args.amountCents,
          metadata: { orderId: order._id, reason: args.reason.trim().slice(0, 200) },
        },
        { idempotencyKey: `refund-${order._id}-${order.refundedCents}-${args.amountCents}` },
      );
      stripeRefundId = refund.id;
    }
    const result = await ctx.runMutation(internal.payments.applyRefund, {
      orderId: order._id,
      amountCents: args.amountCents,
      reason: args.reason.trim(),
      removeLeads: args.removeLeads,
      stripeRefundId,
      actorUserId: userId,
    });
    return { creditNote: result.creditNote };
  },
});

/** Card update for auto-reload and future purchases. */
export const createSetupIntent = action({
  args: {},
  handler: async (ctx): Promise<{ clientSecret: string | null }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw unauthenticated();
    const account = await ctx.runQuery(internal.users.getOwnedAccountForAction, { userId });
    if (!account) throw forbidden();
    const stripe = stripeClient();
    const customer = await ensureCustomer(ctx, stripe, account);
    const intent = await stripe.setupIntents.create({
      customer,
      usage: "off_session",
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: { accountId: account._id },
    });
    return { clientSecret: intent.client_secret };
  },
});

/** Verifies the webhook signature and dispatches the event. Called by the HTTP action with the raw body. */
export const handleWebhook = internalAction({
  args: { payload: v.string(), signature: v.string() },
  handler: async (ctx, { payload, signature }): Promise<{ ok: boolean; status: number }> => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return { ok: false, status: 503 };
    const stripe = stripeClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, secret);
    } catch {
      return { ok: false, status: 400 };
    }
    const fresh = await ctx.runMutation(internal.stripeEvents.begin, { eventId: event.id, type: event.type });
    if (!fresh) return { ok: true, status: 200 };
    try {
      switch (event.type) {
        case "payment_intent.succeeded":
        case "payment_intent.amount_capturable_updated":
        case "payment_intent.payment_failed": {
          const intent = event.data.object as Stripe.PaymentIntent;
          const orderId = intent.metadata?.orderId as Id<"orders"> | undefined;
          if (!orderId) break;
          const found = await ctx.runQuery(internal.payments.getOrderForPayment, { orderId });
          if (found) await applyIntent(ctx, stripe, found.order, intent);
          break;
        }
        case "setup_intent.succeeded": {
          const intent = event.data.object as Stripe.SetupIntent;
          const accountId = intent.metadata?.accountId as Id<"accounts"> | undefined;
          const pmId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
          if (!accountId || !pmId) break;
          const pm = await stripe.paymentMethods.retrieve(pmId);
          if (intent.customer) {
            const customerId = typeof intent.customer === "string" ? intent.customer : intent.customer.id;
            await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } });
          }
          await ctx.runMutation(internal.payments.saveDefaultPaymentMethod, {
            accountId,
            paymentMethodId: pmId,
            cardBrand: pm.card?.brand,
            cardLast4: pm.card?.last4,
            cardExpMonth: pm.card?.exp_month,
            cardExpYear: pm.card?.exp_year,
          });
          break;
        }
        default:
          break;
      }
      await ctx.runMutation(internal.stripeEvents.finish, { eventId: event.id });
      return { ok: true, status: 200 };
    } catch (error) {
      await ctx.runMutation(internal.stripeEvents.finish, {
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, status: 500 };
    }
  },
});
