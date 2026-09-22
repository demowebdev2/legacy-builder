import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { leadMixFor, quotePurchase } from "../src/domain/purchase";
import { DEFAULT_DISTRIBUTION_SETTINGS } from "../src/domain/distribution";
import { formatInvoiceNumber, generateLeadReference, sha256Hex } from "../src/domain/reference";
import {
  DEFAULT_COVERAGE_TYPES,
  DEFAULT_FORM_OPTIONS,
  DEFAULT_LEAD_TYPE_LABELS,
  DEFAULT_MARKETING_SOURCES,
  DEFAULT_STATES,
  type FormOptionGroup,
} from "../src/domain/referenceDefaults";
import { DAY, HOUR, MINUTE } from "../src/domain/time";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { runDistribution } from "./distribution/engine";
import { creditLeads } from "./ledger";
import { type Actor, SYSTEM_ACTOR } from "./lib/auth";
import { counters } from "./lib/counterNames";
import { nextCounter } from "./lib/counters";
import { isProductionDeployment, readEnv } from "./lib/env";
import { DEFAULT_PRICING } from "./lib/settings";

/**
 * DEVELOPMENT FIXTURES — mirrors the approved prototype's seeded world (fictional people, example.com
 * addresses). Refuses to run on a production deployment.
 *
 *   npx convex run seed:run
 *
 * Logins (password from SEED_PASSWORD, default below):
 *   dawn.patterson@example.com (ADMIN) · april.turpin@example.com (ADMIN) · ops@example.com (SUPPORT)
 *   bookkeeper@example.com (FINANCE) · content@example.com (CONTENT)
 *   alicia.reyes@example.com · marcus.whitfield@example.com · dawn.whitfield@example.com (agency principal)
 *   tobias.lund@example.com (producer) · denise.okafor@example.com · hannah.cole@example.com
 *   jerome.tisdale@example.com (pending) · …
 */

const DEFAULT_SEED_PASSWORD = "LegacyBuilders!2026";

// Deterministic PRNG so fixtures are stable between runs.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAFF = [
  { email: "dawn.patterson@example.com", firstName: "Dawn", lastName: "Patterson", role: "ADMIN" },
  { email: "april.turpin@example.com", firstName: "April", lastName: "Turpin", role: "ADMIN" },
  { email: "ops@example.com", firstName: "Ops", lastName: "Support", role: "SUPPORT" },
  { email: "bookkeeper@example.com", firstName: "Book", lastName: "Keeper", role: "FINANCE" },
  { email: "content@example.com", firstName: "Content", lastName: "Editor", role: "CONTENT" },
] as const;

type SeedLicense = { state: string; status: "verified" | "unverified" | "failed" | "expired"; number: string; expiresInDays: number; note?: string };

interface SeedAccount {
  key: string;
  type: "individual" | "agency";
  name: string;
  businessName: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  npn?: string;
  ein?: string;
  status: Doc<"accounts">["status"];
  bought: number;
  autoReload: { on: boolean; at: number; qty: number };
  resident: string;
  states: string[];
  products: string[];
  pace: number;
  paused?: { untilDays: number };
  eo: { carrier: string; expiresInDays: number };
  city: string;
  timezone: string;
  joinedDaysAgo: number;
  lastAssignedHoursAgo: number | null;
  hours: { start: number; end: number };
  licenses: SeedLicense[];
  hold?: boolean;
  statusReason?: string;
  tpmo?: "approved" | "requested";
  declined?: boolean;
  seats?: Array<{ key: string; name: string; email: string; role: "principal" | "producer" | "billing_contact"; verified: "verified" | "unverified" | "not_required"; npn?: string; status: "active" | "pending" | "invited" }>;
}

