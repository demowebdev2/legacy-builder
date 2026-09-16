import { v } from "convex/values";
import type { LeadType } from "../src/domain/constants";
import { gradeForSequence, recipientTarget } from "../src/domain/distribution";
import { normalizeEmail, normalizeName, normalizeStateCode, normalizeUsPhone, normalizeZip } from "../src/domain/normalize";
import { generateLeadReference, generateToken, normalizeLeadReference, sha256Hex } from "../src/domain/reference";
import { UNSURE_COVERAGE_KEY } from "../src/domain/referenceDefaults";
import { consumerRequestSchema, firstIssue, withdrawalSchema } from "../src/domain/schemas/consumerRequest";
import { DAY, HOUR, MINUTE } from "../src/domain/time";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, mutation, type MutationCtx, query } from "./_generated/server";
import { templates } from "./integrations/templates";
import { writeAudit } from "./lib/audit";
import { type Actor, SYSTEM_ACTOR } from "./lib/auth";
import { counters } from "./lib/counterNames";
import { nextCounter } from "./lib/counters";
import { isProductionDeployment, readEnv } from "./lib/env";
import { appError, invalid } from "./lib/errors";
import { consumeRateLimit, enforceRateLimit } from "./lib/rateLimit";
import { getPublishedLegalDocument, loadCoverageTypes, loadDistributionSettings, loadFormOptions } from "./lib/settings";
import { timingSafeEqual } from "./integrations/providers";
import { findActiveSuppression, withdrawLeadConsent } from "./suppression";

/**
 * LEAD INTAKE — every source (website, Meta, partner API, admin) normalises into one shape and goes
 * through `ingestLead`: raw payload → validate → consent → dedupe → suppression → grade → queue.
 */

export interface NormalizedLead {
  source: Doc<"leads">["source"];
  marketingSource?: string;
  externalId?: string;
  gclid?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  zip: string;
  city?: string;
  coverageType: string;
  coverageUndetermined: boolean;
  ageRange?: string;
  coverageAmount?: string;
  protecting?: string;
  budgetRange?: string;
  reason: string;
  bestTimeToCall?: string;
  preferredContactMethod?: string;
  leadTypeOverride?: LeadType;
  qualityScore?: number;
  processingNote?: string;
}

export interface ConsentEvidence {
  legalDocumentId?: Id<"legalDocuments">;
  documentVersion?: number;
  versionLabel: string;
  contentHash: string;
  termsDocumentId?: Id<"legalDocuments">;
  privacyDocumentId?: Id<"legalDocuments">;
  agreedAt: number;
  ipAddress?: string;
  userAgent?: string;
  pageUrl?: string;
  method: Doc<"consents">["method"];
  evidence?: string;
  recordedBy?: Id<"users">;
}

async function uniqueReference(ctx: MutationCtx, now: number): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const reference = generateLeadReference(now);
    const clash = await ctx.db
      .query("leads")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .first();
    if (!clash) return reference;
  }
  throw appError("CONFLICT", "Could not allocate a reference number. Please try again.");
}

async function findDuplicate(ctx: MutationCtx, lead: NormalizedLead, now: number): Promise<Doc<"leads"> | null> {
  const { settings } = await loadDistributionSettings(ctx);
  if (settings.dedupWindowDays <= 0) return null;
  const since = now - settings.dedupWindowDays * DAY;
  const matches: Doc<"leads">[] = [];
  if (settings.dedupMatchPhone) {
    matches.push(...(await ctx.db.query("leads").withIndex("by_phone", (q) => q.eq("phone", lead.phone).gte("capturedAt", since)).collect()));
  }
  if (settings.dedupMatchEmail) {
    matches.push(...(await ctx.db.query("leads").withIndex("by_email", (q) => q.eq("email", lead.email).gte("capturedAt", since)).collect()));
  }
  const relevant = matches
    .filter((m) => m.status !== "rejected")
    .filter((m) => !settings.dedupSameCoverageOnly || m.coverageType === lead.coverageType)
    .sort((a, b) => a.capturedAt - b.capturedAt);
  const first = relevant[0];
  if (!first) return null;
  return first.duplicateOfLeadId ? ((await ctx.db.get(first.duplicateOfLeadId)) ?? first) : first;
}

