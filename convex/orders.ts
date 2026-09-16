import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { formatInvoiceNumber } from "../src/domain/reference";
import { quoteBundle, quotePurchase } from "../src/domain/purchase";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { type Actor, actorFromViewer, assertAccountWritable, requireAccountViewer, requireStaff } from "./lib/auth";
import { counters } from "./lib/counterNames";
import { nextCounter } from "./lib/counters";
import { paymentsMode } from "./lib/env";
import { appError, invalid, notFound } from "./lib/errors";
import { ensurePricingVersion } from "./lib/settings";

/**
 * Orders are priced ONLY on the server from the current pricing version. The client sends a quantity
 * (validated against the fixed purchase rules) or a bundle id — never an amount or a mix.
 */
export async function createOrderRecord(
  ctx: MutationCtx,
  input: {
    account: Doc<"accounts">;
    kind: Doc<"orders">["kind"];
    quantity?: number;
    bundle?: Doc<"bundles">;
    label: string;
    actor: Actor;
  },
): Promise<Doc<"orders">> {
  const pricing = await ensurePricingVersion(ctx);
  const rates = { standardRateCents: pricing.standardRateCents, exclusiveRateCents: pricing.exclusiveRateCents };
  let quote;
  try {
    quote = input.bundle ? quoteBundle(input.bundle, rates) : quotePurchase(input.quantity ?? 0, rates, 0);
  } catch (error) {
    throw invalid(error instanceof Error ? error.message : "Invalid purchase.");
  }
  const orderNumber = formatInvoiceNumber(await nextCounter(ctx, counters.invoice));
  const now = Date.now();
  const id = await ctx.db.insert("orders", {
    accountId: input.account._id,
    orderNumber,
    kind: input.kind,
    label: input.label,
    bundleId: input.bundle?._id,
    quantity: quote.quantity,
    exclusiveQty: quote.exclusive,
    standardQty: quote.standard,
    standardRateCents: quote.standardRateCents,
    exclusiveRateCents: quote.exclusiveRateCents,
    listCents: quote.listCents,
    discountPercent: quote.discountPercent,
    discountCents: quote.discountCents,
    totalCents: quote.totalCents,
    pricingVersionId: pricing._id,
    status: "requires_payment",
    provider: paymentsMode() === "stripe" ? "stripe" : "mock",
    createdAt: now,
    createdBy: input.actor.kind === "user" ? input.actor.userId : undefined,
    refundedCents: 0,
    attemptCount: 0,
  });
  return (await ctx.db.get(id))!;
}

// ─────────────────────────── agent ───────────────────────────

export const createTopUp = mutation({
  args: { quantity: v.optional(v.number()), bundleId: v.optional(v.id("bundles")) },
  handler: async (ctx, { quantity, bundleId }) => {
    const viewer = await requireAccountViewer(ctx, "purchase");
    assertAccountWritable(viewer.account, "Buying leads");
    if (viewer.account.status !== "active") throw appError("READ_ONLY", "Purchases are available once your account is active.");
    if ((quantity == null) === (bundleId == null)) throw invalid("Choose a quantity or a bundle.");
    let bundle: Doc<"bundles"> | undefined;
    if (bundleId) {
      const found = await ctx.db.get(bundleId);
      if (!found || !found.active) throw notFound("Bundle");
      bundle = found;
    }
    const order = await createOrderRecord(ctx, {
      account: viewer.account,
      kind: bundle ? "bundle" : "top_up",
      quantity,
      bundle,
      label: bundle ? bundle.name : "Lead purchase",
      actor: actorFromViewer(viewer),
    });
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "order.created",
      entityType: "order",
      entityId: order._id,
      accountId: viewer.account._id,
      summary: `${order.orderNumber}: ${order.quantity} leads (${order.exclusiveQty} exclusive, ${order.standardQty} standard)`,
    });
    return { orderId: order._id, provider: order.provider };
  },
});

export const cancelUnpaid = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const viewer = await requireAccountViewer(ctx, "purchase", { allowPending: true });
    const order = await ctx.db.get(orderId);
    if (!order || order.accountId !== viewer.account._id) throw notFound("Order");
    if (order.status !== "requires_payment" || order.kind === "opening") return;
    await ctx.db.patch(orderId, { status: "canceled", canceledAt: Date.now() });
  },
});

export const myOrders = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const viewer = await requireAccountViewer(ctx, "purchase", { allowPending: true });
    return await ctx.db
      .query("orders")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const myPurchaseSummary = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "purchase");
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .collect();
    const paid = orders.filter((o) => o.status === "paid" || o.status === "partially_refunded" || o.status === "refunded");
    const spendCents = paid.reduce((s, o) => s + o.totalCents - o.refundedCents, 0);
    const leadsBought = paid.reduce((s, o) => s + o.quantity, 0);
    return {
      spendCents,
      leadsBought,
      exclusiveBought: paid.reduce((s, o) => s + o.exclusiveQty, 0),
      standardBought: paid.reduce((s, o) => s + o.standardQty, 0),
      paidOrders: paid.length,
      effectiveRateCents: leadsBought ? Math.round(spendCents / leadsBought) : null,
      declined: orders.filter((o) => o.status === "failed" && !o.declineResolvedAt).length,
    };
  },
});