/** Prototype `ACCOUNTS`, adapted to the no-subscription model (past_due → declined auto-reload, cancelled → closed). */
const ACCOUNTS: SeedAccount[] = [
  {
    key: "alicia", type: "individual", name: "Alicia Reyes", businessName: "Reyes Insurance Services", email: "alicia.reyes@example.com",
    firstName: "Alicia", lastName: "Reyes", phone: "+14045550148", npn: "8841203", status: "active", bought: 25,
    autoReload: { on: true, at: 3, qty: 20 }, resident: "GA", states: ["GA", "FL", "SC"], products: ["life", "mortgage", "final"], pace: 5,
    eo: { carrier: "Scottsdale Insurance", expiresInDays: 214 }, city: "Atlanta, GA", timezone: "America/New_York", joinedDaysAgo: 184,
    lastAssignedHoursAgo: 3, hours: { start: 8, end: 20 },
    licenses: [
      { state: "GA", status: "verified", number: "GA-8841203", expiresInDays: 310 },
      { state: "FL", status: "verified", number: "FL-4471190", expiresInDays: 255 },
      { state: "SC", status: "verified", number: "SC-2210884", expiresInDays: 180 },
    ],
  },
  {
    key: "marcus", type: "individual", name: "Marcus Whitfield", businessName: "Whitfield Legacy Group", email: "marcus.whitfield@example.com",
    firstName: "Marcus", lastName: "Whitfield", phone: "+19125550233", npn: "7712994", status: "active", bought: 50,
    autoReload: { on: true, at: 5, qty: 30 }, resident: "GA", states: ["GA", "SC", "NC", "TN"],
    products: ["life", "mortgage", "final", "retirement", "annuity", "medicare", "health"], pace: 12,
    eo: { carrier: "Hanover Specialty", expiresInDays: 96 }, city: "Savannah, GA", timezone: "America/New_York", joinedDaysAgo: 402,
    lastAssignedHoursAgo: 11, hours: { start: 7, end: 21 }, tpmo: "approved",
    licenses: [
      { state: "GA", status: "verified", number: "GA-7712994", expiresInDays: 288 },
      { state: "SC", status: "verified", number: "SC-7712994", expiresInDays: 120 },
      { state: "NC", status: "verified", number: "NC-9930221", expiresInDays: 340 },
      { state: "TN", status: "verified", number: "TN-4488102", expiresInDays: 198 },
    ],
  },
  {
    key: "whitfieldfg", type: "agency", name: "Whitfield Financial Group, LLC", businessName: "Whitfield Financial Group, LLC", email: "dawn.whitfield@example.com",
    firstName: "Dawn", lastName: "Whitfield", phone: "+17705550911", ein: "58-4471902", status: "active", bought: 100,
    autoReload: { on: true, at: 10, qty: 60 }, resident: "GA", states: ["GA", "FL", "AL", "TN"], products: ["life", "mortgage", "final", "retirement", "annuity"], pace: 20,
    eo: { carrier: "Great American", expiresInDays: 310 }, city: "Marietta, GA", timezone: "America/New_York", joinedDaysAgo: 266,
    lastAssignedHoursAgo: 1, hours: { start: 8, end: 18 },
    licenses: [
      { state: "GA", status: "verified", number: "GA-AG-2290", expiresInDays: 300 },
      { state: "FL", status: "verified", number: "FL-AG-8812", expiresInDays: 210 },
      { state: "AL", status: "verified", number: "AL-AG-3345", expiresInDays: 155 },
      { state: "TN", status: "verified", number: "TN-AG-7761", expiresInDays: 275 },
    ],
    seats: [
      { key: "dawnw", name: "Dawn Whitfield", email: "dawn.whitfield@example.com", role: "principal", verified: "verified", npn: "6620117", status: "active" },
      { key: "tobias", name: "Tobias Lund", email: "tobias.lund@example.com", role: "producer", verified: "verified", npn: "8830145", status: "active" },
      { key: "renee", name: "Renee Salcedo", email: "renee.salcedo@example.com", role: "producer", verified: "verified", npn: "7745902", status: "active" },
      { key: "kwame", name: "Kwame Osei", email: "kwame.osei@example.com", role: "producer", verified: "unverified", npn: "9910334", status: "pending" },
      { key: "priya", name: "Priya Raman", email: "priya.raman@example.com", role: "billing_contact", verified: "not_required", status: "active" },
    ],
  },
  {
    key: "denise", type: "individual", name: "Denise Okafor", businessName: "Okafor Benefits", email: "denise.okafor@example.com",
    firstName: "Denise", lastName: "Okafor", phone: "+17045550362", npn: "9903312", status: "active", bought: 10,
    autoReload: { on: false, at: 3, qty: 10 }, resident: "NC", states: ["NC", "SC"], products: ["final", "medicare", "life"], pace: 3,
    eo: { carrier: "Berkley Insurance", expiresInDays: 41 }, city: "Charlotte, NC", timezone: "America/New_York", joinedDaysAgo: 72,
    lastAssignedHoursAgo: 29, hours: { start: 9, end: 19 }, tpmo: "requested",
    licenses: [
      { state: "NC", status: "verified", number: "NC-9903312", expiresInDays: 220 },
      { state: "SC", status: "verified", number: "SC-9903312", expiresInDays: 190 },
    ],
  },
  {
    key: "ray", type: "individual", name: "Ray Boudreaux", businessName: "Boudreaux Financial", email: "ray.boudreaux@example.com",
    firstName: "Ray", lastName: "Boudreaux", phone: "+16015550774", npn: "5540118", status: "active", bought: 20,
    autoReload: { on: false, at: 3, qty: 20 }, resident: "MS", states: ["MS", "AL", "TN"], products: ["life", "final", "retirement"], pace: 8,
    paused: { untilDays: 4 }, eo: { carrier: "Nationwide E&O", expiresInDays: 158 }, city: "Jackson, MS", timezone: "America/Chicago",
    joinedDaysAgo: 310, lastAssignedHoursAgo: 144, hours: { start: 8, end: 18 },
    licenses: [
      { state: "MS", status: "verified", number: "MS-5540118", expiresInDays: 266 },
      { state: "AL", status: "verified", number: "AL-5540118", expiresInDays: 140 },
      { state: "TN", status: "verified", number: "TN-5540118", expiresInDays: 88 },
    ],
  },
  {
    key: "hannah", type: "individual", name: "Hannah Cole", businessName: "Cole & Associates", email: "hannah.cole@example.com",
    firstName: "Hannah", lastName: "Cole", phone: "+16155550501", npn: "3308871", status: "active", bought: 15,
    autoReload: { on: true, at: 3, qty: 20 }, resident: "TN", states: ["TN", "GA"], products: ["life", "mortgage", "health"], pace: 6,
    eo: { carrier: "Travelers", expiresInDays: 203 }, city: "Nashville, TN", timezone: "America/Chicago", joinedDaysAgo: 148,
    lastAssignedHoursAgo: 216, hours: { start: 8, end: 20 }, declined: true,
    licenses: [
      { state: "TN", status: "verified", number: "TN-3308871", expiresInDays: 240 },
      { state: "GA", status: "expired", number: "GA-3308871", expiresInDays: -12 },
    ],
  },
  {
    key: "victor", type: "individual", name: "Victor Alveraz", businessName: "Alveraz Insurance", email: "victor.alveraz@example.com",
    firstName: "Victor", lastName: "Alveraz", phone: "+13055550299", npn: "2287740", status: "blocked", bought: 20,
    autoReload: { on: false, at: 3, qty: 20 }, resident: "FL", states: ["FL"], products: ["life", "final", "annuity"], pace: 8,
    eo: { carrier: "Chubb", expiresInDays: 120 }, city: "Miami, FL", timezone: "America/New_York", joinedDaysAgo: 220,
    lastAssignedHoursAgo: 432, hours: { start: 8, end: 21 }, hold: true,
    statusReason: "Consumer complaints — contact after opt-out. Three consumer complaints of contact after opt-out. Under review with counsel.",
    licenses: [{ state: "FL", status: "verified", number: "FL-2287740", expiresInDays: 260 }],
  },
  {
    key: "sofia", type: "individual", name: "Sofia Brannon", businessName: "Brannon Retirement", email: "sofia.brannon@example.com",
    firstName: "Sofia", lastName: "Brannon", phone: "+18435550616", npn: "6674401", status: "suspended", bought: 30,
    autoReload: { on: true, at: 5, qty: 30 }, resident: "SC", states: ["SC", "NC"], products: ["retirement", "annuity", "life"], pace: 12,
    eo: { carrier: "Markel", expiresInDays: -6 }, city: "Charleston, SC", timezone: "America/New_York", joinedDaysAgo: 355,
    lastAssignedHoursAgo: 168, hours: { start: 8, end: 19 },
    statusReason: "E&O cover lapsed. Distribution halted until renewal evidence is uploaded.",
    licenses: [
      { state: "SC", status: "verified", number: "SC-6674401", expiresInDays: 300 },
      { state: "NC", status: "verified", number: "NC-6674401", expiresInDays: 210 },
    ],
  },
  {
    key: "jerome", type: "individual", name: "Jerome Tisdale", businessName: "Tisdale Family Cover", email: "jerome.tisdale@example.com",
    firstName: "Jerome", lastName: "Tisdale", phone: "+12515550187", npn: "4419923", status: "pending_verification", bought: 10,
    autoReload: { on: false, at: 3, qty: 10 }, resident: "AL", states: ["AL", "MS"], products: ["final", "life"], pace: 5,
    eo: { carrier: "Philadelphia Insurance", expiresInDays: 178 }, city: "Mobile, AL", timezone: "America/Chicago", joinedDaysAgo: 0.8,
    lastAssignedHoursAgo: null, hours: { start: 9, end: 18 },
    licenses: [
      { state: "AL", status: "unverified", number: "AL-4419923", expiresInDays: 280 },
      { state: "MS", status: "unverified", number: "MS-4419923", expiresInDays: 150 },
    ],
  },
  {
    key: "coastal", type: "agency", name: "Coastal Producers Group", businessName: "Coastal Producers Group", email: "elena.marsh@example.com",
    firstName: "Elena", lastName: "Marsh", phone: "+19045550440", ein: "59-2288104", status: "pending_verification", bought: 40,
    autoReload: { on: false, at: 5, qty: 30 }, resident: "FL", states: ["FL", "GA"], products: ["life", "mortgage", "final", "health"], pace: 20,
    eo: { carrier: "AmTrust", expiresInDays: 240 }, city: "Jacksonville, FL", timezone: "America/New_York", joinedDaysAgo: 2,
    lastAssignedHoursAgo: null, hours: { start: 8, end: 19 },
    licenses: [
      { state: "FL", status: "verified", number: "FL-AG-9902", expiresInDays: 290 },
      { state: "GA", status: "failed", number: "GA-AG-9902", expiresInDays: 200, note: "Licence number does not match the principal NPN on file." },
    ],
    seats: [
      { key: "elena", name: "Elena Marsh", email: "elena.marsh@example.com", role: "principal", verified: "verified", npn: "8890021", status: "pending" },
      { key: "dell", name: "Dell Carrington", email: "dell.carrington@example.com", role: "producer", verified: "unverified", npn: "7761200", status: "invited" },
    ],
  },
  {
    key: "gwen", type: "individual", name: "Gwen Adeyemi", businessName: "Adeyemi Advisory", email: "gwen.adeyemi@example.com",
    firstName: "Gwen", lastName: "Adeyemi", phone: "+18645550928", npn: "8812007", status: "closed", bought: 10,
    autoReload: { on: false, at: 3, qty: 10 }, resident: "SC", states: ["SC"], products: ["life", "final"], pace: 3,
    eo: { carrier: "Hiscox", expiresInDays: 60 }, city: "Greenville, SC", timezone: "America/New_York", joinedDaysAgo: 420,
    lastAssignedHoursAgo: 912, hours: { start: 9, end: 17 }, statusReason: "Moving to a captive carrier.",
    licenses: [{ state: "SC", status: "verified", number: "SC-8812007", expiresInDays: 140 }],
  },
];