export async function ingestLead(
  ctx: MutationCtx,
  lead: NormalizedLead,
  consent: ConsentEvidence,
  options: { rawPayloadId?: Id<"leadRawPayloads">; actor: Actor; createdBy?: Id<"users">; confirmationTokenHash?: string },
): Promise<{ leadId: Id<"leads">; reference: string; status: Doc<"leads">["status"] }> {
  const now = Date.now();
  const reference = await uniqueReference(ctx, now);

  let status: Doc<"leads">["status"] = "queued";
  let processingNote = lead.processingNote;
  let duplicateOfLeadId: Id<"leads"> | undefined;

  const stateRow = await ctx.db
    .query("referenceStates")
    .withIndex("by_code", (q) => q.eq("code", lead.state))
    .unique();
  if (!stateRow?.serviced) {
    status = "out_of_area";
    processingNote = `${lead.state} is outside the serviced states. Held, not distributed.`;
  }
  if (status === "queued") {
    const duplicate = await findDuplicate(ctx, lead, now);
    if (duplicate) {
      status = "duplicate";
      duplicateOfLeadId = duplicate._id;
      processingNote = `Matched lead ${duplicate.reference} within the deduplication window for the same product.`;
    }
  }
  if (status === "queued") {
    const suppression = await findActiveSuppression(ctx, { phone: lead.phone, email: lead.email });
    if (suppression) {
      status = "suppressed";
      processingNote = `Contact is on the suppression register (${suppression.channel}, ${suppression.reason.replace("_", " ")}).`;
    }
  }

  const { settings } = await loadDistributionSettings(ctx);
  let leadType: LeadType = "standard";
  let gradeSequence: number | undefined;
  if (lead.leadTypeOverride) {
    leadType = lead.leadTypeOverride;
  } else if (settings.gradingMode === "source" && lead.marketingSource) {
    const source = await ctx.db
      .query("marketingSources")
      .withIndex("by_key", (q) => q.eq("key", lead.marketingSource!))
      .unique();
    leadType = source?.defaultLeadType ?? "standard";
  } else if (status === "queued") {
    gradeSequence = await nextCounter(ctx, counters.leadGrade);
    leadType = gradeForSequence(gradeSequence, settings.exclusiveEvery);
  }

  const leadId = await ctx.db.insert("leads", {
    reference,
    source: lead.source,
    marketingSource: lead.marketingSource,
    externalId: lead.externalId,
    gclid: lead.gclid,
    status,
    leadType,
    gradeSequence,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    state: lead.state,
    zip: lead.zip,
    city: lead.city,
    coverageType: lead.coverageType,
    coverageUndetermined: lead.coverageUndetermined,
    ageRange: lead.ageRange,
    coverageAmount: lead.coverageAmount,
    protecting: lead.protecting,
    budgetRange: lead.budgetRange,
    reason: lead.reason,
    bestTimeToCall: lead.bestTimeToCall,
    preferredContactMethod: lead.preferredContactMethod,
    rawPayloadId: options.rawPayloadId,
    duplicateOfLeadId,
    processingNote,
    qualityScore: lead.qualityScore,
    capturedAt: now,
    recipientTarget: recipientTarget(leadType, settings),
    assignedCount: 0,
    retryAttempt: 0,
    suppressedAt: status === "suppressed" ? now : undefined,
    confirmationTokenHash: options.confirmationTokenHash,
    createdBy: options.createdBy,
    searchText: [reference, lead.firstName, lead.lastName, lead.email, lead.phone, lead.phone.slice(2), lead.city, lead.zip].filter(Boolean).join(" "),
  });

  const consentId = await ctx.db.insert("consents", {
    leadId,
    legalDocumentId: consent.legalDocumentId,
    documentVersion: consent.documentVersion,
    versionLabel: consent.versionLabel,
    contentHash: consent.contentHash,
    termsDocumentId: consent.termsDocumentId,
    privacyDocumentId: consent.privacyDocumentId,
    agreedAt: consent.agreedAt,
    ipAddress: consent.ipAddress,
    userAgent: consent.userAgent,
    pageUrl: consent.pageUrl,
    method: consent.method,
    phoneSnapshot: lead.phone,
    emailSnapshot: lead.email,
    evidence: consent.evidence,
    recordedBy: consent.recordedBy,
  });
  await ctx.db.patch(leadId, { consentId });

  await writeAudit(ctx, options.actor, {
    action: "lead.captured",
    entityType: "lead",
    entityId: leadId,
    summary: `Lead ${reference} captured from ${lead.source} (${lead.coverageType}, ${lead.state}) → ${status.replace("_", " ")}`,
    metadata: { leadType, duplicateOfLeadId, consentMethod: consent.method },
  });

  if (status === "queued") {
    await ctx.scheduler.runAfter(0, internal.distribution.engine.processLead, { leadId, trigger: "capture" });
  }
  return { leadId, reference, status };
}

