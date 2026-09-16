import { accountStatusRule, agencySeatRule, declinedPurchaseRule, notPausedRule, qualityHoldRule } from "./accountRules";
import { eoCoverRule } from "./eoCover";
import { balanceRule, notAlreadyHoldingRule, tpmoRule } from "./leadRules";
import { coveragePreferenceRule, dailyPaceRule, receivingHoursRule, statePreferenceRule } from "./preferences";
import { stateLicenseRule } from "./stateLicense";
import type { EligibilityRule } from "./types";

export * from "./types";

/** Evaluation order. County targeting (prototype filter 12) is Phase 2 and intentionally absent. */
export const ELIGIBILITY_RULES: readonly EligibilityRule[] = [
  accountStatusRule,
  declinedPurchaseRule,
  notPausedRule,
  statePreferenceRule,
  stateLicenseRule,
  eoCoverRule,
  coveragePreferenceRule,
  tpmoRule,
  balanceRule,
  dailyPaceRule,
  receivingHoursRule,
  notAlreadyHoldingRule,
  qualityHoldRule,
  agencySeatRule,
];