const LOGIN_KEYS = ["alicia", "marcus", "whitfieldfg", "tobias", "denise", "ray", "hannah", "victor", "sofia", "jerome", "coastal", "gwen"];

// ─────────────────────────── step 1: reference data & content ───────────────────────────

const CONSENT_TEXT =
  "I agree that Legacy Builders, LLC and the licensed insurance agent or agents it matches me with may contact me at the telephone number and email address I provided, including by automatic telephone dialling system, artificial or prerecorded voice, and SMS text message, about the insurance product I selected. I understand consent is not a condition of purchase, that message and data rates may apply, and that I may revoke this consent at any time by replying STOP or by contacting Legacy Builders directly.";

const LEGAL_SEED: Array<{ docType: Doc<"legalDocuments">["docType"]; slug: string; title: string; content: string }> = [
  { docType: "consumer_consent", slug: "consumer-consent", title: "Consumer consent (TCPA)", content: CONSENT_TEXT },
  { docType: "privacy_policy", slug: "privacy-policy", title: "Privacy policy", content: "[Full privacy policy text — supplied by counsel.]" },
  { docType: "terms_of_use", slug: "terms-of-use", title: "Terms of use", content: "[Full terms of use — supplied by counsel.]" },
  { docType: "agent_agreement", slug: "agent-agreement", title: "Agent agreement", content: "[Agent lead-purchase and data-handling agreement — supplied by counsel.]" },
  { docType: "medicare_tpmo_addendum", slug: "medicare-tpmo-addendum", title: "Medicare TPMO addendum", content: "[Medicare Third-Party Marketing Organization addendum — supplied by counsel.]" },
  { docType: "do_not_sell", slug: "do-not-sell", title: "Do not sell my information", content: "[CCPA-style notice — supplied by counsel.]" },
];

const content = (heroTitle: string, heroBody: string, badge: string, seoTitle: string, seoDescription: string, sections: Array<{ heading: string; body: string }> = []) => ({
  heroTitle,
  heroBody,
  badge,
  sections,
  seoTitle,
  seoDescription,
});

export const CMS_SEED_PAGES = [
  {
    slug: "home",
    title: "Home",
    content: content(
      "Find a licensed insurance agent in your state.",
      "Tell us what coverage you are looking for and we connect you with an independent agent licensed where you live — life insurance, final expense, mortgage protection, Medicare and more. Protecting the people counting on you starts with one conversation.",
      "Every agent licensed and verified",
      "Legacy Builders — Find a licensed insurance agent",
      "Tell us what cover you need. We match you with a licensed independent insurance agent in your state. Free, no obligation.",
    ),
  },
  {
    slug: "how-it-works",
    title: "How it works",
    content: content(
      "How Legacy Builders works",
      "Two sides, one straightforward exchange. Here is exactly what happens on each.",
      "",
      "How it works — Legacy Builders",
      "Free for consumers. Leads you buy outright, for agents.",
    ),
  },
  {
    slug: "for-agents",
    title: "For agents",
    content: content(
      "Leads you can actually work, at a price you can see.",
      "Consented leads matched to the states and product lines you are licensed for, with the consumer's own words about why they are looking. Apply once and we verify your license before anything is released.",
      "For licensed insurance professionals",
      "For agents — Legacy Builders",
      "Consented leads matched to the states and products you are licensed for. License verified before anything is released.",
    ),
  },
  {
    slug: "pricing",
    title: "Agent pricing",
    content: content(
      "Agent pricing",
      "Buy the leads you want, starting at ten and moving up in fives. Every ten is two exclusive and eight standard. They do not expire.",
      "",
      "Agent pricing — Legacy Builders",
      "Buy from ten leads up, in steps of five. Two exclusive in every ten. Nothing expires.",
    ),
  },
  {
    slug: "faq",
    title: "FAQ",
    content: content("Frequently asked questions", "Straight answers for consumers and for agents.", "", "FAQ — Legacy Builders", "Common questions from consumers and agents."),
  },
  {
    slug: "contact",
    title: "Contact",
    content: content(
      "Contact us",
      "Tell us which side of the platform you are on and your message goes to the right person.",
      "",
      "Contact — Legacy Builders",
      "Get in touch with the Legacy Builders team.",
    ),
  },
  {
    slug: "coverage-options",
    title: "Coverage options",
    content: content(
      "Types of insurance coverage, explained without the jargon",
      "You do not need to know which policy is right before you start. This page explains what each type of coverage does, who it tends to suit, and what drives the price, so you are not walking into the conversation blind.",
      "",
      "Coverage options — Legacy Builders",
      "Life, mortgage protection, final expense, retirement, Medicare, annuities and health insurance — matched with a licensed agent in your state.",
    ),
  },
  {
    slug: "about",
    title: "About",
    content: content(
      "About Legacy Builders",
      "[Copy to be supplied by the client.] Legacy Builders connects consumers with licensed independent insurance agents across seven Southeast states.",
      "Licensed agents only · 7 Southeast states",
      "About — Legacy Builders",
      "Legacy Builders connects consumers with licensed independent insurance agents.",
      [
        { heading: "Licensed agents only", body: "Every agent's licences are reviewed state by state before a single lead is released to them." },
        { heading: "Consent first", body: "Every request is recorded with the exact consent wording the consumer agreed to, and consent can be withdrawn at any time." },
      ],
    ),
  },
];

