import type { EligibilityRule } from "./types";

/** Rule 8 — Medicare leads require a Third-Party Marketing Organization approval in force. */
export const tpmoRule: EligibilityRule = {
  key: "medicare_tpmo",
  label: "Medicare TPMO approval in force",
  hard: true,
  appliesTo: (l) => l.requiresTpmo,
  check: (a) => (a.tpmoApproved ? null : "No Medicare TPMO approval"),
};

/** Rule 9 — one lead of the right type must be available to draw down. */
export const balanceRule: EligibilityRule = {
  key: "balance",
  label: "Lead balance ≥ 1 of this type",
  hard: true,
  check: (a, l) => (a.balance[l.leadType] >= 1 ? null : `0 ${l.leadType} leads left`),
};

/** Rule 12 — never release the same lead to the same account twice (including after a revocation). */
export const notAlreadyHoldingRule: EligibilityRule = {
  key: "not_already_holding",
  label: "Not already released this lead",
  hard: true,
  check: (a) => (a.alreadyHoldsLead ? "Already received this lead" : null),
};
