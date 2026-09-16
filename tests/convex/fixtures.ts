/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { expect, vi } from "vitest";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";
import { creditLeads } from "../../convex/ledger";
import { SYSTEM_ACTOR } from "../../convex/lib/auth";
import { DEFAULT_PRICING } from "../../convex/lib/settings";
import schema from "../../convex/schema";
import { type DistributionSettings, DEFAULT_DISTRIBUTION_SETTINGS } from "../../src/domain/distribution";
import { generateLeadReference, sha256Hex } from "../../src/domain/reference";
import { DEFAULT_COVERAGE_TYPES, DEFAULT_FORM_OPTIONS, DEFAULT_STATES, type FormOptionGroup } from "../../src/domain/referenceDefaults";
import { DAY, HOUR } from "../../src/domain/time";

/**
 * Shared fixtures for the Convex integration tests.
 *
 * Modules: every file under `convex/` is made loadable EXCEPT `convex/stripeActions.ts`. That file is a
 * `"use node"` action module that imports the Stripe Node SDK; it cannot run in the edge-runtime test
 * environment and is only reached when `PAYMENTS_PROVIDER=stripe`. The tests run in bypass (mock) mode,
 * so no code path schedules it. Stripe itself is covered by manual/staging verification.
 */
export const modules = import.meta.glob(["../../convex/**/*.*s", "!../../convex/stripeActions.ts"]);

/** Fixed wall clock for every integration test (mid-afternoon Eastern time on a weekday). */
export const TEST_NOW = Date.UTC(2026, 8, 16, 18, 0, 0);

export type TestConvex = ReturnType<typeof makeTest>;
type Ctx = MutationCtx;

function makeTest() {
  return convexTest(schema, modules);
}

/**
 * Creates a fresh in-memory backend. Fake timers are installed so scheduled functions (engine runs after
 * capture, notification deliveries, auto-reload charges, retries) never fire in the background; tests that
 * need one run it explicitly. `Date.now()` is pinned to TEST_NOW and only moves when a test moves it.
 */
export function setupTest() {
  vi.useFakeTimers({ now: TEST_NOW });
  process.env.REQUIRE_STAFF_2FA = "false";
  delete process.env.INTAKE_SHARED_SECRET;
  delete process.env.APP_ENV;
  delete process.env.PAYMENTS_PROVIDER;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.MOCK_AUTO_RELOAD_OUTCOME;
  return makeTest();
}

export function teardownTest() {
  vi.useRealTimers();
}

// ─────────────────────────── errors ───────────────────────────

