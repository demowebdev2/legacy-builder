import { describe, expect, it } from "vitest";
import { evaluateEligibility, hardRuleKeys } from "../../convex/distribution/eligibility";
import { type CandidateSnapshot, ELIGIBILITY_RULES, type EligibilityLead, type RuleContext } from "../../convex/distribution/rules";
import { DAY, HOUR } from "../../src/domain/time";

/**
 * The eligibility rules are pure functions over a pre-loaded snapshot, so they are tested here without a
 * database. 18:00 UTC on 16 Sep 2026 is 14:00 in New York (EDT) and 13:00 in Chicago (CDT).
 */
const NOW = Date.UTC(2026, 8, 16, 18, 0, 0);
const CTX: RuleContext = { now: NOW, holdOnDeclinedPurchase: true };

const LIFE_GA: EligibilityLead = { state: "GA", coverageType: "life", leadType: "standard", requiresTpmo: false };
const MEDICARE_GA: EligibilityLead = { state: "GA", coverageType: "medicare", leadType: "standard", requiresTpmo: true };
const EXCLUSIVE_LIFE_GA: EligibilityLead = { ...LIFE_GA, leadType: "exclusive" };

type SnapshotOverrides = Omit<Partial<CandidateSnapshot>, "preferences"> & {
  preferences?: Partial<NonNullable<CandidateSnapshot["preferences"]>> | null;
};

function snapshot(overrides: SnapshotOverrides = {}): CandidateSnapshot {
  const { preferences, ...rest } = overrides;
  return {
    accountId: "acc_1",
    name: "Alicia Reyes",
    type: "individual",
    status: "active",
    timezone: "America/New_York",
    qualityHold: false,
    declinedPurchaseOutstanding: false,
    lastAssignedAt: NOW - 3 * HOUR,
    preferences:
      preferences === null
        ? null
        : {
            states: ["GA", "FL"],
            coverageTypes: ["life", "medicare"],
            dailyPace: 5,
            receivingStartHour: 8,
            receivingEndHour: 20,
            paused: false,
            pausedUntil: null,
            ...preferences,
          },
    licenseForState: { verificationStatus: "verified", expiresAt: NOW + 200 * DAY },
    eoPolicy: { verificationStatus: "verified", expiresAt: NOW + 200 * DAY },
    tpmoApproved: false,
    balance: { exclusive: 2, standard: 8 },
    assignedToday: 0,
    alreadyHoldsLead: false,
    activeVerifiedSeats: 0,
    ...rest,
  };
}

const evaluate = (s: CandidateSnapshot, lead = LIFE_GA, ctx = CTX, shortCircuit = true) =>
  evaluateEligibility(s, lead, ctx, { shortCircuit });

function expectFailure(s: CandidateSnapshot, ruleKey: string, lead = LIFE_GA, ctx = CTX) {
  const result = evaluate(s, lead, ctx);
  expect(result.eligible).toBe(false);
  expect(result.failedRule?.key).toBe(ruleKey);
  return result;
}

function expectPass(s: CandidateSnapshot, lead = LIFE_GA, ctx = CTX) {
  const result = evaluate(s, lead, ctx);
  expect(result.failedRule, JSON.stringify(result.failedRule)).toBeUndefined();
  expect(result.eligible).toBe(true);
  return result;
}

describe("rule registry", () => {
  it("evaluates the rules in the documented order (county targeting is not registered)", () => {
    expect(ELIGIBILITY_RULES.map((r) => r.key)).toEqual([
      "account_status",
      "declined_purchase",
      "not_paused",
      "state_preference",
      "state_license",
      "eo_cover",
      "coverage_preference",
      "medicare_tpmo",
      "balance",
      "daily_pace",
      "receiving_hours",
      "not_already_holding",
      "quality_hold",
      "agency_seat",
    ]);
  });

  it("marks the legal / financial rules as hard (never overridable, even manually)", () => {
    expect(hardRuleKeys().sort()).toEqual(["account_status", "balance", "eo_cover", "medicare_tpmo", "not_already_holding", "state_license"]);
  });

  it("a fully compliant account passes every rule with a full trace", () => {
    const result = expectPass(snapshot());
    expect(result.hardFailure).toBe(false);
    expect(result.trace).toHaveLength(ELIGIBILITY_RULES.length);
    expect(result.trace.every((t) => t.pass)).toBe(true);
    // Rules that do not apply are recorded as skipped, not silently dropped.
    expect(result.trace.find((t) => t.key === "medicare_tpmo")).toMatchObject({ pass: true, skipped: true });
    expect(result.trace.find((t) => t.key === "agency_seat")).toMatchObject({ pass: true, skipped: true });
  });
});

describe("rule 1 — account status", () => {
  it.each(["suspended", "blocked", "closed", "pending_verification", "rejected"])("a %s account is not eligible (hard)", (status) => {
    const result = expectFailure(snapshot({ status }), "account_status");
    expect(result.hardFailure).toBe(true);
  });
});

