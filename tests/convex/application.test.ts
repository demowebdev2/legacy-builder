import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { DAY } from "../../src/domain/time";
import { as, balanceOf, createLead, expectAppError, seedWorld, setupTest, teardownTest, TEST_NOW, type TestConvex, type World } from "./fixtures";

/**
 * Agent application → opening purchase authorised (not captured) → licence + E&O verified → approval
 * captures the payment (bypass mode) and credits the ledger → account active and receiving leads.
 */
describe("agent application and approval (bypass payments)", () => {
  let t: TestConvex;
  let world: World;
  let applicantUserId: Id<"users">;
  let applicant: Awaited<ReturnType<typeof as>>;

  const application = () => ({
    entityType: "individual" as const,
    firstName: "Denise",
    lastName: "Okafor",
    phone: "(704) 555-0362",
    npn: "9903312",
    residentState: "NC",
    licenses: [
      { state: "NC", licenseNumber: "NC-9903312", expiresAt: TEST_NOW + 220 * DAY },
      { state: "SC", licenseNumber: "SC-9903312", expiresAt: TEST_NOW + 190 * DAY },
    ],
    eoCarrier: "Berkley Insurance",
    eoExpiresAt: TEST_NOW + 200 * DAY,
    coverageTypes: ["final", "life"],
    dailyPace: 5,
    seats: 1,
    requestTpmo: false,
    tpmoAttested: false,
    quantity: 20,
    autoReload: false,
    agreementDocumentId: world.agreementDocId,
    agreements: { licensed: true, contactLaw: true, terms: true },
  });

  beforeEach(async () => {
    t = setupTest();
    world = await seedWorld(t);
    applicantUserId = await t.run((ctx) => ctx.db.insert("users", { email: "denise.okafor@example.com" }));
    applicant = await as(t, applicantUserId);
  });
  afterEach(teardownTest);

  it("runs from application to an active, funded account", async () => {
    const { accountId, orderId } = await applicant.mutation(api.applications.submit, application());

    const pending = await t.run(async (ctx) => ({ account: (await ctx.db.get(accountId))!, order: (await ctx.db.get(orderId))! }));
    expect(pending.account).toMatchObject({ status: "pending_verification", timezone: "America/New_York", openingQuantity: 20 });
    expect(pending.order).toMatchObject({ kind: "opening", status: "requires_payment", exclusiveQty: 4, standardQty: 16, totalCents: 52_000 });

    // Pending applicants cannot reach portal data, but can authorise their opening purchase.
    await expectAppError(applicant.query(api.leads.myLeads, {}), "FORBIDDEN");
    expect(await applicant.mutation(api.payments.completeMockPayment, { orderId, outcome: "succeed" })).toEqual({ status: "authorized" });
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 0, standard: 0 }); // authorised, not captured

    // Approval is refused until a licence and the E&O policy are verified.
    const admin = await as(t, world.admin);
    await expectAppError(admin.action(api.accountActions.approve, { accountId }), "INVALID", /Verify at least one state licence/);

    const { licenses, eo } = await t.run(async (ctx) => ({
      licenses: await ctx.db.query("licenses").withIndex("by_account", (q) => q.eq("accountId", accountId)).collect(),
      eo: (await ctx.db.query("eoPolicies").withIndex("by_account", (q) => q.eq("accountId", accountId)).first())!,
    }));
    const nc = licenses.find((l) => l.state === "NC")!;
    const sc = licenses.find((l) => l.state === "SC")!;
    await admin.mutation(api.licenses.verify, { licenseId: nc._id, decision: "verified" });
    await admin.mutation(api.licenses.verify, { licenseId: sc._id, decision: "failed", notes: "Licence number does not match NPN." });
    await admin.mutation(api.eoPolicies.verify, { policyId: eo._id, decision: "verified" });

    // Only staff with accounts.manage can approve.
    await expectAppError((await as(t, world.finance)).action(api.accountActions.approve, { accountId }), "FORBIDDEN");

    expect(await admin.action(api.accountActions.approve, { accountId })).toEqual({ ok: true });

    const approved = await t.run(async (ctx) => ({
      account: (await ctx.db.get(accountId))!,
      order: (await ctx.db.get(orderId))!,
      prefs: (await ctx.db.query("agentPreferences").withIndex("by_account", (q) => q.eq("accountId", accountId)).unique())!,
      credits: await ctx.db.query("leadBalanceLedger").withIndex("by_order", (q) => q.eq("relatedOrderId", orderId)).collect(),
    }));
    expect(approved.account.status).toBe("active");
    expect(approved.order.status).toBe("paid");
    expect(approved.credits.map((c) => [c.entryType, c.leadType, c.quantity]).sort()).toEqual([
      ["PURCHASE", "exclusive", 4],
      ["PURCHASE", "standard", 16],
    ]);
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 4, standard: 16 });
    // The unverified SC state is dropped from preferences so it can never route leads.
    expect(approved.prefs.states).toEqual(["NC"]);

    // A second approval (e.g. a double click) does not capture or credit again.
    await expectAppError(admin.action(api.accountActions.approve, { accountId }), "INVALID", /Only pending applications/);
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 4, standard: 16 });

    // The new agent now receives NC leads (receiving hours 8–20 Eastern; TEST_NOW is 14:00 Eastern).
    const leadId = await createLead(t, { state: "NC", coverageType: "final" });
    expect(await t.mutation(internal.distribution.engine.processLead, { leadId, trigger: "capture" })).toEqual({ outcome: "partial", assigned: 1 });
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 4, standard: 15 });
  });

  it("cannot be approved while the opening purchase is not authorised", async () => {
    const { accountId, orderId } = await applicant.mutation(api.applications.submit, application());
    await applicant.mutation(api.payments.completeMockPayment, { orderId, outcome: "decline" });
    await t.run(async (ctx) => {
      for (const l of await ctx.db.query("licenses").withIndex("by_account", (q) => q.eq("accountId", accountId)).collect()) {
        await ctx.db.patch(l._id, { verificationStatus: "verified", verifiedAt: TEST_NOW });
      }
      for (const p of await ctx.db.query("eoPolicies").withIndex("by_account", (q) => q.eq("accountId", accountId)).collect()) {
        await ctx.db.patch(p._id, { verificationStatus: "verified", verifiedAt: TEST_NOW });
      }
    });
    await expectAppError((await as(t, world.admin)).action(api.accountActions.approve, { accountId }), "PAYMENT_FAILED");
    expect((await t.run((ctx) => ctx.db.get(accountId)))?.status).toBe("pending_verification");
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 0, standard: 0 });
  });

  it("validates the application on the server", async () => {
    await expectAppError(applicant.mutation(api.applications.submit, { ...application(), quantity: 12 }), "INVALID", /steps of 5/);
    await expectAppError(applicant.mutation(api.applications.submit, { ...application(), coverageTypes: ["medicare"] }), "INVALID", /TPMO/);
    await expectAppError(
      applicant.mutation(api.applications.submit, { ...application(), licenses: [{ state: "NC", licenseNumber: "NC-1", expiresAt: TEST_NOW - DAY }] }),
      "INVALID",
      /expired/,
    );
    await expectAppError(applicant.mutation(api.applications.submit, { ...application(), agreements: { licensed: true, contactLaw: false, terms: true } }), "INVALID");
    expect(await t.run((ctx) => ctx.db.query("accounts").collect())).toHaveLength(0);

    // A login that already belongs to an account cannot apply again.
    await applicant.mutation(api.applications.submit, application());
    await expectAppError(applicant.mutation(api.applications.submit, { ...application(), npn: "1234567" }), "FORBIDDEN");
  });
});
