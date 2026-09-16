import type { LeadType } from "../../../src/domain/constants";

/** Everything a rule may look at for one lead. */
export interface EligibilityLead {
  state: string;
  coverageType: string;
  leadType: LeadType;
  requiresTpmo: boolean;
}

/** Pre-loaded, read-only snapshot of one candidate account. Rules never touch the database. */
export interface CandidateSnapshot {
  accountId: string;
  name: string;
  type: "individual" | "agency";
  status: string;
  timezone: string;
  qualityHold: boolean;
  declinedPurchaseOutstanding: boolean;
  lastAssignedAt: number | null;
  preferences: {
    states: string[];
    coverageTypes: string[];
    dailyPace: number;
    receivingStartHour: number;
    receivingEndHour: number;
    paused: boolean;
    pausedUntil: number | null;
  } | null;
  licenseForState: { verificationStatus: string; expiresAt: number } | null;
  eoPolicy: { verificationStatus: string; expiresAt: number } | null;
  tpmoApproved: boolean;
  balance: { exclusive: number; standard: number };
  assignedToday: number;
  alreadyHoldsLead: boolean;
  activeVerifiedSeats: number;
}

export interface RuleContext {
  now: number;
  holdOnDeclinedPurchase: boolean;
}

export interface EligibilityRule {
  key: string;
  label: string;
  /**
   * Hard rules are legal / financial constraints nobody can override — including an admin making a
   * manual assignment. Soft rules are the agent's own preferences and operational holds.
   */
  hard: boolean;
  appliesTo?: (lead: EligibilityLead, account: CandidateSnapshot) => boolean;
  /** Returns null when the account passes, otherwise a short human-readable reason. */
  check: (account: CandidateSnapshot, lead: EligibilityLead, ctx: RuleContext) => string | null;
}