/** Prototype FAQ content. D1: the consumer answer about who calls was adjusted to stay accurate when standard leads are shared. */
const FAQS = [
  { audience: "consumer", question: "Does this cost me anything?", answer: "No. Agents pay for access to the platform. You are never charged, and asking for information does not commit you to buying anything." },
  { audience: "consumer", question: "How many people will call me?", answer: "A small number of licensed agents at most — never an auction, and your details are never resold. [Final wording to be confirmed against the standard-lead sharing decision.]" },
  { audience: "consumer", question: "Who will contact me?", answer: "A licensed independent insurance agent holding an active licence in your state who works with the product you asked about." },
  { audience: "consumer", question: "Can I stop it after I submit?", answer: "Yes. Reply STOP to any text, use your reference number on the withdraw page, or contact us directly. Consent can be withdrawn at any time and all contact stops." },
  { audience: "agent", question: "What do you verify before I get anything?", answer: "Your producer number and state licences, reviewed state by state by our licensing team, plus evidence of errors and omissions cover." },
  { audience: "agent", question: "How does buying leads work?", answer: "You buy a number of leads up front, minimum ten, then in steps of five. Every ten is two exclusive and eight standard, so each step of five adds one exclusive and four standard. That number becomes your balance. One is drawn down when a lead is released to you, never before. There is no monthly cycle and no expiry date." },
  { audience: "agent", question: "Can I choose my own mix of exclusive and standard?", answer: "Not currently. The ratio is fixed at two exclusive in every ten. It keeps exclusive supply spread across the network rather than concentrated with whoever buys first, and it means you always have exclusives in your balance instead of competing for them." },
  { audience: "agent", question: "Can I get a lead back if it was unworkable?", answer: "Yes, within 72 hours. Disconnected number, wrong number, never enquired, duplicate, outside your area, or deceased. If upheld, the lead goes straight back into your balance." },
  { audience: "agent", question: "Do my leads expire?", answer: "No. There is no monthly cycle and no expiry date. The balance runs until it is used, then you buy again or turn on auto-reload." },
] as const;

export const seedReference = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("referenceStates").first()) return { skipped: true };
    const now = Date.now();
    for (const [i, s] of DEFAULT_STATES.entries()) await ctx.db.insert("referenceStates", { code: s.code, name: s.name, serviced: true, sortOrder: i });
    for (const [i, c] of DEFAULT_COVERAGE_TYPES.entries()) {
      await ctx.db.insert("coverageTypes", {
        key: c.key,
        name: c.name,
        icon: c.icon,
        cardDescription: c.cardDescription,
        wizardDescription: c.wizardDescription,
        requiresTpmo: c.requiresTpmo,
        imageUrl: `https://picsum.photos/seed/lb-${c.key}/420/260`,
        active: true,
        sortOrder: i,
      });
    }
    for (const l of DEFAULT_LEAD_TYPE_LABELS) await ctx.db.insert("leadTypeLabels", { key: l.key, name: l.name, description: l.description });
    for (const [i, m] of DEFAULT_MARKETING_SOURCES.entries()) {
      await ctx.db.insert("marketingSources", { key: m.key, name: m.name, channel: m.channel, defaultLeadType: m.defaultLeadType, active: true, sortOrder: i });
    }
    for (const [group, labels] of Object.entries(DEFAULT_FORM_OPTIONS) as Array<[FormOptionGroup, readonly string[]]>) {
      for (const [i, label] of labels.entries()) await ctx.db.insert("formOptions", { group, label, active: true, sortOrder: i });
    }
    for (const doc of LEGAL_SEED) {
      await ctx.db.insert("legalDocuments", {
        ...doc,
        version: 1,
        contentHash: await sha256Hex(doc.content),
        status: "published",
        createdAt: now - 52 * DAY,
        createdByName: "Seed",
        publishedAt: now - 52 * DAY,
        publishedByName: "Seed",
      });
    }
    for (const page of CMS_SEED_PAGES) {
      await ctx.db.insert("cmsPages", { ...page, status: "published", version: 1, publishedAt: now - 4 * DAY, updatedAt: now - 4 * DAY, updatedByName: "Seed" });
    }
    for (const [i, f] of FAQS.entries()) await ctx.db.insert("faqs", { ...f, published: true, sortOrder: i, updatedAt: now });
    for (const name of ["hero-family", "agent-meeting", "team-office", "coastal-home", "consult-desk", "handshake", "paperwork", "office-window"]) {
      await ctx.db.insert("media", {
        externalUrl: `https://picsum.photos/seed/${name}/400/300`,
        filename: `${name}.jpg`,
        altText: name.replace(/-/g, " ") + " (placeholder photography — replace before launch)",
        uploadedAt: now - 10 * DAY,
      });
    }
    await ctx.db.insert("pricingVersions", { ...DEFAULT_PRICING, createdAt: now - 60 * DAY, createdByName: "Seed", note: "Prototype placeholder rates" });
    for (const [i, b] of [
      { name: "Top-up 10", quantity: 10, discountPercent: 0, blurb: "Cover a busy week", featured: false },
      { name: "Bundle 30", quantity: 30, discountPercent: 10, blurb: "A month of extra volume", featured: true },
      { name: "Bundle 60", quantity: 60, discountPercent: 15, blurb: "Scaling a team", featured: false },
    ].entries()) {
      await ctx.db.insert("bundles", { ...b, active: true, sortOrder: i, createdAt: now, updatedAt: now });
    }
    await ctx.db.insert("distributionSettings", { ...DEFAULT_DISTRIBUTION_SETTINGS, createdAt: now - 60 * DAY, createdByName: "Seed", note: "Initial settings (brief defaults)" });
    await ctx.db.insert("retentionSettings", { consentArtifactYears: 5, leadPiiMonthsAfterClosure: 36, leadVisibilityDaysAfterClosure: 90, updatedAt: now });
    return { skipped: false };
  },
});

