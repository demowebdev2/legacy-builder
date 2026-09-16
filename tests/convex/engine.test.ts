import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { releaseLeadToAccount } from "../../convex/distribution/assignment";
import { runDistribution } from "../../convex/distribution/engine";
import { SYSTEM_ACTOR } from "../../convex/lib/auth";
import { DAY, HOUR, MINUTE } from "../../src/domain/time";
import {
  as,
  assignmentsFor,
  balanceOf,
  createAccount,
  createLead,
  expectAppError,
  ledgerOf,
  scheduledFunctions,
  seedWorld,
  setupTest,
  teardownTest,
  TEST_NOW,
  type TestConvex,
} from "./fixtures";

const processLead = (t: TestConvex, leadId: Id<"leads">) => t.mutation(internal.distribution.engine.processLead, { leadId, trigger: "capture" });
const getLead = (t: TestConvex, leadId: Id<"leads">) => t.run(async (ctx) => (await ctx.db.get(leadId))!);
const runsFor = (t: TestConvex, leadId: Id<"leads">) =>
  t.run((ctx) => ctx.db.query("distributionRuns").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect());

describe("distribution engine", () => {
  let t: TestConvex;

  afterEach(teardownTest);

  describe("with the engine on", () => {
    beforeEach(async () => {
      t = setupTest();
      await seedWorld(t);
    });

    it("releases a STANDARD lead to 3 eligible accounts and debits each exactly one standard lead", async () => {
      const accounts = await Promise.all([1, 2, 3, 4].map(() => createAccount(t)));
      const leadId = await createLead(t, { leadType: "standard" });

      expect(await processLead(t, leadId)).toEqual({ outcome: "assigned", assigned: 3 });

      const assignments = await assignmentsFor(t, leadId);
      expect(assignments).toHaveLength(3);
      expect(new Set(assignments.map((a) => a.accountId)).size).toBe(3);

      for (const { accountId } of accounts) {
        const assignment = assignments.find((a) => a.accountId === accountId);
        const ledger = await ledgerOf(t, accountId);
        const debits = ledger.filter((e) => e.entryType === "ASSIGNMENT");
        if (assignment) {
          expect(await balanceOf(t, accountId)).toEqual({ exclusive: 2, standard: 7 });
          expect(debits).toHaveLength(1);
          expect(debits[0]).toMatchObject({ leadType: "standard", quantity: 1, delta: -1, relatedLeadId: leadId, relatedAssignmentId: assignment._id, source: "engine" });
          expect(assignment).toMatchObject({ method: "auto", leadType: "standard", status: "new", ledgerEntryId: debits[0]._id, disputeDeadlineAt: TEST_NOW + 72 * 60 * MINUTE });
          expect(assignment.scoreSnapshot?.position).toBeGreaterThanOrEqual(1);
        } else {
          expect(await balanceOf(t, accountId)).toEqual({ exclusive: 2, standard: 8 });
          expect(debits).toHaveLength(0);
        }
      }

      const lead = await getLead(t, leadId);
      expect(lead).toMatchObject({ status: "assigned", assignedCount: 3, recipientTarget: 3, firstAssignedAt: TEST_NOW });
      expect(lead.nextRetryAt).toBeUndefined();
      const [run] = await runsFor(t, leadId);
      expect(run).toMatchObject({ outcome: "assigned", evaluatedCount: 4, eligibleCount: 4, assignedCount: 3, slotsTarget: 3 });
      expect(run.trace.filter((r) => r.assigned)).toHaveLength(3);
    });

    it("releases an EXCLUSIVE lead to exactly one account", async () => {
      const accounts = await Promise.all([1, 2, 3].map(() => createAccount(t)));
      const leadId = await createLead(t, { leadType: "exclusive", recipientTarget: 1 });

      expect(await processLead(t, leadId)).toEqual({ outcome: "assigned", assigned: 1 });
      const [assignment] = await assignmentsFor(t, leadId);
      expect(await assignmentsFor(t, leadId)).toHaveLength(1);
      for (const { accountId } of accounts) {
        const expected = accountId === assignment.accountId ? { exclusive: 1, standard: 8 } : { exclusive: 2, standard: 8 };
        expect(await balanceOf(t, accountId)).toEqual(expected);
      }
      expect(await getLead(t, leadId)).toMatchObject({ status: "assigned", assignedCount: 1 });
    });

    it("running the engine again never double-assigns or double-debits", async () => {
      const accounts = await Promise.all([1, 2, 3].map(() => createAccount(t)));
      const leadId = await createLead(t);
      await processLead(t, leadId);
      const balancesAfterFirstRun = await Promise.all(accounts.map((a) => balanceOf(t, a.accountId)));

      // 1. A duplicate scheduled run for an assigned lead is skipped.
      expect(await processLead(t, leadId)).toEqual({ outcome: "skipped", assigned: 0 });

      // 2. Even if a stale run still sees the lead as queued, every slot is already filled.
      await t.run((ctx) => ctx.db.patch(leadId, { status: "queued" }));
      const outcome = await t.run((ctx) => runDistribution(ctx, leadId, { trigger: "capture" }));
      expect(outcome.assigned).toHaveLength(0);
      expect(outcome.reason).toBe("All recipient slots already filled");

      // 3. The release primitive itself refuses a second assignment of the same lead to the same account.
      const lead = await getLead(t, leadId);
      await expectAppError(
        t.run((ctx) =>
          releaseLeadToAccount(ctx, { lead, accountId: accounts[0].accountId, method: "auto", actor: SYSTEM_ACTOR, now: Date.now(), disputeWindowHours: 72, settingsVersionId: null }),
        ),
        "CONFLICT",
      );

      expect(await assignmentsFor(t, leadId)).toHaveLength(3);
      expect(await Promise.all(accounts.map((a) => balanceOf(t, a.accountId)))).toEqual(balancesAfterFirstRun);
      for (const a of accounts) expect((await ledgerOf(t, a.accountId)).filter((e) => e.entryType === "ASSIGNMENT")).toHaveLength(1);
    });

    it("a partially assigned lead only fills the remaining slots on the next run", async () => {
      const first = await createAccount(t);
      const leadId = await createLead(t);
      expect(await processLead(t, leadId)).toEqual({ outcome: "partial", assigned: 1 });
      expect(await getLead(t, leadId)).toMatchObject({ status: "partially_assigned", assignedCount: 1 });

      const second = await createAccount(t);
      const third = await createAccount(t);
      const fourth = await createAccount(t);
      const outcome = await t.run((ctx) => runDistribution(ctx, leadId, { trigger: "retry" }));
      expect(outcome.outcome).toBe("assigned");
      expect(outcome.assigned).toHaveLength(2);
      expect(outcome.assigned.map((a) => a.accountId)).not.toContain(first.accountId);

      expect(await assignmentsFor(t, leadId)).toHaveLength(3);
      const balances = await Promise.all([first, second, third, fourth].map((a) => balanceOf(t, a.accountId)));
      // Exactly three accounts were debited once each; the first holder was not debited a second time.
      expect(balances.filter((b) => b.standard === 7)).toHaveLength(3);
      expect(balances.filter((b) => b.standard === 8)).toHaveLength(1);
      expect(await balanceOf(t, first.accountId)).toEqual({ exclusive: 2, standard: 7 });
    });

    it("skips accounts without a balance of the lead's type", async () => {
      const broke = await createAccount(t, { balance: { exclusive: 5, standard: 0 } });
      const funded = await createAccount(t, { balance: { exclusive: 0, standard: 1 } });
      const leadId = await createLead(t, { leadType: "standard" });

      expect(await processLead(t, leadId)).toEqual({ outcome: "partial", assigned: 1 });
      expect((await assignmentsFor(t, leadId)).map((a) => a.accountId)).toEqual([funded.accountId]);
      expect(await balanceOf(t, broke.accountId)).toEqual({ exclusive: 5, standard: 0 });
      expect(await ledgerOf(t, broke.accountId)).toHaveLength(1); // only the fixture purchase
      expect(await balanceOf(t, funded.accountId)).toEqual({ exclusive: 0, standard: 0 });

      const [run] = await runsFor(t, leadId);
      expect(run.trace.find((r) => r.accountId === broke.accountId)).toMatchObject({ eligible: false, failedRule: "Lead balance ≥ 1 of this type", assigned: false });

      // With the last standard lead spent, the funded account is now ineligible too.
      const next = await createLead(t, { leadType: "standard" });
      expect(await processLead(t, next)).toEqual({ outcome: "none", assigned: 0 });
    });

    it("does not release a lead in a state where the account holds no verified licence", async () => {
      // The agent *prefers* FL leads but only holds a GA licence; another has an unverified FL licence.
      const gaOnly = await createAccount(t, { states: ["GA", "FL"], licenses: [{ state: "GA" }] });
      const unverified = await createAccount(t, { states: ["FL"], licenses: [{ state: "FL", status: "unverified" }] });
      const leadId = await createLead(t, { state: "FL" });

      expect(await processLead(t, leadId)).toEqual({ outcome: "none", assigned: 0 });
      expect(await assignmentsFor(t, leadId)).toHaveLength(0);
      const [run] = await runsFor(t, leadId);
      for (const { accountId } of [gaOnly, unverified]) {
        expect(run.trace.find((r) => r.accountId === accountId)?.failedRule).toBe("Verified licence in lead state");
      }
      expect(await balanceOf(t, gaOnly.accountId)).toEqual({ exclusive: 2, standard: 8 });
    });

    it("rejects an account whose licence has expired", async () => {
      const expired = await createAccount(t, { licenses: [{ state: "GA", status: "verified", expiresAt: TEST_NOW - DAY }] });
      const leadId = await createLead(t);
      expect(await processLead(t, leadId)).toEqual({ outcome: "none", assigned: 0 });
      const [run] = await runsFor(t, leadId);
      const row = run.trace.find((r) => r.accountId === expired.accountId)!;
      expect(row.failedRule).toBe("Verified licence in lead state");
      expect(row.rules.find((r) => r.key === "state_license")?.reason).toBe("GA licence expired");
    });

    it("rejects an account whose E&O has expired", async () => {
      await createAccount(t, { eoExpiresAt: TEST_NOW - DAY });
      const leadId = await createLead(t);
      expect(await processLead(t, leadId)).toEqual({ outcome: "none", assigned: 0 });
    });

    it("releases a Medicare lead only to an account with TPMO approval", async () => {
      const withoutTpmo = await createAccount(t, { coverageTypes: ["medicare"] });
      const withTpmo = await createAccount(t, { coverageTypes: ["medicare"], tpmo: true });
      const leadId = await createLead(t, { coverageType: "medicare" });

      await processLead(t, leadId);
      expect((await assignmentsFor(t, leadId)).map((a) => a.accountId)).toEqual([withTpmo.accountId]);
      const [run] = await runsFor(t, leadId);
      expect(run.trace.find((r) => r.accountId === withoutTpmo.accountId)?.failedRule).toBe("Medicare TPMO approval in force");
      expect(await balanceOf(t, withoutTpmo.accountId)).toEqual({ exclusive: 2, standard: 8 });

      // The account without TPMO still receives non-Medicare leads it takes.
      const life = await createAccount(t, { coverageTypes: ["life"] });
      const lifeLead = await createLead(t, { coverageType: "life" });
      await processLead(t, lifeLead);
      expect((await assignmentsFor(t, lifeLead)).map((a) => a.accountId)).toEqual([life.accountId]);
    });

    it.each(["phone", "email"] as const)("a suppressed %s blocks release and marks the lead suppressed", async (channel) => {
      const account = await createAccount(t);
      const leadId = await createLead(t, { phone: "+14045550111", email: "suppressed@example.com" });
      await t.run((ctx) =>
        ctx.db.insert("suppressionEntries", {
          channel,
          value: channel === "phone" ? "+14045550111" : "suppressed@example.com",
          reason: "sms_stop",
          active: true,
          createdAt: TEST_NOW - DAY,
        }),
      );

      expect(await processLead(t, leadId)).toEqual({ outcome: "skipped", assigned: 0 });
      expect(await getLead(t, leadId)).toMatchObject({ status: "suppressed", suppressedAt: TEST_NOW });
      expect(await assignmentsFor(t, leadId)).toHaveLength(0);
      expect(await balanceOf(t, account.accountId)).toEqual({ exclusive: 2, standard: 8 });
      const [run] = await runsFor(t, leadId);
      expect(run).toMatchObject({ outcome: "skipped", reason: `Contact is on the suppression register (${channel})` });
    });

    it("a lifted suppression no longer blocks release", async () => {
      await createAccount(t);
      const leadId = await createLead(t, { phone: "+14045550112" });
      await t.run((ctx) =>
        ctx.db.insert("suppressionEntries", { channel: "phone", value: "+14045550112", reason: "admin", active: false, createdAt: TEST_NOW - DAY, liftedAt: TEST_NOW - HOUR }),
      );
      expect(await processLead(t, leadId)).toEqual({ outcome: "partial", assigned: 1 });
    });

    it("never releases a lead whose consumer withdrew consent", async () => {
      await createAccount(t);
      const leadId = await createLead(t, { withdrawnAt: TEST_NOW - MINUTE });
      expect(await processLead(t, leadId)).toEqual({ outcome: "skipped", assigned: 0 });
      expect(await getLead(t, leadId)).toMatchObject({ status: "withdrawn" });
    });

    it("skips paused, held, declined and seatless-agency accounts", async () => {
      await createAccount(t, { paused: true });
      await createAccount(t, { qualityHold: true });
      await createAccount(t, { declinedPurchaseOutstanding: true });
      await createAccount(t, { status: "suspended" });
      await createAccount(t, { type: "agency", verifiedProducerSeat: false });
      const resumed = await createAccount(t, { paused: true, pausedUntil: TEST_NOW - MINUTE });
      const agency = await createAccount(t, { type: "agency" });
      const leadId = await createLead(t);

      await processLead(t, leadId);
      const holders = (await assignmentsFor(t, leadId)).map((a) => a.accountId).sort();
      expect(holders).toEqual([resumed.accountId, agency.accountId].sort());
      const [run] = await runsFor(t, leadId);
      expect(run.trace.map((r) => r.failedRule).filter(Boolean).sort()).toEqual(
        ["Account status is active", "Agency has an active verified seat", "No declined purchase outstanding", "No distribution hold", "Not manually paused"].sort(),
      );
    });

    it("with no eligible account the lead waits as unassigned_pending with the retry ladder scheduled", async () => {
      await createAccount(t, { states: ["TN"] });
      const leadId = await createLead(t, { state: "GA" });

      expect(await processLead(t, leadId)).toEqual({ outcome: "none", assigned: 0 });
      const lead = await getLead(t, leadId);
      expect(lead).toMatchObject({ status: "unassigned_pending", assignedCount: 0, retryAttempt: 1, retryBaseAt: TEST_NOW, nextRetryAt: TEST_NOW + 5 * MINUTE });
      const [run] = await runsFor(t, leadId);
      expect(run.outcome).toBe("none");
      expect(run.reason).toMatch(/No eligible account — most common block: "Lead state in preferences"/);

      const jobs = await scheduledFunctions(t);
      const byName = (name: string) => jobs.filter((j) => j.name === name);
      expect(byName("distribution/retry:retryLead")).toHaveLength(1);
      expect(byName("distribution/retry:retryLead")[0]).toMatchObject({ args: [{ leadId, attempt: 1 }], scheduledTime: TEST_NOW + 5 * MINUTE });
      expect(byName("distribution/retry:alertIfUnassigned")[0].scheduledTime).toBe(TEST_NOW + 120 * MINUTE);
      expect(byName("distribution/retry:markUnassignableIfStill")[0].scheduledTime).toBe(TEST_NOW + 2880 * MINUTE);
    });

    it("the scheduled retry releases the lead once an agent becomes eligible", async () => {
      const leadId = await createLead(t);
      await processLead(t, leadId);
      expect((await getLead(t, leadId)).status).toBe("unassigned_pending");

      const agent = await createAccount(t);
      vi.advanceTimersByTime(5 * MINUTE);
      await t.finishInProgressScheduledFunctions();

      expect((await assignmentsFor(t, leadId)).map((a) => a.accountId)).toEqual([agent.accountId]);
      const lead = await getLead(t, leadId);
      expect(lead).toMatchObject({ status: "partially_assigned", assignedCount: 1, retryAttempt: 2 });
      const runs = await runsFor(t, leadId);
      expect(runs.map((r) => [r.trigger, r.outcome])).toEqual([
        ["capture", "none"],
        ["retry", "partial"],
      ]);
    });

    it("the ladder ends with the lead unassignable and staff alerted — nothing is deleted", async () => {
      const leadId = await createLead(t);
      await processLead(t, leadId);
      // Walk the clock through each scheduled step in order so every job runs against the state it expects.
      let elapsed = 0;
      for (const minutes of [5, 15, 60, 120, 240, 720, 1440, 2880]) {
        vi.advanceTimersByTime((minutes - elapsed) * MINUTE);
        elapsed = minutes;
        await t.finishInProgressScheduledFunctions();
      }

      const lead = await getLead(t, leadId);
      expect(lead.status).toBe("unassignable");
      expect(lead.adminAlertedAt).toBeDefined();
      expect(lead.unassignableAt).toBeDefined();
      const runs = await runsFor(t, leadId);
      expect(runs.map((r) => r.trigger)).toEqual(["capture", "retry", "retry", "retry", "retry", "retry", "retry"]);
      expect(runs.every((r) => r.outcome === "none")).toBe(true);
      const staffAlerts = await t.run((ctx) => ctx.db.query("notifications").withIndex("by_audience", (q) => q.eq("audience", "staff")).collect());
      expect(staffAlerts.map((n) => n.title)).toEqual(expect.arrayContaining([expect.stringMatching(/still unassigned/), expect.stringMatching(/is unassignable/)]));
    });
  });

  describe("settings and account lifecycle", () => {
    beforeEach(async () => {
      t = setupTest();
    });

    it("settings changes are validated, versioned and only affect later releases", async () => {
      const world = await seedWorld(t);
      const admin = await as(t, world.admin);
      await Promise.all([1, 2, 3].map(() => createAccount(t)));

      const before = await createLead(t);
      await processLead(t, before);
      expect(await assignmentsFor(t, before)).toHaveLength(3);

      await expectAppError(admin.mutation(api.distribution.admin.updateSettings, { retryScheduleMinutes: [5, 5], note: "Faster retries" }), "INVALID", /must increase/);
      await expectAppError(
        admin.mutation(api.distribution.admin.updateSettings, { weights: { waitingLongest: 50, contactRate: 50, balanceRemaining: 50, volumePurchased: 0 }, note: "Bad weights" }),
        "INVALID",
        /add up to 100/,
      );
      const versionId = await admin.mutation(api.distribution.admin.updateSettings, { standardRecipientCount: 1, note: "Launch with one agent per standard lead" });
      expect(await t.run((ctx) => ctx.db.query("distributionSettings").collect())).toHaveLength(2);

      const after = await createLead(t, { recipientTarget: 1 });
      await processLead(t, after);
      const [newAssignment] = await assignmentsFor(t, after);
      expect(await assignmentsFor(t, after)).toHaveLength(1);
      expect(newAssignment.settingsVersionId).toBe(versionId);

      // History is not rewritten: the earlier release keeps its three holders and the original settings version.
      const old = await assignmentsFor(t, before);
      expect(old).toHaveLength(3);
      expect(old.every((a) => a.settingsVersionId === world.settingsId)).toBe(true);
      const audit = await t.run((ctx) => ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", "distribution.settings")).collect());
      expect(audit).toHaveLength(1);
    });

    it("suspending an account freezes its balance (never forfeits it) and restoring resumes lead flow", async () => {
      const world = await seedWorld(t);
      const support = await as(t, world.support);
      const { accountId } = await createAccount(t);

      await support.mutation(api.accounts.suspend, { accountId, reason: "E&O cover lapsed" });
      const held = await createLead(t);
      expect(await processLead(t, held)).toEqual({ outcome: "none", assigned: 0 });
      expect(await balanceOf(t, accountId)).toEqual({ exclusive: 2, standard: 8 });

      await support.mutation(api.accounts.restore, { accountId, note: "Renewal evidence uploaded" });
      const released = await createLead(t);
      expect(await processLead(t, released)).toEqual({ outcome: "partial", assigned: 1 });
      expect(await balanceOf(t, accountId)).toEqual({ exclusive: 2, standard: 7 });
    });
  });

  describe("with the engine switched off", () => {
    beforeEach(async () => {
      t = setupTest();
      await seedWorld(t, { engineEnabled: false });
    });

    it("holds the lead in the queue without assigning, debiting or scheduling retries", async () => {
      const account = await createAccount(t);
      const leadId = await createLead(t);

      expect(await processLead(t, leadId)).toEqual({ outcome: "held", assigned: 0 });
      const lead = await getLead(t, leadId);
      expect(lead).toMatchObject({ status: "queued", assignedCount: 0, retryAttempt: 0 });
      expect(lead.nextRetryAt).toBeUndefined();
      const [run] = await runsFor(t, leadId);
      expect(run).toMatchObject({ outcome: "held", engineEnabled: false });
      expect(await assignmentsFor(t, leadId)).toHaveLength(0);
      expect(await balanceOf(t, account.accountId)).toEqual({ exclusive: 2, standard: 8 });
      expect(await scheduledFunctions(t)).toHaveLength(0);
    });
  });
});

