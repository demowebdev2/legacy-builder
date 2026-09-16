import { EXCLUSIVE_RECIPIENT_COUNT, type LeadType } from "./constants";
import { assertValidWeights, DEFAULT_RANKING_WEIGHTS, type RankingWeights } from "./ranking";
import { HOUR, MINUTE } from "./time";

/**
 * Configurable distribution settings. Stored as versioned rows in Convex (`distributionSettings`);
 * these defaults seed the first version and fill any field missing from older versions.
 */
export interface DistributionSettings {
  engineEnabled: boolean;
  weights: RankingWeights;
  /** BD-2: how many accounts receive a standard lead. Exclusive is fixed at 1. */
  standardRecipientCount: number;
  retryScheduleMinutes: number[];
  adminAlertAfterMinutes: number;
  unassignableAfterMinutes: number;
  disputeWindowHours: number;
  starvationGuardHours: number;
  waitNormalizationHours: number;
  /** Prototype filter 2: hold distribution while an auto-reload decline is unresolved. */
  holdOnDeclinedPurchase: boolean;
  disputePenaltyThreshold: number;
  disputePenaltyMinAssignments: number;
  contactRateWindowDays: number;
  gradingMode: "ratio" | "source";
  /** Ratio grading: every Nth captured lead is exclusive (2 in 10 → 5). */
  exclusiveEvery: number;
  dedupWindowDays: number;
  dedupMatchPhone: boolean;
  dedupMatchEmail: boolean;
  dedupSameCoverageOnly: boolean;
}

export const DEFAULT_DISTRIBUTION_SETTINGS: DistributionSettings = {
  engineEnabled: true,
  weights: DEFAULT_RANKING_WEIGHTS,
  standardRecipientCount: 3,
  retryScheduleMinutes: [5, 15, 60, 240, 720, 1440],
  adminAlertAfterMinutes: 120,
  unassignableAfterMinutes: 2880,
  disputeWindowHours: 72,
  starvationGuardHours: 24,
  waitNormalizationHours: 72,
  holdOnDeclinedPurchase: true,
  disputePenaltyThreshold: 0.15,
  disputePenaltyMinAssignments: 10,
  contactRateWindowDays: 90,
  gradingMode: "ratio",
  exclusiveEvery: 5,
  dedupWindowDays: 30,
  dedupMatchPhone: true,
  dedupMatchEmail: true,
  dedupSameCoverageOnly: true,
};

export class DistributionConfigError extends Error {}

const intIn = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

export function assertValidDistributionSettings(s: DistributionSettings): void {
  assertValidWeights(s.weights);
  if (!intIn(s.standardRecipientCount, 1, 10)) {
    throw new DistributionConfigError("Standard recipient count must be between 1 and 10.");
  }
  if (!s.retryScheduleMinutes.length || s.retryScheduleMinutes.some((m) => !intIn(m, 1, 10_080))) {
    throw new DistributionConfigError("Retry steps must be whole minutes between 1 and 10,080.");
  }
  for (let i = 1; i < s.retryScheduleMinutes.length; i++) {
    if (s.retryScheduleMinutes[i] <= s.retryScheduleMinutes[i - 1]) {
      throw new DistributionConfigError("Retry steps must increase.");
    }
  }
  if (!intIn(s.adminAlertAfterMinutes, 1, 10_080)) throw new DistributionConfigError("Admin alert timing is invalid.");
  if (!intIn(s.unassignableAfterMinutes, 60, 20_160) || s.unassignableAfterMinutes <= s.adminAlertAfterMinutes) {
    throw new DistributionConfigError("Unassignable timing must be after the admin alert.");
  }
  if (!intIn(s.disputeWindowHours, 1, 720)) throw new DistributionConfigError("Dispute window is invalid.");
  if (!intIn(s.starvationGuardHours, 1, 720)) throw new DistributionConfigError("Starvation guard is invalid.");
  if (!intIn(s.waitNormalizationHours, 1, 720)) throw new DistributionConfigError("Wait normalisation is invalid.");
  if (!(s.disputePenaltyThreshold > 0 && s.disputePenaltyThreshold < 1)) {
    throw new DistributionConfigError("Dispute penalty threshold must be between 0 and 1.");
  }
  if (!intIn(s.disputePenaltyMinAssignments, 0, 1000)) throw new DistributionConfigError("Penalty minimum is invalid.");
  if (!intIn(s.contactRateWindowDays, 1, 365)) throw new DistributionConfigError("Contact-rate window is invalid.");
  if (!intIn(s.exclusiveEvery, 1, 100)) throw new DistributionConfigError("Exclusive grading ratio is invalid.");
  if (!intIn(s.dedupWindowDays, 0, 365)) throw new DistributionConfigError("Deduplication window is invalid.");
}

export function recipientTarget(leadType: LeadType, settings: Pick<DistributionSettings, "standardRecipientCount">): number {
  return leadType === "exclusive" ? EXCLUSIVE_RECIPIENT_COUNT : settings.standardRecipientCount;
}

/** Ratio grading: the Nth, 2Nth, … captured lead is exclusive. `sequence` starts at 1. */
export function gradeForSequence(sequence: number, exclusiveEvery: number): LeadType {
  return sequence > 0 && sequence % exclusiveEvery === 0 ? "exclusive" : "standard";
}

/**
 * Retry ladder: returns the absolute time of retry `attempt` (1-based) or null when the ladder is
 * exhausted. Retries are measured from capture so a slow first run does not stretch the ladder.
 */
export function retryAt(capturedAt: number, attempt: number, scheduleMinutes: number[]): number | null {
  const minutes = scheduleMinutes[attempt - 1];
  return minutes == null ? null : capturedAt + minutes * MINUTE;
}

export function disputeDeadline(assignedAt: number, windowHours: number): number {
  return assignedAt + windowHours * HOUR;
}

export function isWithinDisputeWindow(assignedAt: number, now: number, windowHours: number): boolean {
  return now >= assignedAt && now <= disputeDeadline(assignedAt, windowHours);
}

export function mergeDistributionSettings(stored: Partial<DistributionSettings> | null | undefined): DistributionSettings {
  return {
    ...DEFAULT_DISTRIBUTION_SETTINGS,
    ...(stored ?? {}),
    weights: { ...DEFAULT_DISTRIBUTION_SETTINGS.weights, ...(stored?.weights ?? {}) },
  };
}
