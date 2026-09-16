/**
 * Distribution ranking. Pure and deterministic so it can be unit-tested and replayed by the simulator.
 *
 * Score (0–100) = Σ weight × component, components normalised to 0–1:
 *   waitingLongest   hours since last release ÷ waitNormalizationHours (never released = 1)
 *   contactRate      contacted ÷ released over the contact-rate window (no history = 0.5 neutral)
 *   balanceRemaining remaining ÷ issued for the lead's type
 *   volumePurchased  leads purchased ÷ the most purchased by any candidate
 *
 * Ordering tiers protect fairness regardless of score:
 *   tier 0  starvation guard — waited ≥ starvationGuardHours (or never released); longest wait first
 *   tier 1  everyone else — highest score first
 *   tier 2  dispute penalty — upheld-dispute rate above threshold; still eligible, ranked last
 */

export interface RankingWeights {
  waitingLongest: number;
  contactRate: number;
  balanceRemaining: number;
  volumePurchased: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  waitingLongest: 40,
  contactRate: 30,
  balanceRemaining: 20,
  volumePurchased: 10,
};

export const RANKING_COMPONENTS: ReadonlyArray<{ key: keyof RankingWeights; label: string; help: string }> = [
  {
    key: "waitingLongest",
    label: "Waiting longest",
    help: "Time since the account last received a lead. The round-robin element.",
  },
  { key: "contactRate", label: "Contact rate", help: "Rewards agents who actually call back." },
  {
    key: "balanceRemaining",
    label: "Balance remaining",
    help: "Smooths burn so nobody empties a balance they just bought in three days.",
  },
  {
    key: "volumePurchased",
    label: "Volume purchased",
    help: "A small edge for the agents buying the most. Nobody can buy their way past a filter.",
  },
];

export class RankingConfigError extends Error {}

export function assertValidWeights(weights: RankingWeights): void {
  const values = Object.values(weights);
  if (values.some((v) => !Number.isInteger(v) || v < 0 || v > 100)) {
    throw new RankingConfigError("Each weight must be a whole number between 0 and 100.");
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum !== 100) throw new RankingConfigError(`Weights must add up to 100 (currently ${sum}).`);
}

export interface RankingOptions {
  weights: RankingWeights;
  waitNormalizationHours: number;
  starvationGuardHours: number;
  disputePenaltyThreshold: number;
  disputePenaltyMinAssignments: number;
}

export interface RankingCandidate {
  accountId: string;
  /** null = never received a lead */
  hoursSinceLastAssignment: number | null;
  /** 0–1, null = no history */
  contactRate: number | null;
  balanceRemaining: number;
  balanceIssued: number;
  volumePurchased: number;
  upheldDisputes: number;
  assignmentsForDisputeRate: number;
}

export interface ScorePart {
  key: keyof RankingWeights;
  label: string;
  component: number;
  points: number;
  max: number;
}

export interface CandidateScore {
  total: number;
  parts: ScorePart[];
  tier: 0 | 1 | 2;
  starved: boolean;
  penalized: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0);

export function scoreCandidate(c: RankingCandidate, maxVolume: number, options: RankingOptions): CandidateScore {
  const w = options.weights;
  const components: Record<keyof RankingWeights, number> = {
    waitingLongest:
      c.hoursSinceLastAssignment == null
        ? 1
        : clamp01(c.hoursSinceLastAssignment / Math.max(options.waitNormalizationHours, 1)),
    contactRate: c.contactRate == null ? 0.5 : clamp01(c.contactRate),
    balanceRemaining: c.balanceIssued > 0 ? clamp01(c.balanceRemaining / c.balanceIssued) : 0,
    volumePurchased: maxVolume > 0 ? clamp01(c.volumePurchased / maxVolume) : 0,
  };
  const parts: ScorePart[] = RANKING_COMPONENTS.map(({ key, label }) => ({
    key,
    label,
    component: round1(components[key] * 100) / 100,
    points: round1(components[key] * w[key]),
    max: w[key],
  }));
  const total = round1(RANKING_COMPONENTS.reduce((sum, { key }) => sum + components[key] * w[key], 0));
  const penalized =
    c.assignmentsForDisputeRate >= options.disputePenaltyMinAssignments &&
    c.assignmentsForDisputeRate > 0 &&
    c.upheldDisputes / c.assignmentsForDisputeRate > options.disputePenaltyThreshold;
  const starved =
    !penalized &&
    (c.hoursSinceLastAssignment == null || c.hoursSinceLastAssignment >= options.starvationGuardHours);
  return { total, parts, tier: penalized ? 2 : starved ? 0 : 1, starved, penalized };
}

export interface RankedCandidate<T extends RankingCandidate> {
  candidate: T;
  score: CandidateScore;
  position: number;
}

const waitedForSort = (c: RankingCandidate) =>
  c.hoursSinceLastAssignment == null ? Number.POSITIVE_INFINITY : c.hoursSinceLastAssignment;

export function rankCandidates<T extends RankingCandidate>(candidates: T[], options: RankingOptions): RankedCandidate<T>[] {
  const maxVolume = candidates.reduce((m, c) => Math.max(m, c.volumePurchased), 0);
  return candidates
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, maxVolume, options) }))
    .sort((a, b) => {
      if (a.score.tier !== b.score.tier) return a.score.tier - b.score.tier;
      if (a.score.tier === 0) {
        const byWait = waitedForSort(b.candidate) - waitedForSort(a.candidate);
        if (byWait !== 0 && !Number.isNaN(byWait)) return byWait;
      }
      if (a.score.total !== b.score.total) return b.score.total - a.score.total;
      const byWait = waitedForSort(b.candidate) - waitedForSort(a.candidate);
      if (byWait !== 0 && !Number.isNaN(byWait)) return byWait;
      return a.candidate.accountId < b.candidate.accountId ? -1 : a.candidate.accountId > b.candidate.accountId ? 1 : 0;
    })
    .map((r, i) => ({ ...r, position: i + 1 }));
}