describe("rule 2 — declined purchase outstanding", () => {
  it("holds an account with an unresolved declined auto-reload when the setting is on", () => {
    const result = expectFailure(snapshot({ declinedPurchaseOutstanding: true }), "declined_purchase");
    expect(result.hardFailure).toBe(false);
  });

  it("does not hold it when holdOnDeclinedPurchase is off", () => {
    expectPass(snapshot({ declinedPurchaseOutstanding: true }), LIFE_GA, { ...CTX, holdOnDeclinedPurchase: false });
  });
});

describe("rule 3 — pause", () => {
  it("an open-ended pause blocks leads", () => {
    const result = expectFailure(snapshot({ preferences: { paused: true } }), "not_paused");
    expect(result.failedRule?.reason).toBe("Paused");
  });

  it("a pause that ends in the future blocks leads", () => {
    expectFailure(snapshot({ preferences: { paused: true, pausedUntil: NOW + DAY } }), "not_paused");
  });

  it("a pause whose end date has passed lapses automatically", () => {
    expectPass(snapshot({ preferences: { paused: true, pausedUntil: NOW - HOUR } }));
    expectPass(snapshot({ preferences: { paused: true, pausedUntil: NOW } }));
  });
});

describe("rules 4 & 7 — state and product preferences", () => {
  it("rejects a lead state the agent did not opt into", () => {
    const result = expectFailure(snapshot({ preferences: { states: ["FL"] } }), "state_preference");
    expect(result.failedRule?.reason).toBe("Does not take GA leads");
    expect(result.hardFailure).toBe(false);
  });

  it("rejects a product the agent does not take", () => {
    expectFailure(snapshot({ preferences: { coverageTypes: ["annuity"] } }), "coverage_preference");
  });

  it("an account without saved preferences receives nothing", () => {
    expectFailure(snapshot({ preferences: null }), "state_preference");
  });
});

describe("rule 5 — verified, unexpired licence in the lead state", () => {
  it("fails when no licence for the state is on file", () => {
    const result = expectFailure(snapshot({ licenseForState: null }), "state_license");
    expect(result.failedRule?.reason).toBe("No GA licence on file");
    expect(result.hardFailure).toBe(true);
  });

  it.each(["unverified", "failed", "expired"])("fails when the licence is %s", (verificationStatus) => {
    const result = expectFailure(snapshot({ licenseForState: { verificationStatus, expiresAt: NOW + 100 * DAY } }), "state_license");
    expect(result.failedRule?.reason).toBe(`GA licence is ${verificationStatus}`);
  });

  it("fails when a verified licence has passed its expiry date (including exactly now)", () => {
    expectFailure(snapshot({ licenseForState: { verificationStatus: "verified", expiresAt: NOW - DAY } }), "state_license");
    expectFailure(snapshot({ licenseForState: { verificationStatus: "verified", expiresAt: NOW } }), "state_license");
    expectPass(snapshot({ licenseForState: { verificationStatus: "verified", expiresAt: NOW + 1 } }));
  });
});

describe("rule 6 — E&O cover", () => {
  it("fails with no policy on file", () => {
    const result = expectFailure(snapshot({ eoPolicy: null }), "eo_cover");
    expect(result.hardFailure).toBe(true);
  });

  it("fails when the policy has expired", () => {
    const result = expectFailure(snapshot({ eoPolicy: { verificationStatus: "verified", expiresAt: NOW - DAY } }), "eo_cover");
    expect(result.failedRule?.reason).toMatch(/^E&O expired/);
  });

  it("fails when the evidence failed review", () => {
    expectFailure(snapshot({ eoPolicy: { verificationStatus: "failed", expiresAt: NOW + DAY } }), "eo_cover");
  });
});

describe("rule 8 — Medicare TPMO", () => {
  it("a Medicare lead requires TPMO approval", () => {
    const result = expectFailure(snapshot({ tpmoApproved: false }), "medicare_tpmo", MEDICARE_GA);
    expect(result.hardFailure).toBe(true);
    expectPass(snapshot({ tpmoApproved: true }), MEDICARE_GA);
  });

  it("TPMO is not required for non-Medicare leads", () => {
    const result = expectPass(snapshot({ tpmoApproved: false }), LIFE_GA);
    expect(result.trace.find((t) => t.key === "medicare_tpmo")?.skipped).toBe(true);
  });
});

describe("rule 9 — balance of the lead's type", () => {
  it("a standard lead needs a standard lead in the balance (exclusive leads do not count)", () => {
    const result = expectFailure(snapshot({ balance: { exclusive: 5, standard: 0 } }), "balance");
    expect(result.failedRule?.reason).toBe("0 standard leads left");
    expect(result.hardFailure).toBe(true);
  });

  it("an exclusive lead needs an exclusive lead in the balance (standard leads do not count)", () => {
    expectFailure(snapshot({ balance: { exclusive: 0, standard: 50 } }), "balance", EXCLUSIVE_LIFE_GA);
    expectPass(snapshot({ balance: { exclusive: 1, standard: 0 } }), EXCLUSIVE_LIFE_GA);
  });
});

