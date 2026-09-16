import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  as,
  assignmentsFor,
  balanceOf,
  type CreatedAccount,
  createAccount,
  createLead,
  expectAppError,
  seedWorld,
  setupTest,
  teardownTest,
  TEST_NOW,
  type TestConvex,
  type World,
} from "./fixtures";

const PAGE = { paginationOpts: { numItems: 50, cursor: null } };

describe("authorisation and data isolation", () => {
  let t: TestConvex;
  let world: World;

  beforeEach(async () => {
    t = setupTest();
    world = await seedWorld(t);
  });
  afterEach(() => {
    process.env.REQUIRE_STAFF_2FA = "false";
    teardownTest();
  });

  /** Releases a lead to exactly `account` (the only eligible candidate at the time). */
  const releaseTo = async (account: CreatedAccount, overrides: { state?: string } = {}) => {
    const leadId = await createLead(t, { leadType: "exclusive", recipientTarget: 1, ...overrides });
    await t.run(async (ctx) => {
      // Make every other account temporarily ineligible so the engine picks `account`.
      const others = (await ctx.db.query("accounts").collect()).filter((a) => a._id !== account.accountId && a.status === "active");
      for (const other of others) await ctx.db.patch(other._id, { status: "suspended" });
    });
    await t.mutation(internal.distribution.engine.processLead, { leadId, trigger: "capture" });
    await t.run(async (ctx) => {
      for (const a of await ctx.db.query("accounts").withIndex("by_status", (q) => q.eq("status", "suspended")).collect()) {
        await ctx.db.patch(a._id, { status: "active" });
      }
    });
    const [assignment] = await assignmentsFor(t, leadId);
    expect(assignment.accountId).toBe(account.accountId);
    return { leadId, assignmentId: assignment._id };
  };

  describe("agent-to-agent isolation", () => {
    let a: CreatedAccount;
    let b: CreatedAccount;
    let asA: Awaited<ReturnType<typeof as>>;
    let bLead: { leadId: Id<"leads">; assignmentId: Id<"leadAssignments"> };
    let bOrderId: Id<"orders">;

    beforeEach(async () => {
      a = await createAccount(t, { name: "Alicia Reyes" });
      b = await createAccount(t, { name: "Marcus Whitfield" });
      asA = await as(t, a.userId);
      bLead = await releaseTo(b);
      const asB = await as(t, b.userId);
      ({ orderId: bOrderId } = await asB.mutation(api.orders.createTopUp, { quantity: 10 }));
    });

    it("agent A cannot open agent B's lead", async () => {
      expect(await asA.query(api.leads.myLead, { assignmentId: bLead.assignmentId })).toEqual({ forbidden: true });
      const list = await asA.query(api.leads.myLeads, {});
      expect(list.total).toBe(0);
      // B can.
      const asB = await as(t, b.userId);
      expect((await asB.query(api.leads.myLead, { assignmentId: bLead.assignmentId })).forbidden).toBe(false);
    });

    it("agent A cannot see B's ledger, orders or notifications", async () => {
      const ledger = await asA.query(api.ledger.myLedger, PAGE);
      expect(ledger.page.length).toBeGreaterThan(0);
      expect(ledger.page.every((e) => e.accountId === a.accountId)).toBe(true);

      expect(await asA.query(api.orders.myOrder, { orderId: bOrderId })).toBeNull();
      const orders = await asA.query(api.orders.myOrders, PAGE);
      expect(orders.page).toHaveLength(0);

      const bNotifications = await t.run((ctx) => ctx.db.query("notifications").withIndex("by_account", (q) => q.eq("accountId", b.accountId)).collect());
      expect(bNotifications.length).toBeGreaterThan(0);
      const mine = await asA.query(api.notifications.mine, PAGE);
      expect(mine.page.every((n) => n.accountId === a.accountId)).toBe(true);
      await expectAppError(asA.mutation(api.notifications.markRead, { notificationId: bNotifications[0]._id }), "NOT_FOUND");
    });

    it("agent A cannot act on B's lead or order", async () => {
      await expectAppError(asA.mutation(api.assignments.updateStatus, { assignmentId: bLead.assignmentId, status: "contacted" }), "NOT_FOUND");
      await expectAppError(asA.mutation(api.disputes.submit, { assignmentId: bLead.assignmentId, reason: "disconnected" }), "NOT_FOUND");
      await expectAppError(asA.mutation(api.payments.completeMockPayment, { orderId: bOrderId, outcome: "succeed" }), "NOT_FOUND");
      expect(await balanceOf(t, b.accountId)).toEqual({ exclusive: 1, standard: 8 });
      expect((await t.run((ctx) => ctx.db.get(bOrderId)))?.status).toBe("requires_payment");
    });

    it("the account is always derived from the login: an accountId argument is rejected, not honoured", async () => {
      await expect(asA.query(api.ledger.myBalance, { accountId: b.accountId } as unknown as Record<string, never>)).rejects.toThrow(/accountId/);
      await expect(
        asA.mutation(api.orders.createTopUp, { quantity: 10, accountId: b.accountId } as unknown as { quantity: number }),
      ).rejects.toThrow(/accountId/);
      expect(await asA.query(api.ledger.myBalance, {})).toMatchObject({ exclusive: 2, standard: 8 });
    });
  });

  describe("agency seats", () => {
    it("a PRODUCER only sees assignments handed to their seat", async () => {
      const agency = await createAccount(t, { type: "agency" });
      // The producer needs their own verified GA licence before a GA lead can be handed to them.
      await t.run((ctx) =>
        ctx.db.insert("licenses", {
          accountId: agency.accountId,
          memberId: agency.producerMemberId,
          state: "GA",
          licenseNumber: "GA-PRODUCER",
          expiresAt: TEST_NOW + 300 * 24 * 3600 * 1000,
          verificationStatus: "verified",
          verifiedAt: TEST_NOW - 1000,
          submittedAt: TEST_NOW - 2000,
        }),
      );
      const handed = await releaseTo(agency);
      const pooled = await releaseTo(agency);

      const principal = await as(t, agency.userId);
      const producer = await as(t, agency.producerUserId!);

      expect((await producer.query(api.leads.myLeads, {})).total).toBe(0);
      await principal.mutation(api.assignments.handOut, { assignmentId: handed.assignmentId, memberId: agency.producerMemberId });

      const producerLeads = await producer.query(api.leads.myLeads, {});
      expect(producerLeads.page.map((l) => l.assignmentId)).toEqual([handed.assignmentId]);
      expect((await producer.query(api.leads.myLead, { assignmentId: handed.assignmentId })).forbidden).toBe(false);
      expect(await producer.query(api.leads.myLead, { assignmentId: pooled.assignmentId })).toEqual({ forbidden: true });
      await expectAppError(producer.mutation(api.assignments.updateStatus, { assignmentId: pooled.assignmentId, status: "contacted" }), "NOT_FOUND");
      await producer.mutation(api.assignments.updateStatus, { assignmentId: handed.assignmentId, status: "contacted" });

      // The principal sees the whole pool; producers cannot hand out, buy or read the ledger.
      expect((await principal.query(api.leads.myLeads, {})).total).toBe(2);
      await expectAppError(producer.mutation(api.assignments.handOut, { assignmentId: pooled.assignmentId, memberId: agency.producerMemberId }), "FORBIDDEN");
      await expectAppError(producer.query(api.ledger.myLedger, PAGE), "FORBIDDEN");
    });

    it("a deactivated seat loses access", async () => {
      const agency = await createAccount(t, { type: "agency" });
      await t.run((ctx) => ctx.db.patch(agency.producerMemberId!, { status: "deactivated" }));
      await expectAppError((await as(t, agency.producerUserId!)).query(api.leads.myLeads, {}), "FORBIDDEN");
    });
  });

  describe("staff roles", () => {
    let leadId: Id<"leads">;
    let disputeId: Id<"disputes">;
    let accountId: Id<"accounts">;

    beforeEach(async () => {
      const agent = await createAccount(t);
      accountId = agent.accountId;
      const released = await releaseTo(agent);
      leadId = released.leadId;
      ({ disputeId } = await (await as(t, agent.userId)).mutation(api.disputes.submit, { assignmentId: released.assignmentId, reason: "wrong_number" }));
    });

    it("FINANCE cannot reveal consumer PII, decide disputes or change distribution settings", async () => {
      const finance = await as(t, world.finance);
      await expectAppError(finance.mutation(api.leads.revealContact, { leadId }), "FORBIDDEN");
      await expectAppError(finance.mutation(api.disputes.decide, { disputeId, decision: "upheld", notes: "Looks fine to me" }), "FORBIDDEN");
      await expectAppError(finance.mutation(api.distribution.admin.updateSettings, { standardRecipientCount: 1, note: "Finance tweak" }), "FORBIDDEN");
      await expectAppError(finance.mutation(api.distribution.admin.setEngineEnabled, { enabled: false }), "FORBIDDEN");

      expect((await t.run((ctx) => ctx.db.get(disputeId)))?.status).toBe("pending");
      expect(await t.run((ctx) => ctx.db.query("distributionSettings").collect())).toHaveLength(1);
      expect(await t.run((ctx) => ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", "lead.pii_view")).collect())).toHaveLength(0);

      // Positive control: finance can adjust the ledger, and sees leads without PII.
      await finance.mutation(api.ledger.adjust, { accountId, leadType: "standard", direction: "credit", quantity: 1, reason: "Goodwill credit" });
      const detail = await finance.query(api.leads.adminGet, { leadId });
      expect(detail?.canSeePii).toBe(false);
      expect(detail?.lead.phone).toMatch(/^•••/);
    });

    it("SUPPORT cannot adjust the ledger but can reveal PII (audited) and decide disputes", async () => {
      const support = await as(t, world.support);
      await expectAppError(
        support.mutation(api.ledger.adjust, { accountId, leadType: "standard", direction: "credit", quantity: 5, reason: "Friendly gesture" }),
        "FORBIDDEN",
      );
      expect(await balanceOf(t, accountId)).toEqual({ exclusive: 1, standard: 8 });

      const contact = await support.mutation(api.leads.revealContact, { leadId });
      expect(contact.phone).toMatch(/^\+1\d{10}$/);
      const audits = await t.run((ctx) => ctx.db.query("auditLogs").withIndex("by_action", (q) => q.eq("action", "lead.pii_view")).collect());
      expect(audits).toMatchObject([{ actorUserId: world.support, entityId: leadId }]);

      await support.mutation(api.disputes.decide, { disputeId, decision: "rejected", notes: "Number verified as correct." });
    });

    it("CONTENT can draft legal documents but cannot publish them", async () => {
      const content = await as(t, world.content);
      const documentId = await content.mutation(api.legalDocuments.createDraft, { docType: "privacy_policy", content: "A brand new privacy policy text for review." });
      await content.mutation(api.legalDocuments.submitForApproval, { documentId });
      await expectAppError(content.mutation(api.legalDocuments.publish, { documentId }), "FORBIDDEN");
      await expectAppError(content.mutation(api.leads.revealContact, { leadId }), "FORBIDDEN");
      await expectAppError(content.mutation(api.ledger.adjust, { accountId, leadType: "standard", direction: "credit", quantity: 1, reason: "Not allowed" }), "FORBIDDEN");
      expect((await t.run((ctx) => ctx.db.get(documentId)))?.status).toBe("pending_approval");

      // An ADMIN who did not author it may publish.
      await (await as(t, world.admin)).mutation(api.legalDocuments.publish, { documentId });
      expect((await t.run((ctx) => ctx.db.get(documentId)))?.status).toBe("published");
      expect((await t.run((ctx) => ctx.db.get(world.privacyDocId)))?.status).toBe("superseded");
    });

    it("four-eyes: an admin cannot publish a legal version they authored or submitted", async () => {
      const author = await as(t, world.admin);
      const documentId = await author.mutation(api.legalDocuments.createDraft, {
        docType: "consumer_consent",
        content: "Updated consent wording that needs a second admin to approve.",
      });
      await author.mutation(api.legalDocuments.submitForApproval, { documentId });
      await expectAppError(author.mutation(api.legalDocuments.publish, { documentId }), "FORBIDDEN", /Four-eyes/);
      expect((await t.query(api.legalDocuments.published, { docType: "consumer_consent" }))?.id).toBe(world.consentDocId);

      // A different ADMIN may publish it.
      await (await as(t, world.admin2)).mutation(api.legalDocuments.publish, { documentId });
      const published = await t.query(api.legalDocuments.published, { docType: "consumer_consent" });
      expect(published).toMatchObject({ id: documentId, version: 2 });
      expect((await t.run((ctx) => ctx.db.get(world.consentDocId)))?.status).toBe("superseded");
    });

    it("the submitting admin also cannot publish a draft someone else wrote", async () => {
      const content = await as(t, world.content);
      const documentId = await content.mutation(api.legalDocuments.createDraft, { docType: "terms_of_use", content: "Revised terms of use for the platform." });
      await (await as(t, world.admin)).mutation(api.legalDocuments.submitForApproval, { documentId });
      await expectAppError((await as(t, world.admin)).mutation(api.legalDocuments.publish, { documentId }), "FORBIDDEN", /Four-eyes/);
      await (await as(t, world.admin2)).mutation(api.legalDocuments.publish, { documentId });
    });

    it("staff cannot use agent functions and agents cannot use staff functions", async () => {
      await expectAppError((await as(t, world.admin)).query(api.ledger.myBalance, {}), "FORBIDDEN", /No agent account/);
      const agentUser = await t.run(async (ctx) => (await ctx.db.query("users").withIndex("by_accountId", (q) => q.eq("accountId", accountId)).first())!);
      const agent = await as(t, agentUser._id);
      await expectAppError(agent.mutation(api.leads.revealContact, { leadId }), "FORBIDDEN");
      await expectAppError(agent.mutation(api.disputes.decide, { disputeId, decision: "upheld", notes: "I approve my own" }), "FORBIDDEN");
      await expectAppError(agent.mutation(api.ledger.adjust, { accountId, leadType: "standard", direction: "credit", quantity: 50, reason: "Free leads please" }), "FORBIDDEN");
      await expectAppError(agent.mutation(api.assignments.manualAssign, { leadId, accountId }), "FORBIDDEN");
      expect(await balanceOf(t, accountId)).toEqual({ exclusive: 1, standard: 8 });
    });

    it("enforces two-factor for staff when REQUIRE_STAFF_2FA is on", async () => {
      process.env.REQUIRE_STAFF_2FA = "true";
      await expectAppError((await as(t, world.admin)).mutation(api.leads.revealContact, { leadId }), "MFA_SETUP_REQUIRED");
    });
  });

  describe("unauthenticated and disabled callers", () => {
    it("an anonymous caller gets UNAUTHENTICATED from agent and staff functions", async () => {
      await expectAppError(t.query(api.ledger.myBalance, {}), "UNAUTHENTICATED");
      await expectAppError(t.query(api.leads.myLeads, {}), "UNAUTHENTICATED");
      await expectAppError(t.mutation(api.orders.createTopUp, { quantity: 10 }), "UNAUTHENTICATED");
      const leadId = await createLead(t);
      await expectAppError(t.mutation(api.leads.revealContact, { leadId }), "UNAUTHENTICATED");
      await expectAppError(t.mutation(api.distribution.admin.setEngineEnabled, { enabled: false }), "UNAUTHENTICATED");
    });

    it("a disabled user is treated as signed out", async () => {
      const agent = await createAccount(t);
      await t.run((ctx) => ctx.db.patch(agent.userId, { disabled: true }));
      await expectAppError((await as(t, agent.userId)).query(api.ledger.myBalance, {}), "UNAUTHENTICATED");
      await t.run((ctx) => ctx.db.patch(world.admin, { disabled: true }));
      const leadId = await createLead(t);
      await expectAppError((await as(t, world.admin)).mutation(api.leads.revealContact, { leadId }), "UNAUTHENTICATED");
    });

    it("an applicant whose account is still pending cannot reach the portal data", async () => {
      const pending = await createAccount(t, { status: "pending_verification" });
      await expectAppError((await as(t, pending.userId)).query(api.leads.myLeads, {}), "FORBIDDEN", /not been approved/);
    });
  });
});
