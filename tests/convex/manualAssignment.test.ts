import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  as,
  assignmentsFor,
  balanceOf,
  createAccount,
  createLead,
  expectAppError,
  ledgerOf,
  seedWorld,
  setupTest,
  teardownTest,
  type TestConvex,
  type World,
} from "./fixtures";

describe("manual assignment and revocation", () => {
  let t: TestConvex;
  let world: World;
  let admin: Awaited<ReturnType<typeof as>>;

  beforeEach(async () => {
    t = setupTest();
    world = await seedWorld(t);
    admin = await as(t, world.admin);
  });
  afterEach(teardownTest);

  const expectNothingAssigned = async (leadId: Id<"leads">, accountId: Id<"accounts">, balance: { exclusive: number; standard: number }) => {
    expect(await assignmentsFor(t, leadId)).toHaveLength(0);
    expect(await balanceOf(t, accountId)).toEqual(balance);
  };

  it("refuses an account without a licence in the lead state", async () => {
    const { accountId } = await createAccount(t, { states: ["GA"] });
    const leadId = await createLead(t, { state: "FL" });
    await expectAppError(admin.mutation(api.assignments.manualAssign, { leadId, accountId }), "INVALID", /Cannot assign: No FL licence on file/);
    await expectNothingAssigned(leadId, accountId, { exclusive: 2, standard: 8 });
  });

  it("refuses a Medicare lead for an account without TPMO approval", async () => {
    const { accountId } = await createAccount(t);
    const leadId = await createLead(t, { coverageType: "medicare" });
    await expectAppError(admin.mutation(api.assignments.manualAssign, { leadId, accountId }), "INVALID", /No Medicare TPMO approval/);
    await expectNothingAssigned(leadId, accountId, { exclusive: 2, standard: 8 });
  });

  it("refuses an account with a zero balance of the lead's type", async () => {
    const { accountId } = await createAccount(t, { balance: { exclusive: 0, standard: 4 } });
    const leadId = await createLead(t, { leadType: "exclusive", recipientTarget: 1 });
    await expectAppError(admin.mutation(api.assignments.manualAssign, { leadId, accountId }), "INVALID", /0 exclusive leads left/);
    await expectNothingAssigned(leadId, accountId, { exclusive: 0, standard: 4 });
  });

  it("refuses a suspended account and an expired E&O policy", async () => {
    const suspended = await createAccount(t, { status: "suspended" });
    const noEo = await createAccount(t, { eoExpiresAt: null });
    const leadId = await createLead(t);
    await expectAppError(admin.mutation(api.assignments.manualAssign, { leadId, accountId: suspended.accountId }), "INVALID", /Status is suspended/);
    await expectAppError(admin.mutation(api.assignments.manualAssign, { leadId, accountId: noEo.accountId }), "INVALID", /No E&O policy on file/);
  });

  it("reports every hard failure at once (full evaluation, not short-circuit)", async () => {
    const { accountId } = await createAccount(t, { states: ["GA"], eoExpiresAt: null, balance: {} });
    const leadId = await createLead(t, { state: "FL", coverageType: "medicare" });
    const error = await expectAppError(admin.mutation(api.assignments.manualAssign, { leadId, accountId }), "INVALID");
    expect(error.message).toMatch(/No FL licence on file/);
    expect(error.message).toMatch(/No E&O policy on file/);
    expect(error.message).toMatch(/No Medicare TPMO approval/);
    expect(error.message).toMatch(/0 standard leads left/);
  });

  it("allows overriding a soft rule (a paused agent) and debits one lead through the ledger", async () => {
    const { accountId } = await createAccount(t, { paused: true, qualityHold: true });
    const leadId = await createLead(t);

    const result = await admin.mutation(api.assignments.manualAssign, { leadId, accountId, note: "Agent asked for this one" });
    expect(result.overridden).toEqual(["Not manually paused", "No distribution hold"]);

    const [assignment] = await assignmentsFor(t, leadId);
    expect(assignment).toMatchObject({ accountId, method: "manual", assignedBy: world.admin });
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 2, standard: 7 });
    const debit = (await ledgerOf(t, accountId)).find((e) => e.entryType === "ASSIGNMENT");
    expect(debit).toMatchObject({ source: "admin", quantity: 1, relatedAssignmentId: assignment._id, createdBy: world.admin });

    const lead = await t.run((ctx) => ctx.db.get(leadId));
    expect(lead).toMatchObject({ status: "partially_assigned", assignedCount: 1 });
    const runs = await t.run((ctx) => ctx.db.query("distributionRuns").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect());
    expect(runs[0]).toMatchObject({ trigger: "manual", actorUserId: world.admin });
    expect(runs[0].reason).toMatch(/overrode: Not manually paused, No distribution hold/);

    const audit = await t.run((ctx) => ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", "assignment.manual")).collect());
    expect(audit).toHaveLength(1);
  });

  it("refuses to exceed the recipient target", async () => {
    const first = await createAccount(t);
    const second = await createAccount(t);
    const leadId = await createLead(t, { leadType: "exclusive", recipientTarget: 1 });
    await admin.mutation(api.assignments.manualAssign, { leadId, accountId: first.accountId });
    await expectAppError(admin.mutation(api.assignments.manualAssign, { leadId, accountId: second.accountId }), "INVALID");
    expect(await balanceOf(t, second.accountId)).toEqual({ exclusive: 2, standard: 8 });
  });

  it("revoking with return credits a REVOCATION_RETURN of the same type and keeps the assignment row", async () => {
    const { accountId } = await createAccount(t);
    const leadId = await createLead(t, { leadType: "exclusive", recipientTarget: 1 });
    const { assignmentId } = await admin.mutation(api.assignments.manualAssign, { leadId, accountId });
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 1, standard: 8 });
    const debitBefore = (await ledgerOf(t, accountId)).find((e) => e.entryType === "ASSIGNMENT")!;

    await admin.mutation(api.assignments.revoke, { assignmentId, reason: "Distribution error", returnLead: true, requeue: false });

    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 2, standard: 8 });
    const ledger = await ledgerOf(t, accountId);
    const returned = ledger.filter((e) => e.entryType === "REVOCATION_RETURN");
    expect(returned).toHaveLength(1);
    expect(returned[0]).toMatchObject({ leadType: "exclusive", direction: "credit", quantity: 1, relatedAssignmentId: assignmentId });
    expect(ledger.find((e) => e._id === debitBefore._id)).toEqual(debitBefore);

    const assignment = await t.run((ctx) => ctx.db.get(assignmentId));
    expect(assignment?.revokedAt).toBeDefined();
    expect(assignment?.ceaseContactAt).toBeDefined();
    expect(await t.run((ctx) => ctx.db.get(leadId))).toMatchObject({ status: "unassigned_pending", assignedCount: 0 });
    const cache = await t.run((ctx) => ctx.db.query("accountBalances").withIndex("by_account", (q) => q.eq("accountId", accountId)).unique());
    expect(cache?.exclusiveDelivered).toBe(0);

    const notices = await t.run((ctx) => ctx.db.query("notifications").withIndex("by_account", (q) => q.eq("accountId", accountId)).collect());
    expect(notices.find((n) => n.type === "compliance")?.channels).toEqual(["in_app", "email", "sms"]);

    // A revoked holder is never given the same lead again, even manually.
    await expectAppError(admin.mutation(api.assignments.manualAssign, { leadId, accountId }), "INVALID", /Already received this lead/);
    await expectAppError(admin.mutation(api.assignments.revoke, { assignmentId, reason: "Again please", returnLead: true, requeue: false }), "INVALID");
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 2, standard: 8 });
  });

  it("revoking without return leaves the balance debited", async () => {
    const { accountId } = await createAccount(t);
    const leadId = await createLead(t);
    const { assignmentId } = await admin.mutation(api.assignments.manualAssign, { leadId, accountId });
    await admin.mutation(api.assignments.revoke, { assignmentId, reason: "Fraud investigation", returnLead: false, requeue: false });
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 2, standard: 7 });
    expect((await ledgerOf(t, accountId)).some((e) => e.entryType === "REVOCATION_RETURN")).toBe(false);
  });

  it("revoke with requeue releases the lead to the next eligible account", async () => {
    const first = await createAccount(t);
    const leadId = await createLead(t, { leadType: "exclusive", recipientTarget: 1 });
    const { assignmentId } = await admin.mutation(api.assignments.manualAssign, { leadId, accountId: first.accountId });
    const second = await createAccount(t);

    const result = await admin.mutation(api.assignments.revoke, { assignmentId, reason: "Duplicate assignment", returnLead: true, requeue: true });
    expect(result.requeue?.outcome).toBe("assigned");
    const live = (await assignmentsFor(t, leadId)).filter((a) => !a.revokedAt);
    expect(live.map((a) => a.accountId)).toEqual([second.accountId]);
    expect(await balanceOf(t, first.accountId)).toEqual({ exclusive: 2, standard: 8 });
    expect(await balanceOf(t, second.accountId)).toEqual({ exclusive: 1, standard: 8 });
  });

  it("refuses manual assignment of a suppressed or withdrawn lead", async () => {
    const { accountId } = await createAccount(t);
    const withdrawn = await createLead(t, { withdrawnAt: Date.now() });
    await expectAppError(admin.mutation(api.assignments.manualAssign, { leadId: withdrawn, accountId }), "INVALID", /withdrew consent/);
    const suppressedLead = await createLead(t, { phone: "+14045550177" });
    await t.run((ctx) => ctx.db.insert("suppressionEntries", { channel: "phone", value: "+14045550177", reason: "admin", active: true, createdAt: Date.now() }));
    await expectAppError(admin.mutation(api.assignments.manualAssign, { leadId: suppressedLead, accountId }), "INVALID", /suppressed/);
    expect(await balanceOf(t, accountId)).toEqual({ exclusive: 2, standard: 8 });
  });
});