describe("rule 10 — daily pace", () => {
  it("stops at the pace and allows one below it", () => {
    expectFailure(snapshot({ assignedToday: 5, preferences: { dailyPace: 5 } }), "daily_pace");
    expectFailure(snapshot({ assignedToday: 9, preferences: { dailyPace: 5 } }), "daily_pace");
    expectPass(snapshot({ assignedToday: 4, preferences: { dailyPace: 5 } }));
  });
});

describe("rule 11 — receiving hours in the account's own timezone", () => {
  const window = { receivingStartHour: 14, receivingEndHour: 20 };

  it("14:00 in New York is inside a 14–20 window", () => {
    expectPass(snapshot({ timezone: "America/New_York", preferences: window }));
  });

  it("the same instant is 13:00 in Chicago — outside the window", () => {
    const result = expectFailure(snapshot({ timezone: "America/Chicago", preferences: window }), "receiving_hours");
    expect(result.failedRule?.reason).toBe("Outside 14:00–20:00 window");
  });

  it("the end hour is exclusive", () => {
    expectFailure(snapshot({ preferences: { receivingStartHour: 8, receivingEndHour: 14 } }), "receiving_hours");
  });

  it("a 0–24 window accepts every hour", () => {
    for (let h = 0; h < 24; h++) {
      const at = Date.UTC(2026, 8, 16, h, 30, 0);
      expectPass(snapshot({ preferences: { receivingStartHour: 0, receivingEndHour: 24 } }), LIFE_GA, { ...CTX, now: at });
    }
  });
});

describe("rules 12–14", () => {
  it("never releases the same lead twice to one account (hard)", () => {
    const result = expectFailure(snapshot({ alreadyHoldsLead: true }), "not_already_holding");
    expect(result.hardFailure).toBe(true);
  });

  it("a quality hold blocks distribution (soft)", () => {
    const result = expectFailure(snapshot({ qualityHold: true }), "quality_hold");
    expect(result.hardFailure).toBe(false);
  });

  it("an agency needs at least one active verified seat", () => {
    expectFailure(snapshot({ type: "agency", activeVerifiedSeats: 0 }), "agency_seat");
    expectPass(snapshot({ type: "agency", activeVerifiedSeats: 1 }));
  });

  it("the seat rule does not apply to individual agents", () => {
    const result = expectPass(snapshot({ type: "individual", activeVerifiedSeats: 0 }));
    expect(result.trace.find((t) => t.key === "agency_seat")?.skipped).toBe(true);
  });
});

describe("short-circuit vs full evaluation", () => {
  const broken = snapshot({ status: "suspended", licenseForState: null, balance: { exclusive: 0, standard: 0 }, qualityHold: true });

  it("the engine stops at the first failure", () => {
    const result = evaluate(broken, LIFE_GA, CTX, true);
    expect(result.trace).toHaveLength(1);
    expect(result.failedRule?.key).toBe("account_status");
  });

  it("full evaluation records every rule and every failure, reporting the first as failedRule", () => {
    const result = evaluate(broken, LIFE_GA, CTX, false);
    expect(result.trace).toHaveLength(ELIGIBILITY_RULES.length);
    expect(result.trace.filter((t) => !t.pass).map((t) => t.key)).toEqual(["account_status", "state_license", "balance", "quality_hold"]);
    expect(result.failedRule?.key).toBe("account_status");
    expect(result.hardFailure).toBe(true);
  });

  it("hardFailure is false when only soft rules (preferences / holds) fail", () => {
    const softOnly = snapshot({ preferences: { paused: true, states: ["FL"] }, qualityHold: true, assignedToday: 99 });
    const result = evaluate(softOnly, LIFE_GA, CTX, false);
    expect(result.eligible).toBe(false);
    expect(result.hardFailure).toBe(false);
    expect(result.trace.filter((t) => !t.pass).map((t) => t.key)).toEqual(["not_paused", "state_preference", "daily_pace", "quality_hold"]);
  });

  it("hardFailure is true when a hard rule fails after a soft one — only visible with full evaluation", () => {
    const mixed = snapshot({ preferences: { paused: true }, licenseForState: null });
    const full = evaluate(mixed, LIFE_GA, CTX, false);
    expect(full.failedRule?.key).toBe("not_paused");
    expect(full.hardFailure).toBe(true);
    // Short-circuit stops at the soft failure; this is why manual assignment evaluates every rule.
    const short = evaluate(mixed, LIFE_GA, CTX, true);
    expect(short.hardFailure).toBe(false);
  });
});
