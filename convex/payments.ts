import { v } from "convex/values";
import { formatMoney } from "../src/domain/money";
import { formatCreditNoteNumber } from "../src/domain/reference";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, type MutationCtx, query } from "./_generated/server";
import { templates } from "./integrations/templates";
import { creditLeads, debitLeads, getBalanceDoc } from "./ledger";
import { writeAudit } from "./lib/audit";
import { type Actor, actorFromViewer, getViewer, isStaffRole, requireAccountViewer, SYSTEM_ACTOR } from "./lib/auth";
import { counters } from "./lib/counterNames";
import { nextCounter } from "./lib/counters";
import { mockPaymentsAllowed, paymentsMode, readEnv } from "./lib/env";
import { appError, forbidden, invalid, notFound } from "./lib/errors";
import { notifyAccount } from "./lib/notify";
import { roleHasPermission } from "../src/domain/permissions";

/**
 * Payment state transitions. Every function here is idempotent: Stripe webhooks can arrive more
 * than once and in any order, and a lead credit must happen exactly once per order.
 */

interface CardInfo {
  cardBrand?: string;
  cardLast4?: string;
}

export async function markOrderAuthorized(
  ctx: MutationCtx,
  order: Doc<"orders">,
  input: CardInfo & { paymentIntentId?: string; actor: Actor },
) {
  if (order.status === "authorized" || order.status === "paid") return;
  const now = Date.now();
  await ctx.db.insert("payments", {
    orderId: order._id,
    accountId: order.accountId,
    provider: order.provider,
    kind: "authorization",
    amountCents: order.totalCents,
    status: "authorized",
    stripePaymentIntentId: input.paymentIntentId,
    cardBrand: input.cardBrand,
    cardLast4: input.cardLast4,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(order._id, {
    status: "authorized",
    authorizedAt: now,
    attemptCount: order.attemptCount + 1,
    stripePaymentIntentId: input.paymentIntentId ?? order.stripePaymentIntentId,
  });
  if (input.cardLast4) await ctx.db.patch(order.accountId, { cardBrand: input.cardBrand, cardLast4: input.cardLast4 });
  await writeAudit(ctx, input.actor, {
    action: "order.authorized",
    entityType: "order",
    entityId: order._id,
    accountId: order.accountId,
    summary: `${order.orderNumber} authorised for ${formatMoney(order.totalCents)} (not captured)`,
  });
}

export async function markOrderPaid(
  ctx: MutationCtx,
  order: Doc<"orders">,
  input: CardInfo & { paymentIntentId?: string; chargeId?: string; actor: Actor; captured?: boolean },
): Promise<boolean> {
  if (order.creditedAt) return false; // already credited — webhook replay
  const now = Date.now();
  await ctx.db.insert("payments", {
    orderId: order._id,
    accountId: order.accountId,
    provider: order.provider,
    kind: input.captured ? "capture" : "charge",
    amountCents: order.totalCents,
    status: "succeeded",
    stripePaymentIntentId: input.paymentIntentId,
    stripeChargeId: input.chargeId,
    cardBrand: input.cardBrand,
    cardLast4: input.cardLast4,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(order._id, {
    status: "paid",
    paidAt: now,
    creditedAt: now,
    attemptCount: order.status === "authorized" ? order.attemptCount : order.attemptCount + 1,
    stripePaymentIntentId: input.paymentIntentId ?? order.stripePaymentIntentId,
    declineResolvedAt: order.status === "failed" ? now : order.declineResolvedAt,
  });

  const entryType = order.kind === "auto_reload" ? "AUTO_RELOAD" : "PURCHASE";
  const source = order.provider === "stripe" ? "stripe" : "mock_payment";
  const reason = `${order.label} — ${order.orderNumber}`;
  if (order.exclusiveQty > 0) {
    await creditLeads(ctx, {
      accountId: order.accountId,
      leadType: "exclusive",
      quantity: order.exclusiveQty,
      entryType,
      reason,
      source,
      actor: input.actor,
      relatedOrderId: order._id,
    });
  }
  if (order.standardQty > 0) {
    await creditLeads(ctx, {
      accountId: order.accountId,
      leadType: "standard",
      quantity: order.standardQty,
      entryType,
      reason,
      source,
      actor: input.actor,
      relatedOrderId: order._id,
    });
  }

  // A successful payment proves the card works again: clear outstanding declines.
  const account = (await ctx.db.get(order.accountId))!;
  const openDeclines = await ctx.db
    .query("orders")
    .withIndex("by_account", (q) => q.eq("accountId", order.accountId))
    .filter((q) => q.and(q.eq(q.field("status"), "failed"), q.eq(q.field("declineResolvedAt"), undefined)))
    .collect();
  for (const declined of openDeclines) await ctx.db.patch(declined._id, { declineResolvedAt: now });
  await ctx.db.patch(order.accountId, {
    declinedPurchaseOutstanding: false,
    ...(input.cardLast4 ? { cardBrand: input.cardBrand, cardLast4: input.cardLast4 } : {}),
  });
  const prefs = await ctx.db
    .query("agentPreferences")
    .withIndex("by_account", (q) => q.eq("accountId", order.accountId))
    .unique();
  if (prefs?.autoReloadPendingOrderId === order._id) await ctx.db.patch(prefs._id, { autoReloadPendingOrderId: undefined });

  const lines = [
    `${order.label}: ${order.quantity} leads — ${order.exclusiveQty} exclusive, ${order.standardQty} standard.`,
    ...(order.discountCents ? [`Bundle discount ${order.discountPercent}%: −${formatMoney(order.discountCents)}.`] : []),
  ];
  await notifyAccount(ctx, {
    accountId: order.accountId,
    type: "billing",
    title: order.kind === "auto_reload" ? `Auto-reload — ${order.quantity} leads added` : "Purchase successful",
    body: `${order.orderNumber} · ${formatMoney(order.totalCents)}. ${order.exclusiveQty} exclusive and ${order.standardQty} standard added to your balance.`,
    link: `/agent/purchases/${order._id}`,
    channels: ["in_app"],
  });
  if (order.kind !== "opening") {
    await ctx.scheduler.runAfter(0, internal.integrations.messaging.sendTransactionalEmail, {
      to: account.email,
      template: "receipt",
      accountId: account._id,
      ...templates.receipt(order.orderNumber, lines, formatMoney(order.totalCents)),
    });
    await ctx.db.patch(order._id, { receiptSentAt: now });
  }
  await writeAudit(ctx, input.actor, {
    action: "order.paid",
    entityType: "order",
    entityId: order._id,
    accountId: order.accountId,
    summary: `${order.orderNumber} paid ${formatMoney(order.totalCents)}; credited ${order.exclusiveQty} exclusive + ${order.standardQty} standard`,
    metadata: { provider: order.provider, paymentIntentId: input.paymentIntentId },
  });
  return true;
}

export async function markOrderFailed(
  ctx: MutationCtx,
  order: Doc<"orders">,
  input: { code?: string; message: string; paymentIntentId?: string; actor: Actor },
) {
  if (order.status === "paid" || order.creditedAt) return;
  const now = Date.now();
  await ctx.db.insert("payments", {
    orderId: order._id,
    accountId: order.accountId,
    provider: order.provider,
    kind: order.kind === "opening" ? "authorization" : "charge",
    amountCents: order.totalCents,
    status: "failed",
    stripePaymentIntentId: input.paymentIntentId,
    failureCode: input.code,
    failureMessage: input.message,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(order._id, {
    status: "failed",
    failedAt: now,
    failureCode: input.code,
    failureMessage: input.message,
    attemptCount: order.attemptCount + 1,
    declineResolvedAt: undefined,
  });
  if (order.kind === "auto_reload") {
    await ctx.db.patch(order.accountId, { declinedPurchaseOutstanding: true });
    const prefs = await ctx.db
      .query("agentPreferences")
      .withIndex("by_account", (q) => q.eq("accountId", order.accountId))
      .unique();
    if (prefs?.autoReloadPendingOrderId === order._id) await ctx.db.patch(prefs._id, { autoReloadPendingOrderId: undefined });
  }
  await notifyAccount(ctx, {
    accountId: order.accountId,
    type: "billing",
    title: order.kind === "auto_reload" ? "Auto-reload was declined" : "Payment declined",
    body: `${order.orderNumber} for ${formatMoney(order.totalCents)} was declined (${input.message}). No leads were added. You can retry or update your card.`,
    link: `/agent/purchases/${order._id}`,
    channels: ["in_app", "email"],
  });
  await writeAudit(ctx, input.actor, {
    action: "order.failed",
    entityType: "order",
    entityId: order._id,
    accountId: order.accountId,
    summary: `${order.orderNumber} declined: ${input.message}`,
    metadata: { code: input.code },
  });
}

export async function recordRefund(
  ctx: MutationCtx,
  order: Doc<"orders">,
  input: { amountCents: number; reason: string; removeLeads: boolean; stripeRefundId?: string; actor: Actor },
) {
  const now = Date.now();
  const creditNote = formatCreditNoteNumber(await nextCounter(ctx, counters.creditNote));
  await ctx.db.insert("payments", {
    orderId: order._id,
    accountId: order.accountId,
    provider: order.provider,
    kind: "refund",
    amountCents: input.amountCents,
    status: "succeeded",
    documentNumber: creditNote,
    stripeRefundId: input.stripeRefundId,
    reason: input.reason,
    createdBy: input.actor.kind === "user" ? input.actor.userId : undefined,
    createdAt: now,
    updatedAt: now,
  });
  const refundedCents = order.refundedCents + input.amountCents;
  await ctx.db.patch(order._id, {
    refundedCents,
    status: refundedCents >= order.totalCents ? "refunded" : "partially_refunded",
  });
  const removed = { exclusive: 0, standard: 0 };
  if (input.removeLeads) {
    // Remove at most what the order added and what is still unused — never push a balance negative.
    const balance = await getBalanceDoc(ctx, order.accountId);
    for (const leadType of ["exclusive", "standard"] as const) {
      const fromOrder = leadType === "exclusive" ? order.exclusiveQty : order.standardQty;
      const available = balance?.[leadType] ?? 0;
      const quantity = Math.min(fromOrder, available);
      if (quantity > 0) {
        await debitLeads(ctx, {
          accountId: order.accountId,
          leadType,
          quantity,
          entryType: "REFUND_REVERSAL",
          reason: `Refund ${creditNote} of ${order.orderNumber}: ${input.reason}`,
          source: "admin",
          actor: input.actor,
          relatedOrderId: order._id,
        });
        removed[leadType] = quantity;
      }
    }
  }
  await writeAudit(ctx, input.actor, {
    action: "order.refund",
    entityType: "order",
    entityId: order._id,
    accountId: order.accountId,
    summary: `Refunded ${formatMoney(input.amountCents)} on ${order.orderNumber} (${creditNote}): ${input.reason}`,
    metadata: { removed, stripeRefundId: input.stripeRefundId },
  });
  await notifyAccount(ctx, {
    accountId: order.accountId,
    type: "billing",
    title: "Refund issued",
    body: `${formatMoney(input.amountCents)} refunded on ${order.orderNumber}.${removed.exclusive + removed.standard ? ` ${removed.exclusive} exclusive and ${removed.standard} standard leads were removed from your balance.` : ""}`,
    link: `/agent/purchases/${order._id}`,
  });
  return { creditNote, removed };
}

// ─────────────────────────── config & internal helpers ───────────────────────────

export const config = query({
  args: {},
  handler: async () => ({
    mode: paymentsMode(),
    bypassAllowed: mockPaymentsAllowed(),
    publishableKeyConfigured: !!readEnv("STRIPE_PUBLISHABLE_KEY") || paymentsMode() === "mock",
  }),
});

export const getOrderForPayment = internalQuery({
  args: { orderId: v.id("orders"), userId: v.optional(v.id("users")), permission: v.optional(v.string()) },
  handler: async (ctx, { orderId, userId, permission }) => {
    const order = await ctx.db.get(orderId);
    if (!order) return null;
    const account = await ctx.db.get(order.accountId);
    if (!account) return null;
    if (userId) {
      const user = await ctx.db.get(userId);
      if (!user || user.disabled) return null;
      const isOwner = user.accountId === order.accountId && (user.role === "AGENT" || user.role === "AGENCY_PRINCIPAL");
      const isStaff = isStaffRole(user.role) && !!permission && roleHasPermission(user.role, permission as never);
      if (!isOwner && !isStaff) return null;
    }
    return { order, account };
  },
});

export const setPaymentIntent = internalMutation({
  args: { orderId: v.id("orders"), paymentIntentId: v.string() },
  handler: async (ctx, { orderId, paymentIntentId }) => {
    await ctx.db.patch(orderId, { stripePaymentIntentId: paymentIntentId });
  },
});

export const saveStripeCustomer = internalMutation({
  args: { accountId: v.id("accounts"), customerId: v.string() },
  handler: async (ctx, { accountId, customerId }) => {
    await ctx.db.patch(accountId, { stripeCustomerId: customerId });
  },
});

export const saveDefaultPaymentMethod = internalMutation({
  args: {
    accountId: v.id("accounts"),
    paymentMethodId: v.string(),
    cardBrand: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    cardExpMonth: v.optional(v.number()),
    cardExpYear: v.optional(v.number()),
  },
  handler: async (ctx, { accountId, paymentMethodId, ...card }) => {
    await ctx.db.patch(accountId, { defaultPaymentMethodId: paymentMethodId, ...card });
    await writeAudit(ctx, SYSTEM_ACTOR, {
      action: "payment_method.updated",
      entityType: "account",
      entityId: accountId,
      accountId,
      summary: `Default card set to ${card.cardBrand ?? "card"} ending ${card.cardLast4 ?? "••••"}`,
    });
  },
});

export const applyPaymentResult = internalMutation({
  args: {
    orderId: v.id("orders"),
    result: v.union(v.literal("paid"), v.literal("authorized"), v.literal("failed")),
    paymentIntentId: v.optional(v.string()),
    chargeId: v.optional(v.string()),
    cardBrand: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    captured: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw notFound("Order");
    if (args.result === "paid") {
      await markOrderPaid(ctx, order, { ...args, actor: SYSTEM_ACTOR });
    } else if (args.result === "authorized") {
      await markOrderAuthorized(ctx, order, { ...args, actor: SYSTEM_ACTOR });
    } else {
      await markOrderFailed(ctx, order, {
        code: args.failureCode,
        message: args.failureMessage ?? "Payment failed",
        paymentIntentId: args.paymentIntentId,
        actor: SYSTEM_ACTOR,
      });
    }
  },
});

export const applyRefund = internalMutation({
  args: {
    orderId: v.id("orders"),
    amountCents: v.number(),
    reason: v.string(),
    removeLeads: v.boolean(),
    stripeRefundId: v.optional(v.string()),
    actorUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    const user = await ctx.db.get(args.actorUserId);
    if (!order || !user) throw notFound("Order");
    const actor: Actor = {
      kind: "user",
      userId: user._id,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Staff",
      role: user.role ?? "USER",
    };
    return await recordRefund(ctx, order, { ...args, actor });
  },
});

// ─────────────────────────── bypass (mock) payments ───────────────────────────

function assertMockPayments() {
  if (paymentsMode() !== "mock") throw forbidden("Test payments are disabled — Stripe is configured.");
  if (!mockPaymentsAllowed()) {
    throw appError("CONFIGURATION", "Payments are not configured on this deployment. Add Stripe keys to take payments.");
  }
}

/** Development bypass: completes an order without Stripe. Refused when Stripe is configured or in production. */
export const completeMockPayment = mutation({
  args: { orderId: v.id("orders"), outcome: v.union(v.literal("succeed"), v.literal("decline")) },
  handler: async (ctx, { orderId, outcome }) => {
    assertMockPayments();
    const viewer = await requireAccountViewer(ctx, "purchase", { allowPending: true });
    const order = await ctx.db.get(orderId);
    if (!order || order.accountId !== viewer.account._id) throw notFound("Order");
    if (order.provider !== "mock") throw invalid("This order must be paid through Stripe.");
    if (order.status !== "requires_payment" && order.status !== "failed") throw invalid("This order is not awaiting payment.");
    const actor = actorFromViewer(viewer);
    if (outcome === "decline") {
      await markOrderFailed(ctx, order, { code: "card_declined", message: "Test decline (bypass mode)", actor });
      return { status: "failed" as const };
    }
    const card = { cardBrand: "Test card", cardLast4: "4242" };
    if (order.kind === "opening") {
      await markOrderAuthorized(ctx, order, { ...card, actor });
      await ctx.db.patch(viewer.account._id, { defaultPaymentMethodId: "mock_pm_4242", cardExpMonth: 12, cardExpYear: 2030 });
      return { status: "authorized" as const };
    }
    await markOrderPaid(ctx, order, { ...card, actor });
    return { status: "paid" as const };
  },
});

export const mockChargeAutoReload = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order || order.status !== "requires_payment") return;
    if (readEnv("MOCK_AUTO_RELOAD_OUTCOME") === "decline") {
      await markOrderFailed(ctx, order, { code: "card_declined", message: "Test decline (bypass mode)", actor: SYSTEM_ACTOR });
      return;
    }
    await markOrderPaid(ctx, order, { cardBrand: "Test card", cardLast4: "4242", actor: SYSTEM_ACTOR });
  },
});

/** Mock-mode capture of an opening authorisation (called during approval). */
export const mockCapture = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order) throw notFound("Order");
    if (order.status !== "authorized") throw invalid("The opening purchase has not been authorised.");
    await markOrderPaid(ctx, order, { cardBrand: "Test card", cardLast4: "4242", actor: SYSTEM_ACTOR, captured: true });
  },
});