export const myOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    const viewer = await requireAccountViewer(ctx, "purchase", { allowPending: true });
    const order = await ctx.db.get(orderId);
    if (!order || order.accountId !== viewer.account._id) return null;
    return await orderDetail(ctx, order);
  },
});

async function orderDetail(ctx: { db: MutationCtx["db"] | import("./_generated/server").QueryCtx["db"] }, order: Doc<"orders">) {
  const payments = await ctx.db
    .query("payments")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .order("desc")
    .collect();
  const ledger = await ctx.db
    .query("leadBalanceLedger")
    .withIndex("by_order", (q) => q.eq("relatedOrderId", order._id))
    .collect();
  const bundle = order.bundleId ? await ctx.db.get(order.bundleId) : null;
  return { order, payments, ledger, bundleName: bundle?.name ?? null };
}

// ─────────────────────────── staff ───────────────────────────

export const adminList = query({
  args: {
    paginationOpts: paginationOptsValidator,
    kind: v.optional(v.union(v.literal("opening"), v.literal("top_up"), v.literal("bundle"), v.literal("auto_reload"))),
    status: v.optional(v.union(v.literal("failed"), v.literal("paid"), v.literal("authorized"), v.literal("requires_payment"))),
  },
  handler: async (ctx, { paginationOpts, kind, status }) => {
    await requireStaff(ctx, "payments.read");
    const page = status
      ? await ctx.db.query("orders").withIndex("by_status", (q) => q.eq("status", status)).order("desc").paginate(paginationOpts)
      : kind
        ? await ctx.db.query("orders").withIndex("by_kind", (q) => q.eq("kind", kind)).order("desc").paginate(paginationOpts)
        : await ctx.db.query("orders").withIndex("by_createdAt").order("desc").paginate(paginationOpts);
    const accounts = new Map<Id<"accounts">, Doc<"accounts"> | null>();
    const rows = [];
    for (const order of page.page) {
      if (!accounts.has(order.accountId)) accounts.set(order.accountId, await ctx.db.get(order.accountId));
      const account = accounts.get(order.accountId);
      rows.push({ ...order, accountName: account?.name ?? "—", accountType: account?.type ?? "individual" });
    }
    return { ...page, page: rows };
  },
});

export const adminSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "payments.read");
    const orders = await ctx.db.query("orders").withIndex("by_createdAt").order("desc").take(2000);
    const paid = orders.filter((o) => o.status === "paid" || o.status === "partially_refunded");
    const count = (kind: Doc<"orders">["kind"]) => orders.filter((o) => o.kind === kind && o.status !== "canceled").length;
    return {
      total: orders.filter((o) => o.status !== "canceled").length,
      opening: count("opening"),
      topUp: count("top_up"),
      bundle: count("bundle"),
      autoReload: count("auto_reload"),
      declined: orders.filter((o) => o.status === "failed" && !o.declineResolvedAt).length,
      leadsSold: paid.reduce((s, o) => s + o.quantity, 0),
      valueCents: paid.reduce((s, o) => s + o.totalCents - o.refundedCents, 0),
      paidCount: paid.length,
    };
  },
});

export const adminGet = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, { orderId }) => {
    await requireStaff(ctx, "payments.read");
    const order = await ctx.db.get(orderId);
    if (!order) return null;
    const account = await ctx.db.get(order.accountId);
    return { ...(await orderDetail(ctx, order)), account };
  },
});

export const resolveDecline = mutation({
  args: { orderId: v.id("orders"), note: v.string() },
  handler: async (ctx, { orderId, note }) => {
    const staff = await requireStaff(ctx, "purchases.retry");
    const order = await ctx.db.get(orderId);
    if (!order || order.status !== "failed") throw notFound("Declined order");
    if (note.trim().length < 5) throw invalid("A note is required.");
    await ctx.db.patch(orderId, { declineResolvedAt: Date.now() });
    const stillOpen = await ctx.db
      .query("orders")
      .withIndex("by_account", (q) => q.eq("accountId", order.accountId))
      .filter((q) => q.and(q.eq(q.field("status"), "failed"), q.eq(q.field("declineResolvedAt"), undefined)))
      .first();
    if (!stillOpen) await ctx.db.patch(order.accountId, { declinedPurchaseOutstanding: false });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "order.decline_resolved",
      entityType: "order",
      entityId: orderId,
      accountId: order.accountId,
      summary: `Declined ${order.orderNumber} dismissed: ${note.trim()}`,
    });
  },
});
