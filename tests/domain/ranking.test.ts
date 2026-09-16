import { describe, expect, it } from "vitest";
import {
  assertValidWeights,
  DEFAULT_RANKING_WEIGHTS,
  rankCandidates,
  RankingConfigError,
  type RankingCandidate,
  type RankingOptions,
  scoreCandidate,
} from "../../src/domain/ranking";

const OPTIONS: RankingOptions = {
  weights: DEFAULT_RANKING_WEIGHTS,
  waitNormalizationHours: 72,
  starvationGuardHours: 24,
  disputePenaltyThreshold: 0.15,
  disputePenaltyMinAssignments: 10,
};

function candidate(accountId: string, overrides: Partial<RankingCandidate> = {}): RankingCandidate {
  return {
    accountId,
    hoursSinceLastAssignment: 6,
    contactRate: 0.5,
    balanceRemaining: 10,
    balanceIssued: 20,
    volumePurchased: 50,
    upheldDisputes: 0,
    assignmentsForDisputeRate: 20,
    ...overrides,
  };
}

const order = (ranked: Array<{ candidate: RankingCandidate }>) => ranked.map((r) => r.candidate.accountId);

describe("ranking weights", () => {
  it("defaults to 40 / 30 / 20 / 10", () => {
    expect(DEFAULT_RANKING_WEIGHTS).toEqual({ waitingLongest: 40, contactRate: 30, balanceRemaining: 20, volumePurchased: 10 });
    expect(() => assertValidWeights(DEFAULT_RANKING_WEIGHTS)).not.toThrow();
  });

  it.each([
    [{ waitingLongest: 40, contactRate: 30, balanceRemaining: 20, volumePurchased: 11 }, /add up to 100 \(currently 101\)/],
    [{ waitingLongest: 40, contactRate: 30, balanceRemaining: 20, volumePurchased: 9 }, /add up to 100 \(currently 99\)/],
    [{ waitingLongest: 0, contactRate: 0, balanceRemaining: 0, volumePurchased: 0 }, /add up to 100/],
    [{ waitingLongest: 110, contactRate: -10, balanceRemaining: 0, volumePurchased: 0 }, /between 0 and 100/],
    [{ waitingLongest: 40.5, contactRate: 29.5, balanceRemaining: 20, volumePurchased: 10 }, /whole number/],
  ])("rejects %j", (weights, message) => {
    expect(() => assertValidWeights(weights)).toThrow(RankingConfigError);
    expect(() => assertValidWeights(weights)).toThrow(message);
  });

  it("accepts any whole-number split that sums to 100", () => {
    expect(() => assertValidWeights({ waitingLongest: 100, contactRate: 0, balanceRemaining: 0, volumePurchased: 0 })).not.toThrow();
    expect(() => assertValidWeights({ waitingLongest: 25, contactRate: 25, balanceRemaining: 25, volumePurchased: 25 })).not.toThrow();
  });
});

describe("score components", () => {
  it("normalises each component to 0–1 and weights it", () => {
    const score = scoreCandidate(
      candidate("a", { hoursSinceLastAssignment: 36, contactRate: 0.8, balanceRemaining: 5, balanceIssued: 10, volumePurchased: 50 }),
      100,
      OPTIONS,
    );
    const points = Object.fromEntries(score.parts.map((p) => [p.key, p.points]));
    expect(points).toEqual({ waitingLongest: 20, contactRate: 24, balanceRemaining: 10, volumePurchased: 5 });
    expect(score.total).toBe(59);
    expect(score.parts.map((p) => p.max)).toEqual([40, 30, 20, 10]);
    expect(score.parts.find((p) => p.key === "contactRate")?.component).toBe(0.8);
  });

  it("treats never-assigned as a full wait and no contact history as neutral 0.5", () => {
    const score = scoreCandidate(
      candidate("new", { hoursSinceLastAssignment: null, contactRate: null, balanceRemaining: 0, balanceIssued: 0, volumePurchased: 0 }),
      0,
      OPTIONS,
    );
    const points = Object.fromEntries(score.parts.map((p) => [p.key, p.points]));
    expect(points).toEqual({ waitingLongest: 40, contactRate: 15, balanceRemaining: 0, volumePurchased: 0 });
    expect(score.total).toBe(55);
    expect(score.starved).toBe(true);
    expect(score.tier).toBe(0);
  });

  it("clamps out-of-range inputs (a very long wait, a rate above 1)", () => {
    const score = scoreCandidate(candidate("a", { hoursSinceLastAssignment: 500, contactRate: 1.7, balanceRemaining: 30, balanceIssued: 10 }), 50, OPTIONS);
    expect(score.total).toBe(100);
    for (const part of score.parts) expect(part.points).toBe(part.max);
  });

  it("the parts add up to the total", () => {
    const score = scoreCandidate(candidate("a", { hoursSinceLastAssignment: 10, contactRate: 0.33 }), 80, OPTIONS);
    const sum = score.parts.reduce((s, p) => s + p.points, 0);
    expect(Math.abs(sum - score.total)).toBeLessThanOrEqual(0.2);
  });
});

