import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { createOrderRecord } from "../../convex/orders";
import { SYSTEM_ACTOR } from "../../convex/lib/auth";
import {
  as,
  balanceOf,
  type CreatedAccount,
  createAccount,
  createLead,
  expectAppError,
  ledgerOf,
  seedWorld,
  setupTest,
  teardownTest,
  TEST_NOW,
  type TestConvex,
  type World,
} from "./fixtures";

/**
 * Purchases in bypass mode (PAYMENTS_PROVIDER unset → mock). The client only ever sends a quantity or a
 * bundle id; the server prices the order and credits leads exactly once when payment completes.
 */
describe("purchases (bypass payments)", () => {
  let t: TestConvex;
  let agent: CreatedAccount;
  let asAgent: Awaited<ReturnType<typeof as>>;
  let world: World;

  beforeEach(async () => {
    t = setupTest();
    world = await seedWorld(t);
    agent = await createAccount(t, { balance: {} });
    asAgent = await as(t, agent.userId);
  });
  afterEach(() => {
    delete process.env.PAYMENTS_PROVIDER;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.APP_ENV;
    delete process.env.ALLOW_PAYMENT_BYPASS;
    teardownTest();
  });

  const ordersFor = (orderId: Id<"orders">) =>
    t.run(async (ctx) => ({
      order: (await ctx.db.get(orderId))!,
      ledger: await ctx.db
        .query("leadBalanceLedger")
        .withIndex("by_order", (q) => q.eq("relatedOrderId", orderId))
        .collect(),
    }));

  it("prices a top-up on the server from the current pricing version", async () => {
    const { orderId, provider } = await asAgent.mutation(api.orders.createTopUp, { quantity: 30 });
    expect(provider).toBe("mock");
    const { order, ledger } = await ordersFor(orderId);
    expect(order).toMatchObject({
      accountId: agent.accountId,
      kind: "top_up",
      status: "requires_payment",
      quantity: 30,
      exclusiveQty: 6,
      standardQty: 24,
      standardRateCents: 2000,
      exclusiveRateCents: 5000,
      totalCents: 78_000,
      discountCents: 0,
    });
    expect(order.orderNumber).toMatch(/^LB-INV-\d+$/);
    expect(ledger).toHaveLength(0);
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 0, standard: 0 });
  });

  it("rejects invalid quantities and never accepts a client-supplied amount", async () => {
    for (const quantity of [12, 5, 105, 0]) {
      await expectAppError(asAgent.mutation(api.orders.createTopUp, { quantity }), "INVALID");
    }
    await expectAppError(asAgent.mutation(api.orders.createTopUp, {}), "INVALID", /quantity or a bundle/);
    await expect(
      asAgent.mutation(api.orders.createTopUp, { quantity: 10, totalCents: 1 } as unknown as { quantity: number }),
    ).rejects.toThrow(/totalCents/);
    expect(await t.run((ctx) => ctx.db.query("orders").collect())).toHaveLength(0);
  });

  it("completing the mock payment credits exactly one exclusive and one standard PURCHASE entry", async () => {
    const { orderId } = await asAgent.mutation(api.orders.createTopUp, { quantity: 15 });
    expect(await asAgent.mutation(api.payments.completeMockPayment, { orderId, outcome: "succeed" })).toEqual({ status: "paid" });

    const { order, ledger } = await ordersFor(orderId);
    expect(order.status).toBe("paid");
    expect(order.creditedAt).toBe(TEST_NOW);
    expect(ledger.map((e) => [e.entryType, e.leadType, e.quantity, e.delta, e.source]).sort()).toEqual([
      ["PURCHASE", "exclusive", 3, 3, "mock_payment"],
      ["PURCHASE", "standard", 12, 12, "mock_payment"],
    ]);
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 3, standard: 12 });
    expect(await asAgent.query(api.ledger.myBalance, {})).toMatchObject({ exclusive: 3, standard: 12, total: 15, purchased: 15 });

    const payments = await t.run((ctx) => ctx.db.query("payments").withIndex("by_order", (q) => q.eq("orderId", orderId)).collect());
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ status: "succeeded", provider: "mock", amountCents: 39_000 });
  });

  it("paying the same order again does not double-credit", async () => {
    const { orderId } = await asAgent.mutation(api.orders.createTopUp, { quantity: 10 });
    await asAgent.mutation(api.payments.completeMockPayment, { orderId, outcome: "succeed" });
    await expectAppError(asAgent.mutation(api.payments.completeMockPayment, { orderId, outcome: "succeed" }), "INVALID", /not awaiting payment/);

    // A replayed provider callback (webhook) is also a no-op thanks to the creditedAt guard.
    await t.mutation(internal.payments.applyPaymentResult, { orderId, result: "paid" });
    await t.mutation(internal.payments.applyPaymentResult, { orderId, result: "paid" });

    const { ledger } = await ordersFor(orderId);
    expect(ledger).toHaveLength(2);
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 8 });
    expect(await ledgerOf(t, agent.accountId)).toHaveLength(2);
  });

  it("a bundle is priced with its discount", async () => {
    const bundleId = await t.run((ctx) =>
      ctx.db.insert("bundles", {
        name: "Bundle 60",
        quantity: 60,
        discountPercent: 15,
        blurb: "Scaling a team",
        featured: false,
        active: true,
        sortOrder: 1,
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
      }),
    );
    const { orderId } = await asAgent.mutation(api.orders.createTopUp, { bundleId });
    await asAgent.mutation(api.payments.completeMockPayment, { orderId, outcome: "succeed" });
    const { order } = await ordersFor(orderId);
    expect(order).toMatchObject({ kind: "bundle", listCents: 156_000, discountPercent: 15, discountCents: 23_400, totalCents: 132_600 });
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 12, standard: 48 });
  });

  it("a declined top-up adds no balance and does not hold distribution", async () => {
    const { orderId } = await asAgent.mutation(api.orders.createTopUp, { quantity: 20 });
    expect(await asAgent.mutation(api.payments.completeMockPayment, { orderId, outcome: "decline" })).toEqual({ status: "failed" });
    const { order, ledger } = await ordersFor(orderId);
    expect(order).toMatchObject({ status: "failed", failureCode: "card_declined" });
    expect(order.creditedAt).toBeUndefined();
    expect(ledger).toHaveLength(0);
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 0, standard: 0 });
    const account = await t.run((ctx) => ctx.db.get(agent.accountId));
    expect(account?.declinedPurchaseOutstanding).toBe(false);
  });

  it("a declined auto-reload adds no balance and flags declinedPurchaseOutstanding; a successful retry clears it", async () => {
    const orderId = await t.run(async (ctx) => {
      const account = (await ctx.db.get(agent.accountId))!;
      const order = await createOrderRecord(ctx, { account, kind: "auto_reload", quantity: 20, label: "Auto-reload", actor: SYSTEM_ACTOR });
      return order._id;
    });
    await asAgent.mutation(api.payments.completeMockPayment, { orderId, outcome: "decline" });

    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 0, standard: 0 });
    expect((await t.run((ctx) => ctx.db.get(agent.accountId)))?.declinedPurchaseOutstanding).toBe(true);
    expect(await asAgent.query(api.orders.myPurchaseSummary, {})).toMatchObject({ declined: 1, leadsBought: 0 });

    await asAgent.mutation(api.payments.retryMockOrder, { orderId });
    const { order, ledger } = await ordersFor(orderId);
    expect(order.status).toBe("paid");
    expect(ledger.every((e) => e.entryType === "AUTO_RELOAD")).toBe(true);
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 4, standard: 16 });
    expect((await t.run((ctx) => ctx.db.get(agent.accountId)))?.declinedPurchaseOutstanding).toBe(false);
  });

  it("a refund removes at most the unused leads from the order and never overdraws the balance", async () => {
    const { orderId } = await asAgent.mutation(api.orders.createTopUp, { quantity: 10 });
    await asAgent.mutation(api.payments.completeMockPayment, { orderId, outcome: "succeed" });
    // One exclusive lead from the order has already been released and used.
    const leadId = await createLead(t, { leadType: "exclusive", recipientTarget: 1 });
    await t.mutation(internal.distribution.engine.processLead, { leadId, trigger: "capture" });
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 1, standard: 8 });

    const result = await t.mutation(internal.payments.applyRefund, {
      orderId,
      amountCents: 26_000,
      reason: "Agent leaving the industry",
      removeLeads: true,
      actorUserId: world.finance,
    });
    expect(result).toEqual({ creditNote: "LB-CN-0001", removed: { exclusive: 1, standard: 8 } });
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 0, standard: 0 });
    const { order, ledger } = await ordersFor(orderId);
    expect(order).toMatchObject({ status: "refunded", refundedCents: 26_000 });
    expect(ledger.filter((e) => e.entryType === "REFUND_REVERSAL").map((e) => [e.leadType, e.delta]).sort()).toEqual([
      ["exclusive", -1],
      ["standard", -8],
    ]);
    // The ASSIGNMENT debit for the used lead is untouched and the ledger still reconciles.
    const all = await ledgerOf(t, agent.accountId);
    expect(all.filter((e) => e.entryType === "ASSIGNMENT")).toHaveLength(1);
    expect(all.reduce((sum, e) => sum + e.delta, 0)).toBe(0);
  });

  it("refuses bypass payments once Stripe is configured, and in production", async () => {
    const { orderId } = await asAgent.mutation(api.orders.createTopUp, { quantity: 10 });

    process.env.PAYMENTS_PROVIDER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    await expectAppError(asAgent.mutation(api.payments.completeMockPayment, { orderId, outcome: "succeed" }), "FORBIDDEN");
    delete process.env.PAYMENTS_PROVIDER;
    delete process.env.STRIPE_SECRET_KEY;

    process.env.APP_ENV = "production";
    await expectAppError(asAgent.mutation(api.payments.completeMockPayment, { orderId, outcome: "succeed" }), "CONFIGURATION");

    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 0, standard: 0 });
  });

  it("only active accounts can buy, and producers cannot buy at all", async () => {
    const suspended = await createAccount(t, { status: "suspended", balance: {} });
    await expectAppError((await as(t, suspended.userId)).mutation(api.orders.createTopUp, { quantity: 10 }), "READ_ONLY");

    const agency = await createAccount(t, { type: "agency", balance: {} });
    await expectAppError((await as(t, agency.producerUserId!)).mutation(api.orders.createTopUp, { quantity: 10 }), "FORBIDDEN");
    await (await as(t, agency.userId)).mutation(api.orders.createTopUp, { quantity: 10 });
  });
});
