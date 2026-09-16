import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isLeadReference, sha256Hex } from "../../src/domain/reference";
import { DEFAULT_FORM_OPTIONS } from "../../src/domain/referenceDefaults";
import {
  as,
  assignmentsFor,
  CONSENT_TEXT,
  createAccount,
  expectAppError,
  scheduledFunctions,
  seedWorld,
  setupTest,
  teardownTest,
  TEST_NOW,
  type TestConvex,
  type World,
} from "./fixtures";

type WebsiteRequest = {
  coverageType: string;
  ageRange: string;
  state: string;
  zip: string;
  coverageAmount?: string;
  protecting?: string;
  budgetRange: string;
  reason: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  bestTimeToCall?: string;
  preferredContactMethod: string;
  consentDocumentId: string;
  consentAccepted: boolean;
  termsAccepted: boolean;
  pageUrl?: string;
  marketingSource?: string;
  gclid?: string;
};

const IP = "203.0.113.7";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Test";

/**
 * Website intake with no INTAKE_SHARED_SECRET and APP_ENV unset (development mode: the shared secret is
 * not required). The mutation re-validates everything the Next.js route handler already checked.
 */
describe("website intake and consent", () => {
  let t: TestConvex;
  let world: World;

  const request = (overrides: Partial<WebsiteRequest> = {}): WebsiteRequest => ({
    coverageType: "life",
    ageRange: DEFAULT_FORM_OPTIONS.age_range[2],
    state: "GA",
    zip: "30301-1234",
    budgetRange: DEFAULT_FORM_OPTIONS.budget_range[2],
    reason: "We just had our second child and want cover in place.",
    firstName: "  Jane ",
    lastName: "Doe",
    phone: "(404) 555-0199",
    email: "Jane.Doe@Example.com",
    preferredContactMethod: DEFAULT_FORM_OPTIONS.contact_method[0],
    consentDocumentId: world.consentDocId,
    consentAccepted: true,
    termsAccepted: true,
    pageUrl: "https://legacybuilders.example/request",
    ...overrides,
  });

  const submit = (overrides: Partial<WebsiteRequest> = {}, ip = IP) =>
    t.mutation(api.intake.submitWebsiteRequest, { ipAddress: ip, userAgent: UA, request: request(overrides) });

  const leadByReference = (reference: string) =>
    t.run(async (ctx) => (await ctx.db.query("leads").withIndex("by_reference", (q) => q.eq("reference", reference)).unique())!);

  beforeEach(async () => {
    t = setupTest();
    world = await seedWorld(t);
  });
  afterEach(teardownTest);

  it("creates the lead, a consent record tied to the published version, and the raw payload", async () => {
    const { reference, token } = await submit();
    expect(isLeadReference(reference)).toBe(true);
    expect(reference.startsWith("LB-2609-")).toBe(true);

    const lead = await leadByReference(reference);
    expect(lead).toMatchObject({
      source: "website",
      status: "queued",
      firstName: "Jane",
      email: "jane.doe@example.com",
      phone: "+14045550199",
      zip: "30301",
      state: "GA",
      coverageType: "life",
      capturedAt: TEST_NOW,
      leadType: "standard",
      gradeSequence: 1,
      recipientTarget: 3,
      marketingSource: "website",
    });

    const consent = await t.run((ctx) => ctx.db.get(lead.consentId!));
    expect(consent).toMatchObject({
      leadId: lead._id,
      legalDocumentId: world.consentDocId,
      documentVersion: 1,
      versionLabel: "Consumer consent (TCPA) v1",
      contentHash: await sha256Hex(CONSENT_TEXT),
      termsDocumentId: world.termsDocId,
      privacyDocumentId: world.privacyDocId,
      agreedAt: TEST_NOW,
      ipAddress: IP,
      userAgent: UA,
      pageUrl: "https://legacybuilders.example/request",
      method: "web_form",
      phoneSnapshot: "+14045550199",
      emailSnapshot: "jane.doe@example.com",
    });

    const raw = await t.run((ctx) => ctx.db.get(lead.rawPayloadId!));
    expect(raw).toMatchObject({ source: "website", receivedAt: TEST_NOW, signatureVerified: false, headers: { "user-agent": UA } });
    expect(JSON.parse(raw!.payload)).toMatchObject({ firstName: "  Jane ", phone: "(404) 555-0199", consentAccepted: true });
    expect(raw!.contentHash).toBe(await sha256Hex(raw!.payload));

    const jobs = await scheduledFunctions(t);
    expect(jobs.filter((j) => j.name === "distribution/engine:processLead")).toMatchObject([{ args: [{ leadId: lead._id, trigger: "capture" }] }]);

    // The confirmation page needs the one-time token; a wrong token reveals nothing.
    expect(await t.query(api.intake.confirmation, { reference, token })).toMatchObject({ reference, status: "queued", agents: [], withdrawn: false });
    expect(await t.query(api.intake.confirmation, { reference, token: "wrong-token" })).toBeNull();
  });

  it("grades every 5th captured lead exclusive", async () => {
    const types: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { reference } = await submit({ phone: `(404) 555-02${10 + i}`, email: `person${i}@example.com` }, `198.51.100.${i}`);
      types.push((await leadByReference(reference)).leadType);
    }
    expect(types).toEqual(["standard", "standard", "standard", "standard", "exclusive"]);
  });

  it("rejects a stale consent document id (the consumer saw superseded wording)", async () => {
    const oldConsentId = world.consentDocId;
    await t.run(async (ctx) => {
      await ctx.db.patch(oldConsentId, { status: "superseded", supersededAt: TEST_NOW });
      await ctx.db.insert("legalDocuments", {
        docType: "consumer_consent",
        slug: "consumer-consent",
        title: "Consumer consent (TCPA)",
        version: 2,
        content: `${CONSENT_TEXT} Updated.`,
        contentHash: await sha256Hex(`${CONSENT_TEXT} Updated.`),
        status: "published",
        createdAt: TEST_NOW,
        createdByName: "Fixture",
        publishedAt: TEST_NOW,
      });
    });

    await expectAppError(submit({ consentDocumentId: oldConsentId }), "INVALID", /consent wording has been updated/);
    expect(await t.run((ctx) => ctx.db.query("leads").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("leadRawPayloads").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("consents").collect())).toHaveLength(0);
  });

  it.each<[string, Partial<WebsiteRequest>, RegExp]>([
    ["consent not given", { consentAccepted: false }, /agree to be contacted/],
    ["terms not accepted", { termsAccepted: false }, /Privacy Policy and Terms/],
    ["a reason under 10 characters", { reason: "help me" }, /at least 10 characters/],
    ["an invalid phone", { phone: "555-0199" }, /valid US mobile/],
    ["an unknown age range", { ageRange: "Ancient" }, /valid age range/],
    ["an unknown coverage type", { coverageType: "pet" }, /what you need help with/],
  ])("rejects %s and stores nothing", async (_label, overrides, message) => {
    await expectAppError(submit(overrides), "INVALID", message);
    expect(await t.run((ctx) => ctx.db.query("leads").collect())).toHaveLength(0);
  });

  it("a second request with the same phone for the same coverage becomes a duplicate and is not distributed", async () => {
    const first = await submit();
    const second = await submit({ email: "someone.else@example.com", phone: "404-555-0199" }, "198.51.100.20");

    const original = await leadByReference(first.reference);
    const duplicate = await leadByReference(second.reference);
    expect(duplicate).toMatchObject({ status: "duplicate", duplicateOfLeadId: original._id });
    expect(duplicate.processingNote).toMatch(new RegExp(original.reference));
    // Duplicates are kept (with consent) but never queued for the engine or graded.
    expect(duplicate.consentId).toBeDefined();
    expect(duplicate.gradeSequence).toBeUndefined();
    const engineJobs = (await scheduledFunctions(t)).filter((j) => j.name === "distribution/engine:processLead");
    expect(engineJobs.map((j) => (j.args[0] as { leadId: Id<"leads"> }).leadId)).toEqual([original._id]);

    // The same phone asking about a different product is a new request.
    const third = await submit({ coverageType: "final", email: "third@example.com" }, "198.51.100.21");
    expect((await leadByReference(third.reference)).status).toBe("queued");
  });

  it("an out-of-area state is held, not distributed", async () => {
    const { reference } = await submit({ state: "TX" });
    expect((await leadByReference(reference)).status).toBe("out_of_area");
  });

  it("rate-limits repeated submissions from one IP address", async () => {
    for (let i = 0; i < 5; i++) await submit({ phone: `(404) 555-03${10 + i}`, email: `rate${i}@example.com` });
    await expectAppError(submit({ phone: "(404) 555-0399", email: "rate9@example.com" }), "RATE_LIMITED");
  });

  describe("consent withdrawal", () => {
    let reference: string;
    let leadId: Id<"leads">;
    let holders: Id<"accounts">[];

    beforeEach(async () => {
      holders = [(await createAccount(t)).accountId, (await createAccount(t)).accountId];
      ({ reference } = await submit());
      leadId = (await leadByReference(reference))._id;
      await t.mutation(internal.distribution.engine.processLead, { leadId, trigger: "capture" });
      expect((await assignmentsFor(t, leadId)).map((a) => a.accountId).sort()).toEqual([...holders].sort());
    });

    it("requires the email or phone used on the request", async () => {
      await expectAppError(
        t.action(api.intake.withdrawConsent, { reference, contact: "someone@example.com", ipAddress: IP }),
        "INVALID",
        /could not match/,
      );
      await expectAppError(t.action(api.intake.withdrawConsent, { reference, contact: "(404) 555-0100", ipAddress: IP }), "INVALID");
      await expectAppError(t.action(api.intake.withdrawConsent, { reference: "LB-2609-ZZZZZ", contact: "jane.doe@example.com", ipAddress: IP }), "INVALID");

      expect((await leadByReference(reference)).withdrawnAt).toBeUndefined();
      expect(await t.run((ctx) => ctx.db.query("suppressionEntries").collect())).toHaveLength(0);
    });

    it("suppresses the contact, marks the lead withdrawn and sends cease-contact notices to every holder", async () => {
      const result = await t.action(api.intake.withdrawConsent, {
        reference: reference.toLowerCase(),
        contact: "  JANE.DOE@example.com ",
        ipAddress: IP,
        userAgent: UA,
      });
      expect(result).toEqual({ reference, alreadyWithdrawn: false });

      const lead = await leadByReference(reference);
      expect(lead).toMatchObject({ status: "withdrawn", withdrawnAt: TEST_NOW });

      const suppression = await t.run((ctx) => ctx.db.query("suppressionEntries").collect());
      expect(suppression.map((s) => [s.channel, s.value, s.reason, s.active, s.leadId]).sort()).toEqual([
        ["email", "jane.doe@example.com", "consumer_withdrawal", true, leadId],
        ["phone", "+14045550199", "consumer_withdrawal", true, leadId],
      ]);

      const withdrawals = await t.run((ctx) => ctx.db.query("consentWithdrawals").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect());
      expect(withdrawals).toMatchObject([{ method: "reference_lookup", ceaseContactNotices: 2, ipAddress: IP, consentId: lead.consentId }]);

      for (const assignment of await assignmentsFor(t, leadId)) {
        expect(assignment.ceaseContactAt).toBe(TEST_NOW);
        const notices = await t.run((ctx) =>
          ctx.db.query("notifications").withIndex("by_account", (q) => q.eq("accountId", assignment.accountId)).collect(),
        );
        const cease = notices.filter((n) => n.type === "compliance");
        expect(cease).toHaveLength(1);
        expect(cease[0].channels).toEqual(["in_app", "email", "sms"]); // compliance notices ignore opt-outs
        expect(cease[0].body).toMatch(/withdrawn consent/);
      }

      // The consent record itself is kept (nothing is deleted).
      expect(await t.run((ctx) => ctx.db.get(lead.consentId!))).not.toBeNull();

      // The holder keeps the record but loses the means of contact.
      const [assignment] = await assignmentsFor(t, leadId);
      const holderUser = await t.run(async (ctx) => (await ctx.db.query("users").withIndex("by_accountId", (q) => q.eq("accountId", assignment.accountId)).first())!);
      const view = await (await as(t, holderUser._id)).query(api.leads.myLead, { assignmentId: assignment._id });
      expect(view.forbidden).toBe(false);
      if (!view.forbidden) {
        expect(view.lead.phone).toBe("•••0199");
        expect(view.lead.email).toBe("j•••@example.com");
        expect(view.lead.withdrawn).toBe(true);
      }

      // Withdrawing again is idempotent.
      expect(await t.action(api.intake.withdrawConsent, { reference, contact: "404-555-0199", ipAddress: IP })).toEqual({
        reference,
        alreadyWithdrawn: true,
      });
      expect(await t.run((ctx) => ctx.db.query("suppressionEntries").collect())).toHaveLength(2);
    });

    it("blocks future requests from the same contact and further release of the lead", async () => {
      await t.action(api.intake.withdrawConsent, { reference, contact: "(404) 555-0199", ipAddress: IP });

      expect(await t.mutation(internal.distribution.engine.processLead, { leadId, trigger: "capture" })).toEqual({ outcome: "skipped", assigned: 0 });

      const again = await submit({ coverageType: "final", email: "new.address@example.com" }, "198.51.100.30");
      expect((await leadByReference(again.reference)).status).toBe("suppressed");
    });
  });
});