describe("ordering tiers", () => {
  it("starvation guard: a starved low-score account outranks a high-score account served recently", () => {
    const starved = candidate("starved", { hoursSinceLastAssignment: 30, contactRate: 0, balanceRemaining: 0, balanceIssued: 10, volumePurchased: 1 });
    const star = candidate("star", { hoursSinceLastAssignment: 2, contactRate: 1, balanceRemaining: 10, balanceIssued: 10, volumePurchased: 100 });
    const ranked = rankCandidates([star, starved], OPTIONS);
    expect(ranked[0].score.total).toBeLessThan(ranked[1].score.total);
    expect(order(ranked)).toEqual(["starved", "star"]);
    expect(ranked[0].score.tier).toBe(0);
    expect(ranked[1].score.tier).toBe(1);
  });

  it("the guard starts exactly at starvationGuardHours", () => {
    expect(scoreCandidate(candidate("a", { hoursSinceLastAssignment: 24 }), 50, OPTIONS).starved).toBe(true);
    expect(scoreCandidate(candidate("a", { hoursSinceLastAssignment: 23.99 }), 50, OPTIONS).starved).toBe(false);
  });

  it("inside the starvation tier the longest wait wins, whatever the score", () => {
    const longWaitLowScore = candidate("long", { hoursSinceLastAssignment: 48, contactRate: 0, balanceRemaining: 0 });
    const shortWaitHighScore = candidate("short", { hoursSinceLastAssignment: 30, contactRate: 1, balanceRemaining: 20, volumePurchased: 100 });
    expect(order(rankCandidates([shortWaitHighScore, longWaitLowScore], OPTIONS))).toEqual(["long", "short"]);
  });

  it("never-assigned accounts rank first", () => {
    const veteran = candidate("veteran", { hoursSinceLastAssignment: 400, contactRate: 1, volumePurchased: 100 });
    const recent = candidate("recent", { hoursSinceLastAssignment: 1, contactRate: 1, volumePurchased: 100 });
    const brandNew = candidate("brand-new", { hoursSinceLastAssignment: null, contactRate: null, volumePurchased: 10, balanceRemaining: 1 });
    expect(order(rankCandidates([recent, veteran, brandNew], OPTIONS))).toEqual(["brand-new", "veteran", "recent"]);
  });

  it("dispute penalty ranks an account last even if it would otherwise lead (and overrides the starvation guard)", () => {
    const penalised = candidate("penalised", {
      hoursSinceLastAssignment: null,
      contactRate: 1,
      volumePurchased: 100,
      upheldDisputes: 5,
      assignmentsForDisputeRate: 20, // 25% upheld > 15%
    });
    const ordinary = candidate("ordinary", { hoursSinceLastAssignment: 1, contactRate: 0.1, volumePurchased: 1, balanceRemaining: 1 });
    const ranked = rankCandidates([penalised, ordinary], OPTIONS);
    expect(order(ranked)).toEqual(["ordinary", "penalised"]);
    expect(ranked[1].score).toMatchObject({ tier: 2, penalized: true, starved: false });
  });

  it("does not penalise below the minimum assignment count or at exactly the threshold", () => {
    const fewAssignments = scoreCandidate(candidate("a", { upheldDisputes: 3, assignmentsForDisputeRate: 5 }), 50, OPTIONS);
    expect(fewAssignments.penalized).toBe(false);
    const atThreshold = scoreCandidate(candidate("b", { upheldDisputes: 3, assignmentsForDisputeRate: 20 }), 50, OPTIONS); // exactly 15%
    expect(atThreshold.penalized).toBe(false);
    const above = scoreCandidate(candidate("c", { upheldDisputes: 4, assignmentsForDisputeRate: 20 }), 50, OPTIONS);
    expect(above.penalized).toBe(true);
  });

  it("higher score first inside the normal tier; equal scores fall back to longest wait, then account id", () => {
    const contactOnly: RankingOptions = { ...OPTIONS, weights: { waitingLongest: 0, contactRate: 100, balanceRemaining: 0, volumePurchased: 0 } };
    const a = candidate("a", { hoursSinceLastAssignment: 10, contactRate: 0.5 });
    const b = candidate("b", { hoursSinceLastAssignment: 20, contactRate: 0.5 });
    const c = candidate("c", { hoursSinceLastAssignment: 5, contactRate: 0.9 });
    expect(order(rankCandidates([a, b, c], contactOnly))).toEqual(["c", "b", "a"]);
  });

  it("is deterministic: identical candidates are ordered by account id regardless of input order", () => {
    const twins = ["m", "b", "z", "a"].map((id) => candidate(id));
    const expected = ["a", "b", "m", "z"];
    expect(order(rankCandidates(twins, OPTIONS))).toEqual(expected);
    expect(order(rankCandidates([...twins].reverse(), OPTIONS))).toEqual(expected);
    const neverAssigned = ["y", "x"].map((id) => candidate(id, { hoursSinceLastAssignment: null }));
    expect(order(rankCandidates(neverAssigned, OPTIONS))).toEqual(["x", "y"]);
  });

  it("assigns 1-based positions in rank order", () => {
    const ranked = rankCandidates([candidate("b"), candidate("a"), candidate("c")], OPTIONS);
    expect(ranked.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it("changing the weights changes the order", () => {
    const responsive = candidate("responsive", { hoursSinceLastAssignment: 20, contactRate: 1 });
    const waiting = candidate("waiting", { hoursSinceLastAssignment: 23, contactRate: 0 });
    expect(order(rankCandidates([waiting, responsive], OPTIONS))).toEqual(["responsive", "waiting"]);
    const waitOnly: RankingOptions = { ...OPTIONS, weights: { waitingLongest: 100, contactRate: 0, balanceRemaining: 0, volumePurchased: 0 } };
    expect(order(rankCandidates([waiting, responsive], waitOnly))).toEqual(["waiting", "responsive"]);
  });

  it("volume is relative to the biggest buyer among the candidates", () => {
    const big = candidate("big", { volumePurchased: 200 });
    const small = candidate("small", { volumePurchased: 50 });
    const ranked = rankCandidates([small, big], OPTIONS);
    const volumePoints = (id: string) => ranked.find((r) => r.candidate.accountId === id)!.score.parts.find((p) => p.key === "volumePurchased")!.points;
    expect(volumePoints("big")).toBe(10);
    expect(volumePoints("small")).toBe(2.5);
  });
});
