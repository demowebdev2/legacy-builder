import { isWithinReceivingHours } from "../../../src/domain/time";
import type { EligibilityRule } from "./types";

/** Rule 4 — the agent opted in to the lead's state. */
export const statePreferenceRule: EligibilityRule = {
  key: "state_preference",
  label: "Lead state in preferences",
  hard: false,
  check: (a, l) => {
    if (!a.preferences) return "No lead preferences saved";
    return a.preferences.states.includes(l.state) ? null : `Does not take ${l.state} leads`;
  },
};

/** Rule 7 — the agent takes this coverage type. */
export const coveragePreferenceRule: EligibilityRule = {
  key: "coverage_preference",
  label: "Product in preferences",
  hard: false,
  check: (a, l) => {
    if (!a.preferences) return "No lead preferences saved";
    return a.preferences.coverageTypes.includes(l.coverageType) ? null : `Does not take ${l.coverageType} leads`;
  },
};

/** Rule 10 — daily pace (counted in the account's own timezone day). */
export const dailyPaceRule: EligibilityRule = {
  key: "daily_pace",
  label: "Daily pace not reached",
  hard: false,
  check: (a) => {
    if (!a.preferences) return "No lead preferences saved";
    return a.assignedToday < a.preferences.dailyPace ? null : `Daily pace of ${a.preferences.dailyPace} reached`;
  },
};

/** Rule 11 — receiving hours in the account's timezone. */
export const receivingHoursRule: EligibilityRule = {
  key: "receiving_hours",
  label: "Inside receiving hours",
  hard: false,
  check: (a, _l, ctx) => {
    const p = a.preferences;
    if (!p) return "No lead preferences saved";
    return isWithinReceivingHours(ctx.now, a.timezone, p.receivingStartHour, p.receivingEndHour)
      ? null
      : `Outside ${p.receivingStartHour}:00–${p.receivingEndHour}:00 window`;
  },
};
