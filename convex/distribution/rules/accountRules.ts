import { formatDate } from "../../../src/domain/format";
import { statusBadge } from "../../../src/domain/status";
import type { EligibilityRule } from "./types";

/** Rule 1 — only active accounts receive leads (blocked/suspended balances are frozen, not forfeited). */
export const accountStatusRule: EligibilityRule = {
  key: "account_status",
  label: "Account status is active",
  hard: true,
  check: (a) => (a.status === "active" ? null : `Status is ${statusBadge(a.status)[1].toLowerCase()}`),
};

/** Rule 2 — prototype filter "No failed charge outstanding"; configurable (holdOnDeclinedPurchase). */
export const declinedPurchaseRule: EligibilityRule = {
  key: "declined_purchase",
  label: "No declined purchase outstanding",
  hard: false,
  check: (a, _l, ctx) =>
    ctx.holdOnDeclinedPurchase && a.declinedPurchaseOutstanding ? "Last auto-reload was declined — awaiting a retry" : null,
};

/** Rule 3 — agent pause; a pause with a passed end date lapses automatically. */
export const notPausedRule: EligibilityRule = {
  key: "not_paused",
  label: "Not manually paused",
  hard: false,
  check: (a, _l, ctx) => {
    const p = a.preferences;
    if (!p?.paused) return null;
    if (p.pausedUntil != null && p.pausedUntil <= ctx.now) return null;
    return p.pausedUntil ? `Paused until ${formatDate(p.pausedUntil)}` : "Paused";
  },
};

/** Rule 13 — admin quality hold. */
export const qualityHoldRule: EligibilityRule = {
  key: "quality_hold",
  label: "No distribution hold",
  hard: false,
  check: (a) => (a.qualityHold ? "Quality hold in place" : null),
};

/** Rule 14 — an agency needs someone verified to work the lead. */
export const agencySeatRule: EligibilityRule = {
  key: "agency_seat",
  label: "Agency has an active verified seat",
  hard: false,
  appliesTo: (_l, a) => a.type === "agency",
  check: (a) => (a.activeVerifiedSeats > 0 ? null : "No active verified producer seat"),
};