// ─────────────────────────── step 2: accounts ───────────────────────────

async function seedOrder(
  ctx: MutationCtx,
  account: Doc<"accounts">,
  input: { kind: Doc<"orders">["kind"]; quantity: number; discountPercent: number; label: string; at: number; status: "paid" | "authorized" | "failed"; bundleId?: Id<"bundles"> },
) {
  const pricing = (await ctx.db.query("pricingVersions").withIndex("by_createdAt").order("desc").first())!;
  const quote = quotePurchase(input.quantity, pricing, input.discountPercent);
  const orderNumber = formatInvoiceNumber(await nextCounter(ctx, counters.invoice));
  const orderId = await ctx.db.insert("orders", {
    accountId: account._id,
    orderNumber,
    kind: input.kind,
    label: input.label,
    bundleId: input.bundleId,
    quantity: quote.quantity,
    exclusiveQty: quote.exclusive,
    standardQty: quote.standard,
    standardRateCents: quote.standardRateCents,
    exclusiveRateCents: quote.exclusiveRateCents,
    listCents: quote.listCents,
    discountPercent: quote.discountPercent,
    discountCents: quote.discountCents,
    totalCents: quote.totalCents,
    pricingVersionId: pricing._id,
    status: input.status,
    provider: "mock",
    createdAt: input.at,
    authorizedAt: input.status !== "failed" ? input.at : undefined,
    paidAt: input.status === "paid" ? input.at : undefined,
    creditedAt: input.status === "paid" ? input.at : undefined,
    failedAt: input.status === "failed" ? input.at : undefined,
    failureCode: input.status === "failed" ? "card_declined" : undefined,
    failureMessage: input.status === "failed" ? "card_declined · insufficient funds" : undefined,
    refundedCents: 0,
    attemptCount: 1,
  });
  await ctx.db.insert("payments", {
    orderId,
    accountId: account._id,
    provider: "mock",
    kind: input.status === "authorized" ? "authorization" : "charge",
    amountCents: quote.totalCents,
    status: input.status === "paid" ? "succeeded" : input.status === "authorized" ? "authorized" : "failed",
    cardBrand: "Test card",
    cardLast4: "4242",
    failureCode: input.status === "failed" ? "card_declined" : undefined,
    failureMessage: input.status === "failed" ? "Insufficient funds" : undefined,
    createdAt: input.at,
    updatedAt: input.at,
  });
  if (input.status === "paid") {
    const mix = leadMixFor(input.quantity);
    const entryType = input.kind === "auto_reload" ? "AUTO_RELOAD" : "PURCHASE";
    for (const [leadType, quantity] of [["exclusive", mix.exclusive], ["standard", mix.standard]] as const) {
      await creditLeads(ctx, {
        accountId: account._id,
        leadType,
        quantity,
        entryType,
        reason: `${input.label} — ${orderNumber}`,
        source: "mock_payment",
        actor: SYSTEM_ACTOR,
        relatedOrderId: orderId,
        createdAt: input.at,
      });
    }
  }
  return orderId;
}

