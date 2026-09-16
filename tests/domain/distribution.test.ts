import { describe, expect, it } from "vitest";
import {
  assertValidDistributionSettings,
  DEFAULT_DISTRIBUTION_SETTINGS,
  DistributionConfigError,
  type DistributionSettings,
  disputeDeadline,
  gradeForSequence,
  isWithinDisputeWindow,
  mergeDistributionSettings,
  recipientTarget,
  retryAt,
} from "../../src/domain/distribution";
import { RankingConfigError } from "../../src/domain/ranking";
import { HOUR, MINUTE } from "../../src/domain/time";

const settings = (overrides: Partial<DistributionSettings> = {}): DistributionSettings => ({ ...DEFAULT_DISTRIBUTION_SETTINGS, ...overrides });

describe("recipient target", () => {
  it("an exclusive lead always goes to exactly one account", () => {
    expect(recipientTarget("exclusive", { standardRecipientCount: 3 })).toBe(1);
    expect(recipientTarget("exclusive", { standardRecipientCount: 10 })).toBe(1);
  });

  it("a standard lead goes to the configured count, default 3 (BD-2)", () => {
    expect(DEFAULT_DISTRIBUTION_SETTINGS.standardRecipientCount).toBe(3);
    expect(recipientTarget("standard", DEFAULT_DISTRIBUTION_SETTINGS)).toBe(3);
    expect(recipientTarget("standard", { standardRecipientCount: 1 })).toBe(1);
    expect(recipientTarget("standard", { standardRecipientCount: 5 })).toBe(5);
  });
});

describe("ratio grading", () => {
  it("every 5th captured lead is exclusive", () => {
    const grades = Array.from({ length: 10 }, (_, i) => gradeForSequence(i + 1, 5));
    expect(grades).toEqual(["standard", "standard", "standard", "standard", "exclusive", "standard", "standard", "standard", "standard", "exclusive"]);
  });

  it("yields 2 exclusive in every 10 and 20 in 100", () => {
    const count = (n: number) => Array.from({ length: n }, (_, i) => gradeForSequence(i + 1, 5)).filter((g) => g === "exclusive").length;
    expect(count(10)).toBe(2);
    expect(count(100)).toBe(20);
  });

  it("never grades a non-positive sequence exclusive and honours a custom ratio", () => {
    expect(gradeForSequence(0, 5)).toBe("standard");
    expect(gradeForSequence(-5, 5)).toBe("standard");
    expect(gradeForSequence(3, 3)).toBe("exclusive");
    expect(gradeForSequence(1, 1)).toBe("exclusive");
  });
});

describe("retry ladder", () => {
  const base = Date.UTC(2026, 8, 16, 12, 0, 0);
  const ladder = DEFAULT_DISTRIBUTION_SETTINGS.retryScheduleMinutes;

  it("defaults to 5, 15, 60, 240, 720, 1440 minutes", () => {
    expect(ladder).toEqual([5, 15, 60, 240, 720, 1440]);
    expect(DEFAULT_DISTRIBUTION_SETTINGS.adminAlertAfterMinutes).toBe(120);
    expect(DEFAULT_DISTRIBUTION_SETTINGS.unassignableAfterMinutes).toBe(2880);
  });

  it("measures each attempt from capture, not from the previous attempt", () => {
    expect(retryAt(base, 1, ladder)).toBe(base + 5 * MINUTE);
    expect(retryAt(base, 2, ladder)).toBe(base + 15 * MINUTE);
    expect(retryAt(base, 3, ladder)).toBe(base + 60 * MINUTE);
    expect(retryAt(base, 6, ladder)).toBe(base + 24 * HOUR);
  });

  it("returns null once the ladder is exhausted (or for attempt 0)", () => {
    expect(retryAt(base, 7, ladder)).toBeNull();
    expect(retryAt(base, 0, ladder)).toBeNull();
  });
});