export const myPaymentMethod = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "purchase", { allowPending: true });
    const a = viewer.account;
    return {
      hasCard: !!a.defaultPaymentMethodId,
      cardBrand: a.cardBrand ?? null,
      cardLast4: a.cardLast4 ?? null,
      cardExpMonth: a.cardExpMonth ?? null,
      cardExpYear: a.cardExpYear ?? null,
    };
  },
});

export const setMockPaymentMethod = mutation({
  args: {},
  handler: async (ctx) => {
    assertMockPayments();
    const viewer = await requireAccountViewer(ctx, "purchase", { allowPending: true });
    await ctx.db.patch(viewer.account._id, {
      defaultPaymentMethodId: "mock_pm_4242",
      cardBrand: "Test card",
      cardLast4: "4242",
      cardExpMonth: 12,
      cardExpYear: 2030,
    });
  },
});

export const retryMockOrder = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    assertMockPayments();
    const viewer = await getViewer(ctx);
    const order = await ctx.db.get(orderId);
    if (!viewer || !order) throw notFound("Order");
    const staffOk = isStaffRole(viewer.user.role) && roleHasPermission(viewer.user.role, "purchases.retry");
    const ownerOk = viewer.user.accountId === order.accountId && viewer.user.role !== "PRODUCER";
    if (!staffOk && !ownerOk) throw forbidden();
    if (order.status !== "failed") throw invalid("Only declined orders can be retried.");
    await markOrderPaid(ctx, order, { cardBrand: "Test card", cardLast4: "4242", actor: actorFromViewer(viewer) });
  },
});

export type OrderId = Id<"orders">;