export const seedAccounts = internalMutation({
  args: { users: v.record(v.string(), v.id("users")) },
  handler: async (ctx, { users }) => {
    if (await ctx.db.query("accounts").first()) return { skipped: true };
    const now = Date.now();
    const staffAdmin = users["dawn.patterson@example.com"];
    const adminActor: Actor = { kind: "user", userId: staffAdmin, name: "Dawn Patterson", role: "ADMIN" };
    for (const s of STAFF) {
      await ctx.db.patch(users[s.email], { role: s.role, firstName: s.firstName, lastName: s.lastName, name: `${s.firstName} ${s.lastName}` });
    }
    const bundles = await ctx.db.query("bundles").collect();
    const accountIds: Record<string, Id<"accounts">> = {};

    for (const spec of ACCOUNTS) {
      const joined = now - spec.joinedDaysAgo * DAY;
      const approved = !["pending_verification", "rejected"].includes(spec.status);
      const accountId = await ctx.db.insert("accounts", {
        type: spec.type,
        status: spec.status,
        name: spec.name,
        businessName: spec.businessName,
        email: spec.email,
        phone: spec.phone,
        npn: spec.npn,
        ein: spec.ein,
        principalName: spec.type === "agency" ? `${spec.firstName} ${spec.lastName}` : undefined,
        producerCountBand: spec.type === "agency" ? "2 – 5" : undefined,
        requestedSeats: spec.seats?.length ?? 1,
        residentState: spec.resident,
        city: spec.city,
        timezone: spec.timezone,
        appliedAt: joined,
        approvedAt: approved ? joined + HOUR * 20 : undefined,
        approvedBy: approved ? staffAdmin : undefined,
        statusReason: spec.statusReason,
        statusChangedAt: spec.statusReason ? now - 11 * DAY : undefined,
        openingQuantity: spec.bought,
        qualityHold: !!spec.hold,
        declinedPurchaseOutstanding: !!spec.declined,
        lastAssignedAt: undefined,
        defaultPaymentMethodId: "mock_pm_4242",
        cardBrand: "Test card",
        cardLast4: "4242",
        cardExpMonth: 4,
        cardExpYear: 2029,
        searchText: [spec.name, spec.businessName, spec.email, spec.npn, spec.ein].filter(Boolean).join(" "),
      });
      accountIds[spec.key] = accountId;
      const loginUser = users[spec.email];
      await ctx.db.patch(loginUser, {
        role: spec.type === "agency" ? "AGENCY_PRINCIPAL" : "AGENT",
        accountId,
        firstName: spec.firstName,
        lastName: spec.lastName,
        name: `${spec.firstName} ${spec.lastName}`,
        phone: spec.phone,
      });
      await ctx.db.insert("agentPreferences", {
        accountId,
        coverageTypes: spec.products,
        states: spec.states,
        dailyPace: spec.pace,
        receivingStartHour: spec.hours.start,
        receivingEndHour: spec.hours.end,
        paused: !!spec.paused,
        pausedUntil: spec.paused ? now + spec.paused.untilDays * DAY : undefined,
        notifyEmailOnLead: true,
        notifySmsOnLead: true,
        // Enabled after the lead backfill so seeding does not trigger purchases.
        autoReloadEnabled: false,
        autoReloadThreshold: spec.autoReload.at,
        autoReloadQuantity: spec.autoReload.qty,
        updatedAt: joined,
      });
      for (const lic of spec.licenses) {
        await ctx.db.insert("licenses", {
          accountId,
          state: lic.state,
          licenseNumber: lic.number,
          expiresAt: now + lic.expiresInDays * DAY,
          verificationStatus: lic.status,
          verificationNotes: lic.note,
          verifiedAt: lic.status === "verified" || lic.status === "expired" || lic.status === "failed" ? joined + HOUR * 18 : undefined,
          verifiedBy: lic.status === "unverified" ? undefined : staffAdmin,
          submittedAt: joined,
        });
      }
      await ctx.db.insert("eoPolicies", {
        accountId,
        carrier: spec.eo.carrier,
        expiresAt: now + spec.eo.expiresInDays * DAY,
        verificationStatus: spec.eo.expiresInDays < 0 ? "expired" : approved ? "verified" : "unverified",
        verifiedAt: approved ? joined + HOUR * 18 : undefined,
        verifiedBy: approved ? staffAdmin : undefined,
        submittedAt: joined,
      });
      if (spec.tpmo) {
        await ctx.db.insert("tpmoApprovals", {
          accountId,
          status: spec.tpmo,
          requestedAt: joined,
          decidedAt: spec.tpmo === "approved" ? joined + DAY : undefined,
          decidedBy: spec.tpmo === "approved" ? staffAdmin : undefined,
          decisionNotes: spec.tpmo === "approved" ? "CMS TPMO requirements confirmed." : undefined,
        });
      }
      await ctx.db.insert("accountBalances", {
        accountId,
        exclusive: 0,
        standard: 0,
        exclusiveIssued: 0,
        standardIssued: 0,
        exclusivePurchased: 0,
        standardPurchased: 0,
        exclusiveDelivered: 0,
        standardDelivered: 0,
        updatedAt: joined,
      });
      for (const seat of spec.seats ?? []) {
        const seatUser = users[seat.email];
        const memberId = await ctx.db.insert("agencyMembers", {
          accountId,
          userId: seat.status === "invited" ? undefined : seatUser,
          name: seat.name,
          email: seat.email,
          npn: seat.npn,
          seatRole: seat.role,
          status: seat.status,
          verificationStatus: seat.verified,
          invitedAt: joined,
          activatedAt: seat.status === "active" ? joined : undefined,
          verifiedAt: seat.verified === "verified" ? joined : undefined,
        });
        if (seat.role === "producer" && seatUser && seat.status !== "invited") {
          const [firstName, lastName] = seat.name.split(" ");
          await ctx.db.patch(seatUser, { role: "PRODUCER", accountId, firstName, lastName, name: seat.name });
          if (seat.verified === "verified") {
            for (const lic of spec.licenses.filter((l) => l.status === "verified").slice(0, 2)) {
              await ctx.db.insert("licenses", {
                accountId,
                memberId,
                state: lic.state,
                licenseNumber: `${lic.state}-${seat.npn}`,
                expiresAt: now + 200 * DAY,
                verificationStatus: "verified",
                verifiedAt: joined + DAY,
                verifiedBy: staffAdmin,
                submittedAt: joined,
              });
            }
          }
        }
      }

      const account = (await ctx.db.get(accountId))!;
      const openingId = await seedOrder(ctx, account, {
        kind: "opening",
        quantity: spec.bought,
        discountPercent: 0,
        label: "Opening purchase",
        at: approved ? joined + HOUR * 20 : joined,
        status: approved ? "paid" : "authorized",
      });
      await ctx.db.patch(accountId, { openingOrderId: openingId });
    }

    const topUp = async (key: string, bundleName: string, daysAgo: number) => {
      const bundle = bundles.find((b) => b.name === bundleName)!;
      const account = (await ctx.db.get(accountIds[key]))!;
      await seedOrder(ctx, account, { kind: "bundle", quantity: bundle.quantity, discountPercent: bundle.discountPercent, label: bundle.name, at: now - daysAgo * DAY, status: "paid", bundleId: bundle._id });
    };
    await topUp("alicia", "Top-up 10", 5);
    await topUp("marcus", "Bundle 30", 12);
    await topUp("whitfieldfg", "Bundle 60", 20);
    await creditLeads(ctx, {
      accountId: accountIds.denise,
      leadType: "standard",
      quantity: 5,
      entryType: "ADMIN_ADJUSTMENT",
      reason: "Goodwill — three disputed leads in first week",
      source: "admin",
      actor: adminActor,
      createdAt: now - 9 * DAY,
    });
    const hannah = (await ctx.db.get(accountIds.hannah))!;
    await seedOrder(ctx, hannah, { kind: "auto_reload", quantity: 20, discountPercent: 0, label: "Auto-reload", at: now - 3 * DAY, status: "failed" });

    return { skipped: false, accountIds };
  },
});

// ─────────────────────────── step 3: leads through the real engine ───────────────────────────

const FN = ["Marcus", "Tanya", "Wendell", "Grace", "Devon", "Louise", "Kendra", "Otis", "Priscilla", "Hector", "Bernice", "Jamal", "Colleen", "Reggie", "Yolanda", "Curtis", "Maribel", "Nathaniel", "Deloris", "Emmett", "Shanice", "Roland", "Faye", "Terrence", "Lorna", "Dwight", "Camille", "Willard", "Renata", "Bobby"];
const LN = ["Whitfield", "Beaumont", "Ashford", "Crenshaw", "Ellery", "Fontaine", "Gaddis", "Holloway", "Ivers", "Jessup", "Kimbrough", "Landrum", "Marchetti", "Neeley", "Ostrander", "Pemberton", "Quinlan", "Radcliffe", "Stallings", "Thornbury", "Underwood", "Vandiver", "Wexler", "Yarborough", "Zeller", "Ardmore", "Blakeney", "Coggins", "Dunleavy", "Estes"];
const CITIES: Record<string, string[]> = {
  GA: ["Atlanta", "Savannah", "Macon", "Augusta", "Marietta"],
  FL: ["Jacksonville", "Orlando", "Tampa", "Tallahassee", "Ocala"],
  SC: ["Charleston", "Columbia", "Greenville", "Rock Hill", "Florence"],
  NC: ["Charlotte", "Raleigh", "Durham", "Asheville", "Wilmington"],
  TN: ["Nashville", "Memphis", "Knoxville", "Chattanooga", "Franklin"],
  AL: ["Birmingham", "Mobile", "Montgomery", "Huntsville", "Dothan"],
  MS: ["Jackson", "Gulfport", "Hattiesburg", "Biloxi", "Tupelo"],
  TX: ["Houston"],
};
const REASONS = [
  "We just had our second child and I want to make sure my family is protected if something happens to me.",
  "We closed on a house last month and the lender mentioned mortgage protection.",
  "My mother passed recently and I realised I have nothing in place for my own final expenses.",
  "I'm retiring in two years and need to understand how to turn savings into income.",
  "I turn 65 in three months and I'm confused by the Medicare supplement options.",
  "My employer coverage ends when I start my own business next month.",
  "I want something that grows but can't lose value — my CDs aren't keeping up.",
];
const HIST = [
  [1.2, "GA", "life"], [2.4, "GA", "mortgage"], [3.1, "FL", "final"], [4.5, "SC", "life"], [5.8, "NC", "medicare"], [7.2, "GA", "retirement"],
  [9.0, "TN", "life"], [11.5, "GA", "final"], [14.0, "FL", "annuity"], [17.5, "SC", "mortgage"], [21.0, "GA", "life"], [26.0, "NC", "final"],
  [30.0, "GA", "health"], [35.0, "TN", "mortgage"], [41.0, "AL", "final"], [47.0, "GA", "annuity"], [53.0, "FL", "life"], [60.0, "SC", "retirement"],
  [68.0, "GA", "life"], [76.0, "NC", "life"], [88.0, "GA", "medicare"], [96.0, "TN", "final"], [110.0, "FL", "mortgage"], [124.0, "GA", "life"],
] as const;

