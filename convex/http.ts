import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { partnerLeadSchema } from "../src/domain/schemas/partnerLead";
import { hmacSha256Hex, isValidTwilioSignature, timingSafeEqual } from "./integrations/providers";
import { smsMode } from "./lib/env";

const http = httpRouter();

auth.addHttpRoutes(http);

/** Stripe webhook — the raw body is required for signature verification. */
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    if (!signature) return new Response("Missing signature", { status: 400 });
    const payload = await request.text();
    const result = await ctx.runAction(internal.stripeActions.handleWebhook, { payload, signature });
    return new Response(result.ok ? "ok" : "error", { status: result.status });
  }),
});

/** Twilio inbound SMS — STOP handling feeds the suppression register. */
http.route({
  path: "/twilio/inbound",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const params = Object.fromEntries(new URLSearchParams(body));
    if (smsMode() === "twilio") {
      const url = process.env.TWILIO_WEBHOOK_URL ?? `${process.env.CONVEX_SITE_URL}/twilio/inbound`;
      const valid = await isValidTwilioSignature(url, params, request.headers.get("x-twilio-signature"));
      if (!valid) return new Response("Invalid signature", { status: 403 });
    } else if (process.env.APP_ENV === "production") {
      // Bypass mode never accepts unsigned inbound traffic in production.
      return new Response("SMS not configured", { status: 503 });
    }
    if (params.From && params.Body !== undefined) {
      await ctx.runMutation(internal.suppression.handleInboundSms, { from: params.From, body: params.Body });
    }
    return new Response("<Response></Response>", { status: 200, headers: { "Content-Type": "text/xml" } });
  }),
});

/** Meta Lead Ads — subscription verification. */
http.route({
  path: "/meta/leads",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const url = new URL(request.url);
    const expected = process.env.META_VERIFY_TOKEN;
    if (
      expected &&
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === expected
    ) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }),
});

/** Meta Lead Ads — leadgen events (X-Hub-Signature-256 over the raw body). */
http.route({
  path: "/meta/leads",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.META_APP_SECRET;
    if (!secret) return new Response("Meta integration not configured", { status: 503 });
    const body = await request.text();
    const header = request.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + (await hmacSha256Hex(secret, body));
    if (!timingSafeEqual(header, expected)) return new Response("Invalid signature", { status: 401 });
    let parsed: { entry?: Array<{ changes?: Array<{ field?: string; value?: { leadgen_id?: string; created_time?: number } }> }> };
    try {
      parsed = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    for (const entry of parsed.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const leadgenId = change.value?.leadgen_id;
        if (change.field !== "leadgen" || !leadgenId) continue;
        const rawPayloadId = await ctx.runMutation(internal.intake.storeRawPayload, {
          source: "meta",
          payload: JSON.stringify(change),
          signatureVerified: true,
          externalId: String(leadgenId),
        });
        await ctx.scheduler.runAfter(0, internal.integrations.meta.processLeadgen, {
          rawPayloadId,
          leadgenId: String(leadgenId),
          createdTime: change.value?.created_time ? change.value.created_time * 1000 : undefined,
        });
      }
    }
    return new Response("ok", { status: 200 });
  }),
});

/**
 * Signed partner API.
 *   X-LB-Partner:   marketing source key (channel "partner")
 *   X-LB-Timestamp: unix seconds (±5 minutes)
 *   X-LB-Signature: hex HMAC-SHA256(PARTNER_API_SIGNING_SECRET, `${timestamp}.${rawBody}`)
 */
http.route({
  path: "/partner/leads",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const json = (status: number, data: Record<string, unknown>) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    const secret = process.env.PARTNER_API_SIGNING_SECRET;
    if (!secret) return json(503, { error: "Partner API not configured" });
    const body = await request.text();
    const timestamp = request.headers.get("x-lb-timestamp") ?? "";
    const signature = request.headers.get("x-lb-signature") ?? "";
    const partner = request.headers.get("x-lb-partner") ?? "";
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return json(401, { error: "Stale or missing timestamp" });
    const expected = await hmacSha256Hex(secret, `${timestamp}.${body}`);
    if (!timingSafeEqual(signature.toLowerCase(), expected)) return json(401, { error: "Invalid signature" });
    const source = await ctx.runQuery(internal.referenceData.partnerSource, { key: partner });
    if (!source) return json(403, { error: "Unknown partner" });

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return json(400, { error: "Invalid JSON" });
    }
    const parsed = partnerLeadSchema.safeParse(payload);
    if (!parsed.success) return json(422, { error: parsed.error.issues[0]?.message ?? "Invalid lead" });
    const lead = parsed.data;
    const rawPayloadId = await ctx.runMutation(internal.intake.storeRawPayload, {
      source: "partner",
      payload: body,
      headers: { "x-lb-partner": partner, "x-lb-timestamp": timestamp },
      signatureVerified: true,
      externalId: lead.externalId,
    });
    const result = await ctx.runMutation(internal.intake.ingestExternal, {
      source: "partner",
      rawPayloadId,
      marketingSource: partner,
      externalId: lead.externalId,
      fields: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        state: lead.state,
        zip: lead.zip,
        city: lead.city ?? "",
        coverageType: lead.coverageType,
        reason: lead.reason,
        budgetRange: lead.budgetRange ?? "",
        ageRange: lead.ageRange ?? "",
        bestTimeToCall: lead.bestTimeToCall ?? "",
      },
      consent: {
        text: lead.consent.text,
        versionLabel: lead.consent.version,
        agreedAt: Date.parse(lead.consent.agreedAt),
        ipAddress: lead.consent.ipAddress,
        userAgent: lead.consent.userAgent,
        pageUrl: lead.consent.pageUrl,
      },
    });
    if (!result.ok) return json(422, { error: result.error });
    return json(result.duplicate ? 200 : 201, { reference: result.reference, duplicate: !!result.duplicate });
  }),
});

export default http;