/** Asserts that a promise rejects with an application error (`ConvexError<{ code }>`) of the given code. */
export async function expectAppError(promise: Promise<unknown>, code: string, messagePattern?: RegExp) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected ${code} error`).toBeDefined();
  expect(caught).toBeInstanceOf(ConvexError);
  const data = (caught as ConvexError<{ code: string; message: string }>).data;
  expect(data.code).toBe(code);
  if (messagePattern) expect(data.message).toMatch(messagePattern);
  return data;
}

// ─────────────────────────── reference world ───────────────────────────

export const CONSENT_TEXT =
  "I agree that Legacy Builders and the licensed agent or agents it matches me with may contact me by phone, text and email about the product I selected. Consent is not a condition of purchase.";

export interface World {
  admin: Id<"users">;
  admin2: Id<"users">;
  support: Id<"users">;
  finance: Id<"users">;
  content: Id<"users">;
  consentDocId: Id<"legalDocuments">;
  termsDocId: Id<"legalDocuments">;
  privacyDocId: Id<"legalDocuments">;
  agreementDocId: Id<"legalDocuments">;
  settingsId: Id<"distributionSettings">;
  pricingId: Id<"pricingVersions">;
}

async function insertLegal(ctx: Ctx, docType: Doc<"legalDocuments">["docType"], slug: string, title: string, content: string) {
  return await ctx.db.insert("legalDocuments", {
    docType,
    slug,
    title,
    version: 1,
    content,
    contentHash: await sha256Hex(content),
    status: "published",
    createdAt: TEST_NOW - 30 * DAY,
    createdByName: "Fixture",
    publishedAt: TEST_NOW - 30 * DAY,
    publishedByName: "Fixture",
  });
}

async function insertUser(ctx: Ctx, fields: Partial<Doc<"users">> & { email: string }) {
  return await ctx.db.insert("users", { ...fields });
}

/** Reference data, legal documents, settings, pricing and one user per staff role. */
export async function seedWorld(t: TestConvex, settings: Partial<DistributionSettings> = {}): Promise<World> {
  return await t.run(async (ctx) => {
    for (const [i, s] of DEFAULT_STATES.entries()) {
      await ctx.db.insert("referenceStates", { code: s.code, name: s.name, serviced: true, sortOrder: i });
    }
    for (const [i, c] of DEFAULT_COVERAGE_TYPES.entries()) {
      await ctx.db.insert("coverageTypes", {
        key: c.key,
        name: c.name,
        icon: c.icon,
        cardDescription: c.cardDescription,
        wizardDescription: c.wizardDescription,
        requiresTpmo: c.requiresTpmo,
        active: true,
        sortOrder: i,
      });
    }
    for (const [group, labels] of Object.entries(DEFAULT_FORM_OPTIONS) as Array<[FormOptionGroup, readonly string[]]>) {
      for (const [i, label] of labels.entries()) await ctx.db.insert("formOptions", { group, label, active: true, sortOrder: i });
    }
    const consentDocId = await insertLegal(ctx, "consumer_consent", "consumer-consent", "Consumer consent (TCPA)", CONSENT_TEXT);
    const termsDocId = await insertLegal(ctx, "terms_of_use", "terms-of-use", "Terms of use", "Terms of use fixture text.");
    const privacyDocId = await insertLegal(ctx, "privacy_policy", "privacy-policy", "Privacy policy", "Privacy policy fixture text.");
    const agreementDocId = await insertLegal(ctx, "agent_agreement", "agent-agreement", "Agent agreement", "Agent agreement fixture text.");

    const settingsId = await ctx.db.insert("distributionSettings", {
      ...DEFAULT_DISTRIBUTION_SETTINGS,
      ...settings,
      engineEnabled: settings.engineEnabled ?? true,
      createdAt: TEST_NOW - 10 * DAY,
      createdByName: "Fixture",
    });
    const pricingId = await ctx.db.insert("pricingVersions", {
      ...DEFAULT_PRICING,
      createdAt: TEST_NOW - 10 * DAY,
      createdByName: "Fixture",
    });

    const admin = await insertUser(ctx, { email: "admin@example.com", role: "ADMIN", firstName: "Ada", lastName: "Admin" });
    const admin2 = await insertUser(ctx, { email: "admin2@example.com", role: "ADMIN", firstName: "Second", lastName: "Admin" });
    const support = await insertUser(ctx, { email: "support@example.com", role: "SUPPORT", firstName: "Sam", lastName: "Support" });
    const finance = await insertUser(ctx, { email: "finance@example.com", role: "FINANCE", firstName: "Fin", lastName: "Ance" });
    const content = await insertUser(ctx, { email: "content@example.com", role: "CONTENT", firstName: "Con", lastName: "Tent" });

    return { admin, admin2, support, finance, content, consentDocId, termsDocId, privacyDocId, agreementDocId, settingsId, pricingId };
  });
}

// ─────────────────────────── identities ───────────────────────────

/**
 * Convex Auth's `getAuthUserId` / `getAuthSessionId` parse the JWT subject as `"<userId>|<sessionId>"`.
 * A real `authSessions` row is created so session-scoped checks see a valid session.
 */
export async function as(t: TestConvex, userId: Id<"users">) {
  const sessionId = await t.run(async (ctx) => ctx.db.insert("authSessions", { userId, expirationTime: TEST_NOW + 30 * DAY }));
  return t.withIdentity({ subject: `${userId}|${sessionId}` });
}

// ─────────────────────────── accounts ───────────────────────────

let uniqueCounter = 0;
const unique = () => ++uniqueCounter;

export interface LicenseSpec {
  state: string;
  status?: Doc<"licenses">["verificationStatus"];
  expiresAt?: number;
}

export interface AccountSpec {
  name?: string;
  type?: "individual" | "agency";
  status?: Doc<"accounts">["status"];
  states?: string[];
  coverageTypes?: string[];
  /** Defaults to a verified licence (valid for a year) in every preference state. */
  licenses?: LicenseSpec[];
  /** Defaults to one year from now; `null` means no E&O policy on file. */
  eoExpiresAt?: number | null;
  tpmo?: boolean;
  balance?: { exclusive?: number; standard?: number };
  dailyPace?: number;
  paused?: boolean;
  pausedUntil?: number;
  qualityHold?: boolean;
  declinedPurchaseOutstanding?: boolean;
  lastAssignedAt?: number;
  timezone?: string;
  autoReload?: { enabled: boolean; threshold: number; quantity: number };
  /** Agencies only (default true). `false` leaves the agency with no active verified seat at all (rule 14 fails). */
  verifiedProducerSeat?: boolean;
}

export interface CreatedAccount {
  accountId: Id<"accounts">;
  userId: Id<"users">;
  /** Agency principal seat (agencies only). */
  principalMemberId?: Id<"agencyMembers">;
  /** Producer seat + login (agencies only). */
  producerMemberId?: Id<"agencyMembers">;
  producerUserId?: Id<"users">;
}

/** Credits a balance through the real ledger helper (PURCHASE entries) so ledger and cache agree. */
export async function creditBalance(ctx: Ctx, accountId: Id<"accounts">, balance: { exclusive?: number; standard?: number }) {
  for (const leadType of ["exclusive", "standard"] as const) {
    const quantity = balance[leadType] ?? 0;
    if (quantity > 0) {
      await creditLeads(ctx, {
        accountId,
        leadType,
        quantity,
        entryType: "PURCHASE",
        reason: "Fixture purchase",
        source: "mock_payment",
        actor: SYSTEM_ACTOR,
      });
    }
  }
}

export async function createAccountIn(ctx: Ctx, spec: AccountSpec = {}): Promise<CreatedAccount> {
  const n = unique();
  const type = spec.type ?? "individual";
  const name = spec.name ?? `Agent ${n}`;
  const email = `agent${n}@example.com`;
  const states = spec.states ?? ["GA"];
  const accountId = await ctx.db.insert("accounts", {
    type,
    status: spec.status ?? "active",
    name,
    businessName: `${name} Insurance`,
    email,
    phone: `+1404555${String(1000 + n).slice(-4)}`,
    npn: String(1000000 + n),
    residentState: states[0] ?? "GA",
    timezone: spec.timezone ?? "America/New_York",
    appliedAt: TEST_NOW - 60 * DAY,
    approvedAt: TEST_NOW - 59 * DAY,
    openingQuantity: 10,
    qualityHold: spec.qualityHold ?? false,
    declinedPurchaseOutstanding: spec.declinedPurchaseOutstanding ?? false,
    lastAssignedAt: spec.lastAssignedAt,
    searchText: `${name} ${email}`,
  });
  const userId = await ctx.db.insert("users", {
    email,
    role: type === "agency" ? "AGENCY_PRINCIPAL" : "AGENT",
    accountId,
    firstName: name.split(" ")[0],
    lastName: name.split(" ").slice(1).join(" ") || "Agent",
  });
  await ctx.db.insert("agentPreferences", {
    accountId,
    coverageTypes: spec.coverageTypes ?? ["life", "mortgage", "final", "retirement", "medicare", "annuity", "health"],
    states,
    dailyPace: spec.dailyPace ?? 50,
    // 0–24 means every hour of the day is inside the receiving window, so wall-clock time never matters.
    receivingStartHour: 0,
    receivingEndHour: 24,
    paused: spec.paused ?? false,
    pausedUntil: spec.pausedUntil,
    notifyEmailOnLead: true,
    notifySmsOnLead: false,
    autoReloadEnabled: spec.autoReload?.enabled ?? false,
    autoReloadThreshold: spec.autoReload?.threshold ?? 3,
    autoReloadQuantity: spec.autoReload?.quantity ?? 20,
    updatedAt: TEST_NOW - 59 * DAY,
  });
  const licenses: LicenseSpec[] = spec.licenses ?? states.map((state) => ({ state }));
  for (const lic of licenses) {
    const status = lic.status ?? "verified";
    await ctx.db.insert("licenses", {
      accountId,
      state: lic.state,
      licenseNumber: `${lic.state}-${n}`,
      expiresAt: lic.expiresAt ?? TEST_NOW + 365 * DAY,
      verificationStatus: status,
      verifiedAt: status === "unverified" ? undefined : TEST_NOW - 59 * DAY,
      submittedAt: TEST_NOW - 60 * DAY,
    });
  }
  if (spec.eoExpiresAt !== null) {
    await ctx.db.insert("eoPolicies", {
      accountId,
      carrier: "Fixture Mutual",
      expiresAt: spec.eoExpiresAt ?? TEST_NOW + 365 * DAY,
      verificationStatus: "verified",
      verifiedAt: TEST_NOW - 59 * DAY,
      submittedAt: TEST_NOW - 60 * DAY,
    });
  }
  if (spec.tpmo) {
    await ctx.db.insert("tpmoApprovals", {
      accountId,
      status: "approved",
      requestedAt: TEST_NOW - 50 * DAY,
      decidedAt: TEST_NOW - 49 * DAY,
    });
  }
  await creditBalance(ctx, accountId, spec.balance ?? { exclusive: 2, standard: 8 });

  const created: CreatedAccount = { accountId, userId };
  if (type === "agency") {
    created.principalMemberId = await ctx.db.insert("agencyMembers", {
      accountId,
      userId,
      name,
      email,
      seatRole: "principal",
      status: "active",
      verificationStatus: "verified",
      invitedAt: TEST_NOW - 60 * DAY,
      activatedAt: TEST_NOW - 60 * DAY,
    });
    const producerEmail = `producer${n}@example.com`;
    const producerUserId = await ctx.db.insert("users", {
      email: producerEmail,
      role: "PRODUCER",
      accountId,
      firstName: "Producer",
      lastName: String(n),
    });
    const verified = spec.verifiedProducerSeat ?? true;
    created.producerUserId = producerUserId;
    created.producerMemberId = await ctx.db.insert("agencyMembers", {
      accountId,
      userId: producerUserId,
      name: `Producer ${n}`,
      email: producerEmail,
      seatRole: "producer",
      status: verified ? "active" : "pending",
      verificationStatus: verified ? "verified" : "unverified",
      invitedAt: TEST_NOW - 60 * DAY,
      activatedAt: verified ? TEST_NOW - 60 * DAY : undefined,
    });
    // Rule 14 counts every active verified non-billing seat (the principal included), so an agency
    // "without a verified seat" also needs an unverified principal seat.
    if (!verified) {
      await ctx.db.patch(created.principalMemberId, { verificationStatus: "unverified" });
    }
  }
  return created;
}

export async function createAccount(t: TestConvex, spec: AccountSpec = {}) {
  return await t.run((ctx) => createAccountIn(ctx, spec));
}

// ─────────────────────────── leads ───────────────────────────

export type LeadSpec = Partial<Doc<"leads">>;

/** Inserts a lead that has already passed intake (queued), with unique contact details. */
export async function insertLead(ctx: Ctx, spec: LeadSpec = {}): Promise<Id<"leads">> {
  const n = unique();
  const leadType = spec.leadType ?? "standard";
  const phone = spec.phone ?? `+1678555${String(1000 + n).slice(-4)}`;
  const email = spec.email ?? `consumer${n}@example.com`;
  return await ctx.db.insert("leads", {
    reference: generateLeadReference(TEST_NOW),
    source: "admin",
    status: "queued",
    firstName: "Casey",
    lastName: `Consumer${n}`,
    state: "GA",
    zip: "30301",
    coverageType: "life",
    coverageUndetermined: false,
    reason: "We just bought a house and want to protect the family.",
    capturedAt: TEST_NOW - HOUR,
    recipientTarget: leadType === "exclusive" ? 1 : 3,
    assignedCount: 0,
    retryAttempt: 0,
    searchText: `consumer ${n}`,
    ...spec,
    leadType,
    phone,
    email,
  });
}

export async function createLead(t: TestConvex, spec: LeadSpec = {}) {
  return await t.run((ctx) => insertLead(ctx, spec));
}

// ─────────────────────────── reads ───────────────────────────

export async function balanceOf(t: TestConvex, accountId: Id<"accounts">) {
  return await t.run(async (ctx) => {
    const doc = await ctx.db
      .query("accountBalances")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .unique();
    return { exclusive: doc?.exclusive ?? 0, standard: doc?.standard ?? 0 };
  });
}

export async function ledgerOf(t: TestConvex, accountId: Id<"accounts">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("leadBalanceLedger")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect(),
  );
}

export async function assignmentsFor(t: TestConvex, leadId: Id<"leads">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("leadAssignments")
      .withIndex("by_lead", (q) => q.eq("leadId", leadId))
      .collect(),
  );
}

export async function scheduledFunctions(t: TestConvex) {
  return await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
}
