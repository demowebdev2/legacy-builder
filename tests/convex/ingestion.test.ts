import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import { hmacSha256Hex } from "../../convex/integrations/providers";
import {
  assignmentsFor,
  createAccount,
  scheduledFunctions,
  seedWorld,
  setupTest,
  teardownTest,
  TEST_NOW,
  type TestConvex,
} from "./fixtures";

const SECRET = "partner-signing-secret-for-tests";

/** Partner API, Meta webhook and Twilio STOP — exercised through the real HTTP router (`convex/http.ts`). */
describe("external ingestion endpoints", () => {
  let t: TestConvex;

  beforeEach(async () => {
    t = setupTest();
    await seedWorld(t);
    await t.run((ctx) =>
      ctx.db.insert("marketingSources", { key: "acme_partner", name: "Acme Leads", channel: "partner", defaultLeadType: "standard", active: true, sortOrder: 9 }),
    );
    process.env.PARTNER_API_SIGNING_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.PARTNER_API_SIGNING_SECRET;
    delete process.env.META_APP_SECRET;
    teardownTest();
  });

  const partnerLead = (overrides: Record<string, unknown> = {}) => ({
    externalId: "acme-1001",
    firstName: "Robert",
    lastName: "Hale",
    email: "robert.hale@example.com",
    phone: "(912) 555-0144",
    state: "GA",
    zip: "31401",
    coverageType: "final",
    reason: "Looking for a small policy to cover funeral costs.",
    consent: {
      text: "I agree to be contacted by Legacy Builders and its partner agents about final expense insurance.",
      version: "acme-2026-01",
      agreedAt: new Date(TEST_NOW - 60_000).toISOString(),
      ipAddress: "198.51.100.44",
    },
    ...overrides,
  });

  const postPartner = async (body: string, options: { timestamp?: number; secret?: string; partner?: string } = {}) => {
    const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
    const signature = await hmacSha256Hex(options.secret ?? SECRET, `${timestamp}.${body}`);
    return await t.fetch("/partner/leads", {
      method: "POST",
      headers: { "x-lb-partner": options.partner ?? "acme_partner", "x-lb-timestamp": timestamp, "x-lb-signature": signature, "content-type": "application/json" },
      body,
    });
  };

  const leads = () => t.run((ctx) => ctx.db.query("leads").collect());

  describe("signed partner API", () => {
    it("accepts a correctly signed lead with consent evidence, once per externalId", async () => {
      const body = JSON.stringify(partnerLead());
      const response = await postPartner(body);
      expect(response.status).toBe(201);
      const { reference, duplicate } = (await response.json()) as { reference: string; duplicate: boolean };
      expect(duplicate).toBe(false);

      const [lead] = await leads();
      expect(lead).toMatchObject({ reference, source: "partner", externalId: "acme-1001", marketingSource: "acme_partner", phone: "+19125550144", status: "queued" });
      const consent = await t.run((ctx) => ctx.db.get(lead.consentId!));
      expect(consent).toMatchObject({ method: "partner_api", versionLabel: "partner:acme_partner:acme-2026-01", ipAddress: "198.51.100.44" });
      expect(consent?.evidence).toMatch(/I agree to be contacted/);
      const raw = await t.run((ctx) => ctx.db.get(lead.rawPayloadId!));
      expect(raw).toMatchObject({ source: "partner", signatureVerified: true, payload: body });

      // A retry of the same partner lead is acknowledged without creating a second lead.
      const retry = await postPartner(body);
      expect(retry.status).toBe(200);
      expect(await retry.json()).toEqual({ reference, duplicate: true });
      expect(await leads()).toHaveLength(1);
    });

    it("rejects a bad signature, a stale timestamp and an unknown partner", async () => {
      const body = JSON.stringify(partnerLead());
      expect((await postPartner(body, { secret: "wrong-secret" })).status).toBe(401);
      expect((await postPartner(body, { timestamp: Math.floor(Date.now() / 1000) - 301 })).status).toBe(401);
      expect((await postPartner(body, { timestamp: Math.floor(Date.now() / 1000) + 301 })).status).toBe(401);
      expect((await postPartner(body, { partner: "not_a_partner" })).status).toBe(403);
      expect((await postPartner(body, { partner: "website" })).status).toBe(403);

      // Tampering with the body after signing invalidates the signature.
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = await hmacSha256Hex(SECRET, `${timestamp}.${body}`);
      const tampered = await t.fetch("/partner/leads", {
        method: "POST",
        headers: { "x-lb-partner": "acme_partner", "x-lb-timestamp": timestamp, "x-lb-signature": signature },
        body: body.replace("Robert", "Roberta"),
      });
      expect(tampered.status).toBe(401);
      expect(await leads()).toHaveLength(0);
    });

    it("refuses a lead without consent evidence (no consent, no lead)", async () => {
      const { consent: _consent, ...withoutConsent } = partnerLead();
      const response = await postPartner(JSON.stringify(withoutConsent));
      expect(response.status).toBe(422);
      expect(await leads()).toHaveLength(0);
    });

    it("is disabled until a signing secret is configured", async () => {
      delete process.env.PARTNER_API_SIGNING_SECRET;
      expect((await postPartner(JSON.stringify(partnerLead()))).status).toBe(503);
    });
  });

  it("Meta webhook refuses unsigned payloads", async () => {
    process.env.META_APP_SECRET = "meta-secret";
    const body = JSON.stringify({ entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "123" } }] }] });
    const response = await t.fetch("/meta/leads", { method: "POST", headers: { "x-hub-signature-256": "sha256=deadbeef" }, body });
    expect(response.status).toBe(401);
    expect(await t.run((ctx) => ctx.db.query("leadRawPayloads").collect())).toHaveLength(0);
    expect((await scheduledFunctions(t)).filter((j) => j.name.startsWith("integrations/meta"))).toHaveLength(0);
  });

  it("an SMS STOP suppresses the number, withdraws consent on every lead with it and notifies holders", async () => {
    const holder = await createAccount(t);
    const body = JSON.stringify(partnerLead());
    await postPartner(body);
    const [lead] = await leads();
    await t.mutation(internal.distribution.engine.processLead, { leadId: lead._id, trigger: "capture" });
    expect(await assignmentsFor(t, lead._id)).toHaveLength(1);

    // SMS provider in bypass (console) mode outside production: the inbound webhook is accepted unsigned.
    const response = await t.fetch("/twilio/inbound", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: "+19125550144", Body: "stop" }).toString(),
    });
    expect(response.status).toBe(200);

    const suppression = await t.run((ctx) => ctx.db.query("suppressionEntries").collect());
    expect(suppression.filter((s) => s.active).map((s) => [s.channel, s.value, s.reason]).sort()).toEqual([
      ["email", "robert.hale@example.com", "sms_stop"],
      ["phone", "+19125550144", "sms_stop"],
    ]);
    expect(await t.run((ctx) => ctx.db.get(lead._id))).toMatchObject({ status: "withdrawn" });
    const withdrawals = await t.run((ctx) => ctx.db.query("consentWithdrawals").collect());
    expect(withdrawals).toMatchObject([{ method: "sms_stop", ceaseContactNotices: 1 }]);
    const notices = await t.run((ctx) => ctx.db.query("notifications").withIndex("by_account", (q) => q.eq("accountId", holder.accountId)).collect());
    expect(notices.some((n) => n.type === "compliance")).toBe(true);
  });

  it("refuses unsigned Twilio traffic in production when SMS is in bypass mode", async () => {
    process.env.APP_ENV = "production";
    try {
      const response = await t.fetch("/twilio/inbound", {
        method: "POST",
        body: new URLSearchParams({ From: "+19125550144", Body: "STOP" }).toString(),
      });
      expect(response.status).toBe(503);
      expect(await t.run((ctx) => ctx.db.query("suppressionEntries").collect())).toHaveLength(0);
    } finally {
      delete process.env.APP_ENV;
    }
  });
});