export const seedLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await ctx.db.query("leads").first()) return { skipped: true };
    const rnd = mulberry32(20260902);
    const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
    const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
    const now = Date.now();
    const consent = (await ctx.db.query("legalDocuments").withIndex("by_type_status", (q) => q.eq("docType", "consumer_consent").eq("status", "published")).first())!;
    const coverageNames = ["life", "mortgage", "final", "retirement", "medicare", "annuity", "health"];
    const ages = DEFAULT_FORM_OPTIONS.age_range;
    const covers = DEFAULT_FORM_OPTIONS.coverage_amount;
    const whom = DEFAULT_FORM_OPTIONS.protecting;
    const callTimes = DEFAULT_FORM_OPTIONS.call_time;
    const budgets = DEFAULT_FORM_OPTIONS.budget_range;
    const methods = DEFAULT_FORM_OPTIONS.contact_method;

    const makeLead = async (capturedAt: number, state: string, coverageType: string, status: Doc<"leads">["status"], extra: Partial<Doc<"leads">> = {}) => {
      const firstName = pick(FN);
      const lastName = pick(LN);
      const city = pick(CITIES[state] ?? ["—"]);
      const phone = `+1${ri(205, 912)}555${String(ri(100, 999)).padStart(4, "0")}`;
      const email = `${firstName}.${lastName}.${ri(10, 99)}@example.com`.toLowerCase();
      const reference = generateLeadReference(capturedAt);
      const sequence = await nextCounter(ctx, counters.leadGrade);
      const leadType = sequence % 5 === 0 ? "exclusive" : "standard";
      const leadId = await ctx.db.insert("leads", {
        reference,
        source: "website",
        marketingSource: rnd() < 0.3 ? "google_ads" : rnd() < 0.5 ? "meta_lead_ads" : "website",
        status,
        leadType,
        gradeSequence: sequence,
        firstName,
        lastName,
        email,
        phone,
        state,
        zip: String(ri(30000, 39999)),
        city,
        coverageType,
        coverageUndetermined: false,
        ageRange: pick(ages),
        coverageAmount: pick(covers),
        protecting: pick(whom),
        budgetRange: pick(budgets),
        reason: REASONS[coverageNames.indexOf(coverageType)] ?? REASONS[0],
        bestTimeToCall: pick(callTimes),
        preferredContactMethod: pick(methods),
        capturedAt,
        recipientTarget: leadType === "exclusive" ? 1 : DEFAULT_DISTRIBUTION_SETTINGS.standardRecipientCount,
        assignedCount: 0,
        retryAttempt: 0,
        consumerNotifiedAt: capturedAt,
        searchText: [reference, firstName, lastName, email, phone, city].join(" "),
        ...extra,
      });
      const consentId = await ctx.db.insert("consents", {
        leadId,
        legalDocumentId: consent._id,
        documentVersion: consent.version,
        versionLabel: `${consent.title} v${consent.version}`,
        contentHash: consent.contentHash,
        agreedAt: capturedAt,
        ipAddress: `73.${ri(10, 240)}.${ri(10, 240)}.${ri(2, 250)}`,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X)",
        pageUrl: "https://legacybuilders.com/request",
        method: "web_form",
        phoneSnapshot: phone,
        emailSnapshot: email,
      });
      await ctx.db.patch(leadId, { consentId });
      return leadId;
    };

    const historical: Id<"leads">[] = [];
    for (const [hoursAgo, state, coverage] of [...HIST].reverse()) {
      const at = now - hoursAgo * HOUR;
      const leadId = await makeLead(at, state, coverage, "queued");
      historical.push(leadId);
      await runDistribution(ctx, leadId, { trigger: "capture", now: at, mode: "backfill" });
    }

    // Simulated agent work on older releases (prototype seed).
    const assignments = await ctx.db.query("leadAssignments").collect();
    for (const a of assignments) {
      const ageH = (now - a.assignedAt) / HOUR;
      if (ageH > 3) await ctx.db.patch(a._id, { openedAt: a.assignedAt + ri(5, 90) * MINUTE });
      if (ageH <= 6) continue;
      const r = rnd();
      const status = r < 0.16 ? "new" : r < 0.5 ? "contacted" : r < 0.68 ? "qualified" : r < 0.8 ? "sold" : "lost";
      if (status === "new") continue;
      const contactedAt = a.assignedAt + ri(20, 300) * MINUTE;
      await ctx.db.patch(a._id, { status, contactedAt, statusUpdatedAt: contactedAt });
      const account = await ctx.db.get(a.accountId);
      await ctx.db.insert("assignmentEvents", { assignmentId: a._id, leadId: a.leadId, accountId: a.accountId, kind: "status", status: "contacted", actorName: account?.name ?? "Agent", at: contactedAt });
      if (status !== "contacted") {
        await ctx.db.insert("assignmentEvents", { assignmentId: a._id, leadId: a.leadId, accountId: a.accountId, kind: "status", status, actorName: account?.name ?? "Agent", at: contactedAt + ri(60, 2400) * MINUTE });
      }
    }

    // A duplicate, an out-of-area, two unassigned, two queued (prototype).
    const original = (await ctx.db.get(historical[3]))!;
    await makeLead(now - 6.4 * HOUR, "GA", original.coverageType, "duplicate", {
      duplicateOfLeadId: original._id,
      phone: original.phone,
      processingNote: `Phone matched lead ${original.reference} within the 30-day window for the same product.`,
    });
    await makeLead(now - 13 * HOUR, "TX", "life", "out_of_area", {
      processingNote: "Texas is outside the 7 serviced states. Held, not distributed, and reported against the Meta campaign that produced it.",
    });
    for (const [hoursAgo, state] of [[3.6, "MS"], [2.1, "AL"]] as const) {
      const leadId = await makeLead(now - hoursAgo * HOUR, state, "health", "queued");
      await runDistribution(ctx, leadId, { trigger: "capture", now: now - hoursAgo * HOUR, mode: "backfill" });
    }
    await makeLead(now - 0.3 * HOUR, "GA", "life", "queued");
    await makeLead(now - 0.15 * HOUR, "FL", "mortgage", "queued");

    // Disputes (prototype: one upheld, two pending, one rejected).
    const disputable = (await ctx.db.query("leadAssignments").collect())
      .filter((a) => ["contacted", "lost", "new"].includes(a.status) && now - a.assignedAt < 60 * HOUR)
      .slice(0, 4);
    const specs = [
      { reason: "disconnected", status: "upheld", note: "Carrier lookup confirms the number is out of service. Lead returned to the balance, Meta source flagged." },
      { reason: "never_enquired", status: "pending", note: "" },
      { reason: "wrong_number", status: "pending", note: "" },
      { reason: "duplicate", status: "rejected", note: "The earlier enquiry was for final expense; this one is life. Distinct intent, the lead stands." },
    ] as const;
    const staffAdmin = (await ctx.db.query("users").withIndex("email", (q) => q.eq("email", "dawn.patterson@example.com")).unique())!;
    for (const [i, spec] of specs.entries()) {
      const a = disputable[i];
      if (!a) continue;
      const submittedAt = a.assignedAt + ri(4, 30) * HOUR;
      const accountUser = (await ctx.db.query("users").withIndex("by_accountId", (q) => q.eq("accountId", a.accountId)).first())!;
      const disputeId = await ctx.db.insert("disputes", {
        assignmentId: a._id,
        leadId: a.leadId,
        accountId: a.accountId,
        leadType: a.leadType,
        reason: spec.reason,
        details: spec.status === "pending" ? "Called twice — the person who answered said they never asked for anything." : undefined,
        submittedAt: Math.min(submittedAt, now - HOUR),
        submittedBy: accountUser._id,
        status: spec.status,
        decisionNotes: spec.note || undefined,
        decidedAt: spec.status === "pending" ? undefined : Math.min(submittedAt + 20 * HOUR, now - 30 * MINUTE),
        decidedBy: spec.status === "pending" ? undefined : staffAdmin._id,
        decidedByName: spec.status === "pending" ? undefined : "Dawn Patterson",
        autoDecided: false,
      });
      if (spec.status === "upheld") {
        const entryId = await creditLeads(ctx, {
          accountId: a.accountId,
          leadType: a.leadType,
          quantity: 1,
          entryType: "DISPUTE_RETURN",
          reason: "Dispute upheld — Disconnected number",
          source: "admin",
          actor: { kind: "user", userId: staffAdmin._id, name: "Dawn Patterson", role: "ADMIN" },
          relatedLeadId: a.leadId,
          relatedAssignmentId: a._id,
          relatedDisputeId: disputeId,
          createdAt: Math.min(submittedAt + 20 * HOUR, now - 30 * MINUTE),
        });
        await ctx.db.patch(disputeId, { returnLedgerEntryId: entryId });
      }
    }
    return { skipped: false, leads: historical.length + 6 };
  },
});