describe("dispute window", () => {
  const assignedAt = Date.UTC(2026, 8, 1, 9, 30, 0);

  it("closes 72 hours after release by default (D18)", () => {
    expect(DEFAULT_DISTRIBUTION_SETTINGS.disputeWindowHours).toBe(72);
    expect(disputeDeadline(assignedAt, 72)).toBe(assignedAt + 72 * HOUR);
  });

  it("is open at 71h59m and exactly at 72h, closed at 72h01m", () => {
    expect(isWithinDisputeWindow(assignedAt, assignedAt + 71 * HOUR + 59 * MINUTE, 72)).toBe(true);
    expect(isWithinDisputeWindow(assignedAt, assignedAt + 72 * HOUR, 72)).toBe(true);
    expect(isWithinDisputeWindow(assignedAt, assignedAt + 72 * HOUR + MINUTE, 72)).toBe(false);
    expect(isWithinDisputeWindow(assignedAt, assignedAt + 30 * 24 * HOUR, 72)).toBe(false);
  });

  it("is open at release and not before it", () => {
    expect(isWithinDisputeWindow(assignedAt, assignedAt, 72)).toBe(true);
    expect(isWithinDisputeWindow(assignedAt, assignedAt - 1, 72)).toBe(false);
  });

  it("follows a configured window", () => {
    expect(isWithinDisputeWindow(assignedAt, assignedAt + 47 * HOUR, 48)).toBe(true);
    expect(isWithinDisputeWindow(assignedAt, assignedAt + 49 * HOUR, 48)).toBe(false);
  });
});

describe("distribution settings validation", () => {
  it("accepts the defaults", () => {
    expect(() => assertValidDistributionSettings(DEFAULT_DISTRIBUTION_SETTINGS)).not.toThrow();
  });

  it.each<[string, Partial<DistributionSettings>, RegExp]>([
    ["retry steps that repeat", { retryScheduleMinutes: [5, 5, 60] }, /must increase/],
    ["retry steps that go backwards", { retryScheduleMinutes: [15, 5] }, /must increase/],
    ["an empty retry ladder", { retryScheduleMinutes: [] }, /Retry steps/],
    ["a zero-minute retry", { retryScheduleMinutes: [0, 5] }, /Retry steps/],
    ["a fractional retry", { retryScheduleMinutes: [2.5, 5] }, /Retry steps/],
    ["a retry beyond a week", { retryScheduleMinutes: [5, 10_081] }, /Retry steps/],
    ["zero standard recipients", { standardRecipientCount: 0 }, /recipient count/],
    ["eleven standard recipients", { standardRecipientCount: 11 }, /recipient count/],
    ["unassignable before the admin alert", { adminAlertAfterMinutes: 3000, unassignableAfterMinutes: 2880 }, /after the admin alert/],
    ["unassignable equal to the admin alert", { adminAlertAfterMinutes: 120, unassignableAfterMinutes: 120 }, /after the admin alert/],
    ["a zero dispute window", { disputeWindowHours: 0 }, /Dispute window/],
    ["a zero starvation guard", { starvationGuardHours: 0 }, /Starvation guard/],
    ["a penalty threshold of 0", { disputePenaltyThreshold: 0 }, /threshold/],
    ["a penalty threshold of 1", { disputePenaltyThreshold: 1 }, /threshold/],
    ["a zero grading ratio", { exclusiveEvery: 0 }, /grading ratio/],
    ["a negative dedup window", { dedupWindowDays: -1 }, /Deduplication/],
  ])("rejects %s", (_label, overrides, message) => {
    expect(() => assertValidDistributionSettings(settings(overrides))).toThrow(DistributionConfigError);
    expect(() => assertValidDistributionSettings(settings(overrides))).toThrow(message);
  });

  it("rejects weights that do not sum to 100", () => {
    const bad = settings({ weights: { waitingLongest: 50, contactRate: 30, balanceRemaining: 20, volumePurchased: 10 } });
    expect(() => assertValidDistributionSettings(bad)).toThrow(RankingConfigError);
  });

  it("merges a partial stored version over the defaults, including nested weights", () => {
    expect(mergeDistributionSettings(null)).toEqual(DEFAULT_DISTRIBUTION_SETTINGS);
    const merged = mergeDistributionSettings({
      standardRecipientCount: 2,
      weights: { waitingLongest: 70 } as DistributionSettings["weights"],
    });
    expect(merged.standardRecipientCount).toBe(2);
    expect(merged.weights).toEqual({ waitingLongest: 70, contactRate: 30, balanceRemaining: 20, volumePurchased: 10 });
    expect(merged.retryScheduleMinutes).toEqual(DEFAULT_DISTRIBUTION_SETTINGS.retryScheduleMinutes);
  });
});
