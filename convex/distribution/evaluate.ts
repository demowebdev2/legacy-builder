import type { DistributionSettings } from "../../src/domain/distribution";
import { type CandidateScore, rankCandidates } from "../../src/domain/ranking";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { activeHolders, buildRankingInput, buildSnapshot, coverageRequiresTpmo, loadCandidateAccounts, type RankingInput } from "./context";
import { type EligibilityResult, evaluateEligibility } from "./eligibility";
import type { CandidateSnapshot, EligibilityLead } from "./rules";

type Ctx = QueryCtx | MutationCtx;

export interface EvaluatedCandidate {
  account: Doc<"accounts">;
  snapshot: CandidateSnapshot;
  result: EligibilityResult;
  ranking?: { input: RankingInput; score: CandidateScore; position: number };
}

export interface LeadEvaluation {
  lead: EligibilityLead;
  evaluated: EvaluatedCandidate[];
  /** Eligible candidates in rank order. */
  ranked: EvaluatedCandidate[];
  truncated: boolean;
  activeAssignments: Doc<"leadAssignments">[];
}

export async function toEligibilityLead(
  ctx: Ctx,
  lead: Pick<Doc<"leads">, "state" | "coverageType" | "leadType">,
): Promise<EligibilityLead> {
  return {
    state: lead.state,
    coverageType: lead.coverageType,
    leadType: lead.leadType,
    requiresTpmo: await coverageRequiresTpmo(ctx, lead.coverageType),
  };
}

/** Shared by the live engine (mutation) and the simulator (query). Performs no writes. */
export async function evaluateLead(
  ctx: Ctx,
  lead: EligibilityLead,
  leadId: Id<"leads"> | null,
  now: number,
  settings: DistributionSettings,
  options: { shortCircuit?: boolean } = {},
): Promise<LeadEvaluation> {
  const { accounts, truncated } = await loadCandidateAccounts(ctx);
  const holders = await activeHolders(ctx, leadId);
  const ruleCtx = { now, holdOnDeclinedPurchase: settings.holdOnDeclinedPurchase };

  const evaluated: EvaluatedCandidate[] = [];
  for (const account of accounts) {
    const snapshot = await buildSnapshot(ctx, account, lead, now, holders.all);
    const result = evaluateEligibility(snapshot, lead, ruleCtx, { shortCircuit: options.shortCircuit ?? true });
    evaluated.push({ account, snapshot, result });
  }

  const eligible = evaluated.filter((e) => e.result.eligible);
  const inputs: RankingInput[] = [];
  for (const e of eligible) inputs.push(await buildRankingInput(ctx, e.account, lead, now, settings));
  const ranked = rankCandidates(inputs, {
    weights: settings.weights,
    waitNormalizationHours: settings.waitNormalizationHours,
    starvationGuardHours: settings.starvationGuardHours,
    disputePenaltyThreshold: settings.disputePenaltyThreshold,
    disputePenaltyMinAssignments: settings.disputePenaltyMinAssignments,
  });
  const byId = new Map(eligible.map((e) => [e.account._id, e]));
  const orderedEligible: EvaluatedCandidate[] = ranked.map((r) => {
    const candidate = byId.get(r.candidate.accountId)!;
    candidate.ranking = { input: r.candidate, score: r.score, position: r.position };
    return candidate;
  });

  return { lead, evaluated, ranked: orderedEligible, truncated, activeAssignments: holders.active };
}

export function scoreSnapshot(ranking: NonNullable<EvaluatedCandidate["ranking"]>) {
  return {
    total: ranking.score.total,
    tier: ranking.score.tier,
    starved: ranking.score.starved,
    penalized: ranking.score.penalized,
    parts: ranking.score.parts.map((p) => ({ key: p.key, label: p.label, points: p.points, max: p.max })),
    position: ranking.position,
  };
}