// ─────────────────────────── website ───────────────────────────

function assertIntakeSecret(secret: string | undefined) {
  const expected = readEnv("INTAKE_SHARED_SECRET");
  if (!expected) {
    if (isProductionDeployment()) throw appError("CONFIGURATION", "Intake is not configured.");
    return; // development without a shared secret
  }
  if (!secret || !timingSafeEqual(secret, expected)) throw appError("FORBIDDEN", "Invalid intake credentials.");
}

async function assertOption(ctx: MutationCtx, group: Doc<"formOptions">["group"], value: string | undefined, label: string, required: boolean) {
  if (!value) {
    if (required) throw invalid(`${label} is required.`);
    return;
  }
  const options = await loadFormOptions(ctx, group);
  if (!options.includes(value)) throw invalid(`Choose a valid ${label.toLowerCase()}.`);
}

export const submitWebsiteRequest = mutation({
  args: {
    secret: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    request: v.object({
      coverageType: v.string(),
      ageRange: v.string(),
      state: v.string(),
      zip: v.string(),
      coverageAmount: v.optional(v.string()),
      protecting: v.optional(v.string()),
      budgetRange: v.string(),
      reason: v.string(),
      firstName: v.string(),
      lastName: v.string(),
      phone: v.string(),
      email: v.string(),
      bestTimeToCall: v.optional(v.string()),
      preferredContactMethod: v.string(),
      consentDocumentId: v.string(),
      consentAccepted: v.boolean(),
      termsAccepted: v.boolean(),
      pageUrl: v.optional(v.string()),
      marketingSource: v.optional(v.string()),
      gclid: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    assertIntakeSecret(args.secret);
    const ipKey = args.ipAddress ? await sha256Hex(args.ipAddress) : "unknown";
    await enforceRateLimit(ctx, `intake-ip:${ipKey}`, {
      max: args.ipAddress ? 5 : 50,
      windowMs: 10 * MINUTE,
      message: "We have received several requests from this connection. Please wait a few minutes and try again.",
    });

    const parsed = consumerRequestSchema.safeParse(args.request);
    if (!parsed.success) throw invalid(firstIssue(parsed.error));
    const r = parsed.data;

    const phone = normalizeUsPhone(r.phone)!;
    const email = normalizeEmail(r.email)!;
    await enforceRateLimit(ctx, `intake-phone:${await sha256Hex(phone)}`, {
      max: 3,
      windowMs: DAY,
      message: "We already have recent requests for this phone number. An agent will be in touch.",
    });

    let coverageType = r.coverageType;
    let coverageUndetermined = false;
    if (coverageType === UNSURE_COVERAGE_KEY) {
      coverageType = "life";
      coverageUndetermined = true;
    } else {
      const active = await loadCoverageTypes(ctx);
      if (!active.some((c) => c.key === coverageType)) throw invalid("Please choose what you need help with.");
    }
    await assertOption(ctx, "age_range", r.ageRange, "Age range", true);
    await assertOption(ctx, "budget_range", r.budgetRange, "Monthly budget", true);
    await assertOption(ctx, "coverage_amount", r.coverageAmount || undefined, "Cover amount", false);
    await assertOption(ctx, "protecting", r.protecting || undefined, "Who you are protecting", false);
    await assertOption(ctx, "call_time", r.bestTimeToCall || undefined, "Best time to call", false);
    await assertOption(ctx, "contact_method", r.preferredContactMethod, "Preferred contact method", true);
    const state = normalizeStateCode(r.state);
    if (!state) throw invalid("Please choose your state.");

    const consentDoc = await getPublishedLegalDocument(ctx, "consumer_consent");
    if (!consentDoc || consentDoc._id !== r.consentDocumentId) {
      throw invalid("The consent wording has been updated. Please review it again before submitting.");
    }
    const terms = await getPublishedLegalDocument(ctx, "terms_of_use");
    const privacy = await getPublishedLegalDocument(ctx, "privacy_policy");

    const now = Date.now();
    const rawPayload = JSON.stringify({ ...args.request, receivedAt: now });
    const rawPayloadId = await ctx.db.insert("leadRawPayloads", {
      source: "website",
      receivedAt: now,
      payload: rawPayload,
      contentHash: await sha256Hex(rawPayload),
      headers: args.userAgent ? { "user-agent": args.userAgent.slice(0, 512) } : undefined,
      signatureVerified: false,
    });

    const token = generateToken();
    const result = await ingestLead(
      ctx,
      {
        source: "website",
        marketingSource: r.gclid ? "google_ads" : r.marketingSource || "website",
        gclid: r.gclid,
        firstName: normalizeName(r.firstName),
        lastName: normalizeName(r.lastName),
        email,
        phone,
        state,
        zip: normalizeZip(r.zip)!,
        coverageType,
        coverageUndetermined,
        ageRange: r.ageRange,
        coverageAmount: r.coverageAmount || undefined,
        protecting: r.protecting || undefined,
        budgetRange: r.budgetRange,
        reason: r.reason,
        bestTimeToCall: r.bestTimeToCall || undefined,
        preferredContactMethod: r.preferredContactMethod,
      },
      {
        legalDocumentId: consentDoc._id,
        documentVersion: consentDoc.version,
        versionLabel: `${consentDoc.title} v${consentDoc.version}`,
        contentHash: consentDoc.contentHash,
        termsDocumentId: terms?._id,
        privacyDocumentId: privacy?._id,
        agreedAt: now,
        ipAddress: args.ipAddress?.slice(0, 64),
        userAgent: args.userAgent?.slice(0, 512),
        pageUrl: r.pageUrl?.slice(0, 500),
        method: "web_form",
      },
      { rawPayloadId, actor: { kind: "system", name: "Website" }, confirmationTokenHash: await sha256Hex(token) },
    );

    await ctx.scheduler.runAfter(0, internal.integrations.messaging.sendTransactionalEmail, {
      to: email,
      template: "consumer_request_received",
      leadId: result.leadId,
      ...templates.consumerRequestReceived(result.reference),
    });
    return { reference: result.reference, token };
  },
});

/** Confirmation page: reference + one-time token from the submission. No consumer PII is returned. */
export const confirmation = query({
  args: { reference: v.string(), token: v.string() },
  handler: async (ctx, { reference, token }) => {
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_reference", (q) => q.eq("reference", normalizeLeadReference(reference)))
      .unique();
    if (!lead?.confirmationTokenHash || lead.confirmationTokenHash !== (await sha256Hex(token))) return null;
    const assignments = await ctx.db
      .query("leadAssignments")
      .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
      .collect();
    const agents: string[] = [];
    for (const a of assignments.filter((x) => !x.revokedAt)) {
      const account = await ctx.db.get(a.accountId);
      if (account) agents.push(account.businessName || account.name);
    }
    return {
      reference: lead.reference,
      status: lead.status,
      capturedAt: lead.capturedAt,
      agents,
      withdrawn: !!lead.withdrawnAt,
    };
  },
});

type WithdrawalResult = { ok: true; reference: string; alreadyWithdrawn: boolean } | { ok: false; message: string };

/** Counts the attempt in its own committed transaction (see convex/lib/rateLimit.ts). */
export const consumeWithdrawalAttempt = internalMutation({
  args: { ipKey: v.string(), hasIp: v.boolean(), reference: v.string() },
  handler: async (ctx, { ipKey, hasIp, reference }) => {
    if (!(await consumeRateLimit(ctx, `withdraw-ip:${ipKey}`, { max: hasIp ? 10 : 100, windowMs: HOUR }))) return false;
    return await consumeRateLimit(ctx, `withdraw-ref:${reference}`, { max: 5, windowMs: HOUR });
  },
});

export const performWithdrawal = internalMutation({
  args: { reference: v.string(), contact: v.string(), ipAddress: v.optional(v.string()), userAgent: v.optional(v.string()) },
  handler: async (ctx, args): Promise<WithdrawalResult> => {
    const notMatched: WithdrawalResult = { ok: false, message: "We could not match that reference number with that email address or mobile number." };
    const lead = await ctx.db
      .query("leads")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .unique();
    if (!lead) return notMatched;
    const phone = normalizeUsPhone(args.contact);
    const email = normalizeEmail(args.contact);
    if (!((phone && phone === lead.phone) || (email && email === lead.email))) return notMatched;
    const result = await withdrawLeadConsent(ctx, lead, {
      method: "reference_lookup",
      actor: { kind: "system", name: "Consumer (reference lookup)" },
      ipAddress: args.ipAddress?.slice(0, 64),
      userAgent: args.userAgent?.slice(0, 512),
    });
    return { ok: true, reference: lead.reference, alreadyWithdrawn: result.alreadyWithdrawn };
  },
});

/**
 * Consumer consent withdrawal by reference number + the email or mobile used. An action so that failed
 * lookups still consume the rate limit (a throwing mutation would roll the counter back).
 */
export const withdrawConsent = action({
  args: {
    secret: v.optional(v.string()),
    reference: v.string(),
    contact: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ reference: string; alreadyWithdrawn: boolean }> => {
    assertIntakeSecret(args.secret);
    const parsed = withdrawalSchema.safeParse({ reference: args.reference, contact: args.contact });
    if (!parsed.success) throw invalid(firstIssue(parsed.error));
    const reference = normalizeLeadReference(parsed.data.reference);
    const ipKey = args.ipAddress ? await sha256Hex(args.ipAddress) : "unknown";
    const allowed: boolean = await ctx.runMutation(internal.intake.consumeWithdrawalAttempt, { ipKey, hasIp: !!args.ipAddress, reference });
    if (!allowed) throw appError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.");
    const result: WithdrawalResult = await ctx.runMutation(internal.intake.performWithdrawal, {
      reference,
      contact: parsed.data.contact,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });
    if (!result.ok) throw invalid(result.message);
    return { reference: result.reference, alreadyWithdrawn: result.alreadyWithdrawn };
  },
});

// ─────────────────────────── external sources ───────────────────────────

export const storeRawPayload = internalMutation({
  args: {
    source: v.union(v.literal("meta"), v.literal("partner")),
    payload: v.string(),
    headers: v.optional(v.record(v.string(), v.string())),
    signatureVerified: v.boolean(),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const contentHash = await sha256Hex(args.payload);
    const existing = await ctx.db
      .query("leadRawPayloads")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", contentHash))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("leadRawPayloads", { ...args, contentHash, receivedAt: Date.now() });
  },
});

export const ingestExternal = internalMutation({
  args: {
    source: v.union(v.literal("meta"), v.literal("partner")),
    rawPayloadId: v.id("leadRawPayloads"),
    marketingSource: v.string(),
    externalId: v.string(),
    fields: v.record(v.string(), v.string()),
    consent: v.object({
      text: v.optional(v.string()),
      versionLabel: v.optional(v.string()),
      agreedAt: v.number(),
      ipAddress: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      pageUrl: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; reference?: string; error?: string; duplicate?: boolean }> => {
    const existing = await ctx.db
      .query("leads")
      .withIndex("by_source_externalId", (q) => q.eq("source", args.source).eq("externalId", args.externalId))
      .first();
    if (existing) return { ok: true, reference: existing.reference, duplicate: true };

    const reject = async (error: string) => {
      await writeAudit(ctx, { kind: "system", name: args.source === "meta" ? "Meta Lead Ads" : "Partner API" }, {
        action: "ingestion.rejected",
        entityType: "leadRawPayload",
        entityId: args.rawPayloadId,
        summary: `${args.source} lead ${args.externalId} rejected: ${error}`,
      });
      return { ok: false, error };
    };

    const f = args.fields;
    let firstName = normalizeName(f.firstName);
    let lastName = normalizeName(f.lastName);
    if ((!firstName || !lastName) && f.fullName) {
      const parts = normalizeName(f.fullName).split(" ");
      firstName ||= parts[0] ?? "";
      lastName ||= parts.slice(1).join(" ");
    }
    const phone = normalizeUsPhone(f.phone);
    const email = normalizeEmail(f.email);
    const state = normalizeStateCode(f.state);
    const zip = normalizeZip(f.zip);
    if (!firstName || !lastName) return reject("Missing consumer name");
    if (!phone) return reject("Missing or invalid phone");
    if (!email) return reject("Missing or invalid email");
    if (!state) return reject("Missing state");
    if (!zip) return reject("Missing ZIP code");

    const coverage = await loadCoverageTypes(ctx);
    const coverageKey = (f.coverageType ?? "").toLowerCase().trim();
    const match = coverage.find((c) => c.key === coverageKey || c.name.toLowerCase() === coverageKey);
    const undetermined = !match;

    let reason = (f.reason ?? "").trim();
    let processingNote: string | undefined;
    if (reason.length < 3) {
      if (args.source === "partner") return reject("Missing consumer reason");
      reason = "[Not supplied by the Meta lead form]";
      processingNote = "The Meta lead form did not include the 'what brings you here' question.";
    }

    let consentEvidence: ConsentEvidence;
    if (args.source === "partner") {
      if (!args.consent.text) return reject("Missing consent evidence");
      consentEvidence = {
        versionLabel: `partner:${args.marketingSource}:${args.consent.versionLabel ?? "unversioned"}`,
        contentHash: await sha256Hex(args.consent.text),
        agreedAt: args.consent.agreedAt,
        ipAddress: args.consent.ipAddress,
        userAgent: args.consent.userAgent,
        pageUrl: args.consent.pageUrl,
        method: "partner_api",
        evidence: args.consent.text.slice(0, 5000),
      };
    } else {
      const consentDoc = await getPublishedLegalDocument(ctx, "consumer_consent");
      if (!consentDoc) return reject("No published consumer consent version");
      consentEvidence = {
        legalDocumentId: consentDoc._id,
        documentVersion: consentDoc.version,
        versionLabel: `${consentDoc.title} v${consentDoc.version} (Meta lead form disclaimer)`,
        contentHash: consentDoc.contentHash,
        agreedAt: args.consent.agreedAt,
        method: "meta_lead_form",
      };
    }

    const result = await ingestLead(
      ctx,
      {
        source: args.source,
        marketingSource: args.marketingSource,
        externalId: args.externalId,
        firstName,
        lastName,
        email,
        phone,
        state,
        zip,
        city: f.city?.trim() || undefined,
        coverageType: match?.key ?? "life",
        coverageUndetermined: undetermined,
        ageRange: f.ageRange,
        budgetRange: f.budgetRange,
        reason: reason.slice(0, 1000),
        bestTimeToCall: f.bestTimeToCall,
        processingNote,
      },
      consentEvidence,
      { rawPayloadId: args.rawPayloadId, actor: SYSTEM_ACTOR },
    );
    return { ok: true, reference: result.reference };
  },
});
