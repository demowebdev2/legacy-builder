/**
 * Seed values for configurable reference data. Runtime values come from Convex tables and are
 * editable in Admin → Settings. Values marked "prototype" are copied verbatim from the approved
 * prototype; values marked "assumption" need client confirmation.
 */

export const DEFAULT_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "MS", name: "Mississippi" },
  { code: "NC", name: "North Carolina" },
  { code: "SC", name: "South Carolina" },
  { code: "TN", name: "Tennessee" },
] as const;

/** prototype `PRODUCTS` + home-page / wizard descriptions */
export const DEFAULT_COVERAGE_TYPES = [
  {
    key: "life",
    name: "Life insurance",
    icon: "shield",
    cardDescription: "Cover for the people who depend on your income",
    wizardDescription: "Term or whole life",
    requiresTpmo: false,
  },
  {
    key: "mortgage",
    name: "Mortgage protection",
    icon: "home",
    cardDescription: "Protect the home",
    wizardDescription: "Protect the home",
    requiresTpmo: false,
  },
  {
    key: "final",
    name: "Final expense",
    icon: "heart",
    cardDescription: "Funeral costs",
    wizardDescription: "Funeral costs",
    requiresTpmo: false,
  },
  {
    key: "retirement",
    name: "Retirement planning",
    icon: "chart",
    cardDescription: "Income after work",
    wizardDescription: "Income after work",
    requiresTpmo: false,
  },
  {
    key: "medicare",
    name: "Medicare",
    icon: "cross",
    cardDescription: "Gaps and supplements",
    wizardDescription: "Gaps and supplements",
    requiresTpmo: true,
  },
  {
    key: "annuity",
    name: "Fixed index annuity",
    icon: "coin",
    cardDescription: "Growth with protection",
    wizardDescription: "Growth with protection",
    requiresTpmo: false,
  },
  {
    key: "health",
    name: "Health insurance",
    icon: "plus",
    cardDescription: "Individual or family",
    wizardDescription: "Individual or family",
    requiresTpmo: false,
  },
] as const;

/** Wizard-only choice that is not a coverage type; routed as undetermined (prototype maps it to life). */
export const UNSURE_COVERAGE_KEY = "unsure";

export const DEFAULT_LEAD_TYPE_LABELS = [
  { key: "exclusive", name: "Exclusive", description: "High-intent sources" },
  { key: "standard", name: "Standard", description: "Prospecting campaigns" },
] as const;

/** Assumption D8: only sources evidenced in the prototype are seeded. */
export const DEFAULT_MARKETING_SOURCES = [
  { key: "website", name: "Website (direct)", channel: "website", defaultLeadType: "exclusive" },
  { key: "google_ads", name: "Google Ads", channel: "website", defaultLeadType: "exclusive" },
  { key: "meta_lead_ads", name: "Meta Lead Ads", channel: "meta", defaultLeadType: "standard" },
  { key: "partner_api", name: "Partner API", channel: "partner", defaultLeadType: "standard" },
] as const;

export type FormOptionGroup =
  | "age_range"
  | "coverage_amount"
  | "protecting"
  | "call_time"
  | "budget_range"
  | "contact_method"
  | "producer_count";

export const DEFAULT_FORM_OPTIONS: Record<FormOptionGroup, readonly string[]> = {
  /** prototype AGES */
  age_range: ["Under 30", "30 – 39", "40 – 49", "50 – 59", "60 – 69", "70 or older"],
  /** prototype COVER */
  coverage_amount: [
    "Not sure yet",
    "Under $50,000",
    "$50,000 – $100,000",
    "$100,000 – $250,000",
    "$250,000 – $500,000",
    "Over $500,000",
  ],
  /** prototype WHOM */
  protecting: ["Myself", "Myself and a partner", "My children", "A parent or relative", "My business"],
  /** prototype CALLT */
  call_time: ["Any time", "Morning (8am – 12pm)", "Afternoon (12pm – 5pm)", "Evening (5pm – 8pm)", "Weekends only"],
  /** assumption D7 */
  budget_range: [
    "Not sure yet",
    "Under $50 a month",
    "$50 – $100 a month",
    "$100 – $200 a month",
    "$200 – $350 a month",
    "Over $350 a month",
  ],
  /** brief: contact preferences */
  contact_method: ["Phone call", "Text message", "Email"],
  /** prototype agency application */
  producer_count: ["2 – 5", "6 – 12", "13 – 25", "More than 25"],
};

export const LEGAL_DOCUMENT_TYPES = [
  { docType: "consumer_consent", slug: "consumer-consent", title: "Consumer consent (TCPA)" },
  { docType: "privacy_policy", slug: "privacy-policy", title: "Privacy policy" },
  { docType: "terms_of_use", slug: "terms-of-use", title: "Terms of use" },
  { docType: "agent_agreement", slug: "agent-agreement", title: "Agent agreement" },
  { docType: "medicare_tpmo_addendum", slug: "medicare-tpmo-addendum", title: "Medicare TPMO addendum" },
  { docType: "do_not_sell", slug: "do-not-sell", title: "Do not sell my information" },
] as const;
export type LegalDocType = (typeof LEGAL_DOCUMENT_TYPES)[number]["docType"];
