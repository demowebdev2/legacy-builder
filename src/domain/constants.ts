/**
 * Fixed business rules. These are NOT configurable at runtime — they are part of the
 * commercial model agreed for Phase 1. Configurable values
 * (prices, weights, retry timing, recipient counts) live in Convex settings tables.
 */

export const LEAD_TYPES = ["exclusive", "standard"] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

/** Minimum lead purchase. */
export const PURCHASE_MINIMUM = 10;
/** Purchases move in steps of this many leads. */
export const PURCHASE_INCREMENT = 5;
/** Upper bound for a single purchase (prototype quantity picker cap). Guards against accidental charges. */
export const PURCHASE_MAXIMUM = 100;
/** Every increment block of 5 contains exactly this many exclusive leads… */
export const EXCLUSIVE_PER_INCREMENT = 1;
/** …and this many standard leads. */
export const STANDARD_PER_INCREMENT = 4;

/** An exclusive lead is only ever released to one account. */
export const EXCLUSIVE_RECIPIENT_COUNT = 1;

/** Producer seats included at no charge on an agency account. */
export const MAX_PRODUCER_SEATS = 25;

/** Consumer "reason" free-text bounds. */
export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 1000;

/** Staff and agent password policy (prototype: "At least 12 characters"). */
export const PASSWORD_MIN_LENGTH = 12;

export const DISPUTE_REASONS = [
  { key: "disconnected", label: "Disconnected number" },
  { key: "wrong_number", label: "Wrong number" },
  { key: "never_enquired", label: "Never enquired" },
  { key: "duplicate", label: "Duplicate" },
  { key: "out_of_area", label: "Outside my licensed area" },
  { key: "deceased", label: "Deceased" },
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number]["key"];

export const ASSIGNMENT_STATUSES = ["new", "contacted", "qualified", "sold", "lost"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const STAFF_ROLES = ["ADMIN", "SUPPORT", "FINANCE", "CONTENT"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const ACCOUNT_ROLES = ["AGENT", "AGENCY_PRINCIPAL", "PRODUCER"] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];
export type Role = StaffRole | AccountRole;

export const DAILY_PACE_OPTIONS = [3, 5, 8, 12, 20, 50] as const;
export const RECEIVING_START_HOURS = [6, 7, 8, 9, 10] as const;
export const RECEIVING_END_HOURS = [17, 18, 19, 20, 21, 22] as const;

export const ACCOUNT_CLOSURE_REASONS = [
  "Too expensive",
  "Lead quality",
  "Not enough volume",
  "Moving to a captive carrier",
  "Leaving the industry",
  "Something else",
] as const;

export const REJECTION_REASONS = [
  "Producer number could not be verified",
  "Licence not active in any requested state",
  "No valid E&O cover",
  "Duplicate of an existing account",
  "Failed background or conduct check",
  "Other",
] as const;

export const BLOCK_REASONS = [
  "Consumer complaints — contact after opt-out",
  "Suspected fraud",
  "Reselling or sharing consumer data",
  "Repeated abuse of the dispute process",
  "Licence revoked by the state",
  "Other conduct issue",
] as const;

export const REVOKE_REASONS = [
  "Consumer requested no contact",
  "Duplicate assignment",
  "Agent licence lapsed",
  "Distribution error",
  "Fraud investigation",
] as const;