// ─────────────────────────── step 4: finishing touches ───────────────────────────

export const seedFinish = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const spec of ACCOUNTS) {
      const account = await ctx.db.query("accounts").withIndex("by_email", (q) => q.eq("email", spec.email)).first();
      if (!account) continue;
      const prefs = await ctx.db.query("agentPreferences").withIndex("by_account", (q) => q.eq("accountId", account._id)).unique();
      if (prefs && prefs.autoReloadEnabled !== spec.autoReload.on && !spec.declined) await ctx.db.patch(prefs._id, { autoReloadEnabled: spec.autoReload.on });
      if (!account.lastAssignedAt && spec.lastAssignedHoursAgo != null) {
        await ctx.db.patch(account._id, { lastAssignedAt: now - spec.lastAssignedHoursAgo * HOUR });
      }
    }
    const alicia = await ctx.db.query("accounts").withIndex("by_email", (q) => q.eq("email", "alicia.reyes@example.com")).first();
    if (alicia) {
      const add = async (type: Doc<"notifications">["type"], title: string, body: string, hoursAgo: number, link?: string) =>
        await ctx.db.insert("notifications", { audience: "account", accountId: alicia._id, type, title, body, link, channels: ["in_app", "email"], createdAt: now - hoursAgo * HOUR });
      await add("licence", "Licence expiring", "Your South Carolina licence expires in 180 days. No action needed yet.", 144, "/agent/licenses");
      await add("billing", "Purchase successful", "Top-up 10 — $260. 2 exclusive and 8 standard added to your balance.", 120, "/agent/purchases");
      await add("leads", "Auto-reload is on", "When your balance reaches 3 we will add another 20 leads automatically. Nothing in your balance expires, so there is no deadline to work against.", 20, "/agent/balance");
    }
    await ctx.db.insert("notifications", {
      audience: "staff",
      type: "account",
      title: "New application — Jerome Tisdale",
      body: "2 state licence(s) to verify. Opening purchase of 10 leads is authorised.",
      link: "/admin/verification",
      channels: ["in_app"],
      createdAt: now - 19 * HOUR,
    });
    return { ok: true };
  },
});

export const run = internalAction({
  args: { password: v.optional(v.string()) },
  handler: async (ctx, { password }): Promise<{ ok: boolean; message: string }> => {
    if (isProductionDeployment()) throw new Error("Refusing to seed a production deployment.");
    const secret = password ?? readEnv("SEED_PASSWORD") ?? DEFAULT_SEED_PASSWORD;
    const reference = await ctx.runMutation(internal.seed.seedReference, {});
    const emails = [
      ...STAFF.map((s) => s.email),
      ...ACCOUNTS.map((a) => a.email),
      ...ACCOUNTS.flatMap((a) => (a.seats ?? []).filter((s) => s.status !== "invited").map((s) => s.email)),
    ];
    const users: Record<string, Id<"users">> = {};
    for (const email of [...new Set(emails)]) {
      const existing = await ctx.runQuery(internal.seedHelpers.userByEmail, { email });
      if (existing) {
        users[email] = existing;
        continue;
      }
      const { user } = await createAccount(ctx, { provider: "password", account: { id: email, secret }, profile: { email } });
      users[email] = user._id as Id<"users">;
    }
    const accounts = await ctx.runMutation(internal.seed.seedAccounts, { users });
    const leads = await ctx.runMutation(internal.seed.seedLeads, {});
    await ctx.runMutation(internal.seed.seedFinish, {});
    return {
      ok: true,
      message: `reference ${reference.skipped ? "kept" : "seeded"}, accounts ${accounts.skipped ? "kept" : "seeded"}, leads ${leads.skipped ? "kept" : "seeded"}. ${LOGIN_KEYS.length} agent logins + ${STAFF.length} staff logins use the seed password.`,
    };
  },
});
