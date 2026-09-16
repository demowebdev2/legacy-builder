import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { HOUR, MINUTE } from "../../src/domain/time";
import {
  as,
  assignmentsFor,
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

describe("disputes (72-hour window)", () => {
  let t: TestConvex;
  let world: World;
  let agent: CreatedAccount;
  let asAgent: Awaited<ReturnType<typeof as>>;
  let assignmentId: Id<"leadAssignments">;

  /** Releases a fresh lead of the given type to the agent through the real engine at TEST_NOW. */
  const release = async (leadType: "standard" | "exclusive" = "standard") => {
    const leadId = await createLead(t, { leadType, recipientTarget: leadType === "exclusive" ? 1 : 3 });
    await t.mutation(internal.distribution.engine.processLead, { leadId, trigger: "capture" });
    const [assignment] = await assignmentsFor(t, leadId);
    expect(assignment.accountId).toBe(agent.accountId);
    return assignment._id;
  };

  beforeEach(async () => {
    t = setupTest();
    world = await seedWorld(t);
    agent = await createAccount(t);
    asAgent = await as(t, agent.userId);
    assignmentId = await release();
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 7 });
  });
  afterEach(teardownTest);

  it("the agent can dispute at 71h59m after release", async () => {
    vi.setSystemTime(TEST_NOW + 71 * HOUR + 59 * MINUTE);
    const result = await asAgent.mutation(api.disputes.submit, { assignmentId, reason: "disconnected", details: "Number is not in service." });
    expect(result.status).toBe("pending");
    const dispute = await t.run((ctx) => ctx.db.get(result.disputeId));
    expect(dispute).toMatchObject({ accountId: agent.accountId, leadType: "standard", status: "pending", submittedBy: agent.userId });
    // Raising a dispute changes nothing in the ledger.
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 7 });
  });

  it("the window is closed at 72h01m", async () => {
    vi.setSystemTime(TEST_NOW + 72 * HOUR + MINUTE);
    await expectAppError(asAgent.mutation(api.disputes.submit, { assignmentId, reason: "disconnected" }), "INVALID", /dispute window for this lead has closed/);
    expect(await t.run((ctx) => ctx.db.query("disputes").collect())).toHaveLength(0);
  });

  it("uses the deadline stored on the assignment (a stored past deadline closes the window)", async () => {
    await t.run((ctx) => ctx.db.patch(assignmentId, { disputeDeadlineAt: TEST_NOW - MINUTE }));
    await expectAppError(asAgent.mutation(api.disputes.submit, { assignmentId, reason: "wrong_number" }), "INVALID", /closed/);
  });

  it("a second dispute on the same assignment is rejected", async () => {
    await asAgent.mutation(api.disputes.submit, { assignmentId, reason: "never_enquired" });
    await expectAppError(asAgent.mutation(api.disputes.submit, { assignmentId, reason: "wrong_number" }), "INVALID", /already been raised/);
    expect(await t.run((ctx) => ctx.db.query("disputes").collect())).toHaveLength(1);
  });

  it("upheld: credits one DISPUTE_RETURN of the same lead type and leaves the ASSIGNMENT debit untouched", async () => {
    const { disputeId } = await asAgent.mutation(api.disputes.submit, { assignmentId, reason: "disconnected" });
    const debitBefore = (await ledgerOf(t, agent.accountId)).find((e) => e.entryType === "ASSIGNMENT")!;

    const support = await as(t, world.support);
    await support.mutation(api.disputes.decide, { disputeId, decision: "upheld", notes: "Carrier confirms the line is disconnected." });

    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 8 });
    const ledger = await ledgerOf(t, agent.accountId);
    expect(ledger.find((e) => e._id === debitBefore._id)).toEqual(debitBefore);
    const returns = ledger.filter((e) => e.entryType === "DISPUTE_RETURN");
    expect(returns).toHaveLength(1);
    expect(returns[0]).toMatchObject({ leadType: "standard", direction: "credit", quantity: 1, relatedDisputeId: disputeId, relatedAssignmentId: assignmentId, createdBy: world.support });

    const dispute = await t.run((ctx) => ctx.db.get(disputeId));
    expect(dispute).toMatchObject({ status: "upheld", returnLedgerEntryId: returns[0]._id, decidedBy: world.support, autoDecided: false });
    // The assignment itself is not revoked or rewritten by the decision.
    expect((await t.run((ctx) => ctx.db.get(assignmentId)))?.revokedAt).toBeUndefined();

    // Deciding twice cannot credit twice.
    await expectAppError(support.mutation(api.disputes.decide, { disputeId, decision: "upheld", notes: "Double click" }), "INVALID", /already been decided/);
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 8 });
  });

  it("upheld on an exclusive lead returns an exclusive lead", async () => {
    const exclusiveAssignment = await release("exclusive");
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 1, standard: 7 });
    const { disputeId } = await asAgent.mutation(api.disputes.submit, { assignmentId: exclusiveAssignment, reason: "deceased" });
    await (await as(t, world.admin)).mutation(api.disputes.decide, { disputeId, decision: "upheld", notes: "Confirmed by family." });
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 7 });
  });

  it("rejected: the balance is unchanged and no ledger entry is written", async () => {
    const { disputeId } = await asAgent.mutation(api.disputes.submit, { assignmentId, reason: "never_enquired" });
    const ledgerBefore = await ledgerOf(t, agent.accountId);
    await (await as(t, world.admin)).mutation(api.disputes.decide, { disputeId, decision: "rejected", notes: "Consent record matches the consumer." });
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 7 });
    expect(await ledgerOf(t, agent.accountId)).toEqual(ledgerBefore);
    expect(await t.run((ctx) => ctx.db.get(disputeId))).toMatchObject({ status: "rejected" });
  });

  it("a decision requires a written reason", async () => {
    const { disputeId } = await asAgent.mutation(api.disputes.submit, { assignmentId, reason: "wrong_number" });
    await expectAppError((await as(t, world.admin)).mutation(api.disputes.decide, { disputeId, decision: "upheld", notes: "ok" }), "INVALID");
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 7 });
  });

  it("auto-upholds an out-of-area dispute only when no verified licence was in force at release (D11)", async () => {
    // Licence verified 59 days ago → the system cannot confirm the claim → stays pending.
    const covered = await asAgent.mutation(api.disputes.submit, { assignmentId, reason: "out_of_area" });
    expect(covered.status).toBe("pending");

    // Simulate a distribution fault: the licence used for the next release was verified only after it.
    const second = await release();
    await t.run(async (ctx) => {
      const licences = await ctx.db.query("licenses").withIndex("by_account", (q) => q.eq("accountId", agent.accountId)).collect();
      for (const l of licences) await ctx.db.patch(l._id, { verifiedAt: TEST_NOW + HOUR });
    });
    const fault = await asAgent.mutation(api.disputes.submit, { assignmentId: second, reason: "out_of_area" });
    expect(fault.status).toBe("upheld");
    const dispute = await t.run((ctx) => ctx.db.get(fault.disputeId));
    expect(dispute).toMatchObject({ autoDecided: true, status: "upheld" });
    expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 7 });
  });

  describe("a released lead is returned to the balance at most once", () => {
    it("dispute pending → revoked with return → upholding the dispute cannot credit a second lead", async () => {
      const { disputeId } = await asAgent.mutation(api.disputes.submit, { assignmentId, reason: "disconnected" });
      const admin = await as(t, world.admin);
      await admin.mutation(api.assignments.revoke, { assignmentId, reason: "Consumer requested no contact", returnLead: true, requeue: false });
      expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 8 });

      await expectAppError(admin.mutation(api.disputes.decide, { disputeId, decision: "upheld", notes: "Carrier confirms disconnection." }), "INVALID", /already been returned/);
      expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 8 });
      const returns = (await ledgerOf(t, agent.accountId)).filter((e) => e.relatedAssignmentId === assignmentId && e.direction === "credit");
      expect(returns.map((e) => e.entryType)).toEqual(["REVOCATION_RETURN"]);

      // The dispute can still be closed without a credit.
      await admin.mutation(api.disputes.decide, { disputeId, decision: "rejected", notes: "Lead already returned on revocation." });
    });

    it("dispute upheld → revoking with return is refused (revoking without return still works)", async () => {
      const { disputeId } = await asAgent.mutation(api.disputes.submit, { assignmentId, reason: "disconnected" });
      const admin = await as(t, world.admin);
      await admin.mutation(api.disputes.decide, { disputeId, decision: "upheld", notes: "Carrier confirms disconnection." });
      expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 8 });

      await expectAppError(
        admin.mutation(api.assignments.revoke, { assignmentId, reason: "Consumer requested no contact", returnLead: true, requeue: false }),
        "INVALID",
        /already been returned/,
      );
      expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 8 });
      expect((await t.run((ctx) => ctx.db.get(assignmentId)))?.revokedAt).toBeUndefined();

      await admin.mutation(api.assignments.revoke, { assignmentId, reason: "Consumer requested no contact", returnLead: false, requeue: false });
      expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 8 });
    });

    it("revoked without return → an upheld dispute still returns the lead once", async () => {
      const { disputeId } = await asAgent.mutation(api.disputes.submit, { assignmentId, reason: "disconnected" });
      const admin = await as(t, world.admin);
      await admin.mutation(api.assignments.revoke, { assignmentId, reason: "Fraud investigation", returnLead: false, requeue: false });
      await admin.mutation(api.disputes.decide, { disputeId, decision: "upheld", notes: "Carrier confirms disconnection." });
      expect(await balanceOf(t, agent.accountId)).toEqual({ exclusive: 2, standard: 8 });
    });
  });

  it("another agent cannot dispute this agent's lead", async () => {
    const other = await createAccount(t);
    await expectAppError((await as(t, other.userId)).mutation(api.disputes.submit, { assignmentId, reason: "disconnected" }), "NOT_FOUND");
    expect(await t.run((ctx) => ctx.db.query("disputes").collect())).toHaveLength(0);
  });
});
