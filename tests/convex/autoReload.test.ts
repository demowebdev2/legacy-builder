import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { maybeTriggerAutoReload } from "../../convex/autoReload";
import {
  as,
  balanceOf,
  type CreatedAccount,
  createAccount,
  createLead,
  expectAppError,
  scheduledFunctions,
  seedWorld,
  setupTest,
  teardownTest,
  type TestConvex,
} from "./fixtures";

describe("auto-reload", () => {
  let t: TestConvex;

  beforeEach(async () => {
    t = setupTest();
    await seedWorld(t);
  });
  afterEach(teardownTest);

  const prefsOf = (accountId: Id<"accounts">) =>
    t.run(async (ctx) => (await ctx.db.query("agentPreferences").withIndex("by_account", (q) => q.eq("accountId", accountId)).unique())!);
  const autoReloadOrders = (accountId: Id<"accounts">) =>
    t.run(async (ctx) =>
      (await ctx.db.query("orders").withIndex("by_account", (q) => q.eq("accountId", accountId)).collect()).filter((o) => o.kind === "auto_reload"),
    );
  const releaseOneLead = async () => {
    const leadId = await createLead(t, { leadType: "standard" });
    return await t.mutation(internal.distribution.engine.processLead, { leadId, trigger: "capture" });
  };

  describe("settings validation", () => {
    let agent: CreatedAccount;
    let asAgent: Awaited<ReturnType<typeof as>>;

    beforeEach(async () => {
      agent = await createAccount(t, { balance: { exclusive: 10, standard: 40 } });
      asAgent = await as(t, agent.userId);
    });

    it.each([12, 5, 105, 0, 22.5])("rejects a reload quantity of %s", async (quantity) => {
      await expectAppError(asAgent.mutation(api.preferences.setAutoReload, { enabled: true, threshold: 3, quantity }), "INVALID", /Lead purchases start at 10/);
      expect(await prefsOf(agent.accountId)).toMatchObject({ autoReloadEnabled: false, autoReloadQuantity: 20 });
    });

    it.each([-1, 51, 2.5])("rejects a threshold of %s", async (threshold) => {
      await expectAppError(asAgent.mutation(api.preferences.setAutoReload, { enabled: true, threshold, quantity: 20 }), "INVALID", /threshold/);
      expect(await prefsOf(agent.accountId)).toMatchObject({ autoReloadEnabled: false, autoReloadThreshold: 3 });
    });

    it("saves valid settings and does not buy while the balance is above the threshold", async () => {
      await asAgent.mutation(api.preferences.setAutoReload, { enabled: true, threshold: 5, quantity: 30 });
      expect(await prefsOf(agent.accountId)).toMatchObject({ autoReloadEnabled: true, autoReloadThreshold: 5, autoReloadQuantity: 30 });
      expect(await autoReloadOrders(agent.accountId)).toHaveLength(0);
    });

    it("producers cannot change auto-reload", async () => {
      const agency = await createAccount(t, { type: "agency" });
      await expectAppError((await as(t, agency.producerUserId!)).mutation(api.preferences.setAutoReload, { enabled: true, threshold: 3, quantity: 20 }), "FORBIDDEN");
    });
  });

  it("a debit that brings the balance down to the threshold creates one auto_reload order, not one per debit", async () => {
    const agent = await createAccount(t, { balance: { exclusive: 0, standard: 6 }, autoReload: { enabled: true, threshold: 4, quantity: 20 } });

    // 6 → 5: still above the threshold.
    await releaseOneLead();
    expect(await autoReloadOrders(agent.accountId)).toHaveLength(0);

    // 5 → 4: reaches the threshold → one order at server-side prices, charged by a scheduled job.
    await releaseOneLead();
    const [order] = await autoReloadOrders(agent.accountId);
    expect(order).toMatchObject({ kind: "auto_reload", status: "requires_payment", quantity: 20, exclusiveQty: 4, standardQty: 16, totalCents: 52_000, provider: "mock" });
    expect((await prefsOf(agent.accountId)).autoReloadPendingOrderId).toBe(order._id);
    const charges = (await scheduledFunctions(t)).filter((j) => j.name === "payments:mockChargeAutoReload");
    expect(charges).toMatchObject([{ args: [{ orderId: order._id }], state: { kind: "pending" } }]);

    // 4 → 3 → 2 while the first reload is still pending: no second order.
    await releaseOneLead();
    await releaseOneLead();
    expect(await autoReloadOrders(agent.accountId)).toHaveLength(1);
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 0, standard: 2 });

    // The scheduled charge succeeds: leads credited once as AUTO_RELOAD, pending marker cleared.
    await t.mutation(internal.payments.mockChargeAutoReload, { orderId: order._id });
    await t.mutation(internal.payments.mockChargeAutoReload, { orderId: order._id }); // a duplicate job is a no-op
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 4, standard: 18 });
    const credits = await t.run((ctx) => ctx.db.query("leadBalanceLedger").withIndex("by_order", (q) => q.eq("relatedOrderId", order._id)).collect());
    expect(credits.map((c) => [c.entryType, c.leadType, c.quantity]).sort()).toEqual([
      ["AUTO_RELOAD", "exclusive", 4],
      ["AUTO_RELOAD", "standard", 16],
    ]);
    expect((await prefsOf(agent.accountId)).autoReloadPendingOrderId).toBeUndefined();

    // Well above the threshold again → the next release does not reorder.
    await releaseOneLead();
    expect(await autoReloadOrders(agent.accountId)).toHaveLength(1);
  });

  it("turning auto-reload on at or below the threshold orders immediately", async () => {
    const agent = await createAccount(t, { balance: { exclusive: 1, standard: 2 } });
    await (await as(t, agent.userId)).mutation(api.preferences.setAutoReload, { enabled: true, threshold: 3, quantity: 10 });
    expect(await autoReloadOrders(agent.accountId)).toMatchObject([{ quantity: 10, exclusiveQty: 2, standardQty: 8, status: "requires_payment" }]);
  });

  it("a declined auto-reload credits nothing, holds distribution and does not re-order until resolved", async () => {
    process.env.MOCK_AUTO_RELOAD_OUTCOME = "decline";
    const agent = await createAccount(t, { balance: { exclusive: 0, standard: 4 }, autoReload: { enabled: true, threshold: 3, quantity: 20 } });

    await releaseOneLead(); // 4 → 3 triggers the reload
    const [order] = await autoReloadOrders(agent.accountId);
    await t.mutation(internal.payments.mockChargeAutoReload, { orderId: order._id });

    expect((await t.run((ctx) => ctx.db.get(order._id)))?.status).toBe("failed");
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 0, standard: 3 });
    expect((await t.run((ctx) => ctx.db.get(agent.accountId)))?.declinedPurchaseOutstanding).toBe(true);
    expect((await prefsOf(agent.accountId)).autoReloadPendingOrderId).toBeUndefined();
    const billing = await t.run((ctx) => ctx.db.query("notifications").withIndex("by_account", (q) => q.eq("accountId", agent.accountId)).collect());
    expect(billing.some((n) => n.type === "billing" && /declined/.test(n.title))).toBe(true);

    // holdOnDeclinedPurchase (default on): the account is skipped while the decline is unresolved…
    expect(await releaseOneLead()).toEqual({ outcome: "none", assigned: 0 });
    // …and no new reload is attempted on its own.
    expect(await t.run((ctx) => maybeTriggerAutoReload(ctx, agent.accountId))).toBeNull();
    expect(await autoReloadOrders(agent.accountId)).toHaveLength(1);

    // The agent retries successfully: leads credited and distribution resumes.
    delete process.env.MOCK_AUTO_RELOAD_OUTCOME;
    await (await as(t, agent.userId)).mutation(api.payments.retryMockOrder, { orderId: order._id });
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 4, standard: 19 });
    expect((await t.run((ctx) => ctx.db.get(agent.accountId)))?.declinedPurchaseOutstanding).toBe(false);
    expect(await releaseOneLead()).toEqual({ outcome: "partial", assigned: 1 });
  });
});
