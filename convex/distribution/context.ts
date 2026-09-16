import type { DistributionSettings } from "../../src/domain/distribution";
import type { RankingCandidate } from "../../src/domain/ranking";
import { DAY, HOUR, startOfLocalDay } from "../../src/domain/time";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getBalanceDoc, summarizeBalance } from "../ledger";
import type { CandidateSnapshot, EligibilityLead } from "./rules";

type Ctx = QueryCtx | MutationCtx;

/** Accounts that have been approved at some point. Pending, rejected and closed accounts are never candidates. */
const CANDIDATE_STATUSES = ["active", "suspended", "blocked"] as const;
export const MAX_CANDIDATES = 500;

export interface LoadedCandidate {
  account: Doc<"accounts">;
  snapshot: CandidateSnapshot;
}

export async function loadCandidateAccounts(ctx: Ctx): Promise<{ accounts: Doc<"accounts">[]; truncated: boolean }> {
  const accounts: Doc<"accounts">[] = [];
  for (const status of CANDIDATE_STATUSES) {
    const rows = await ctx.db
      .query("accounts")
      .withIndex("by_status", (q) => q.eq("status", status))
      .take(MAX_CANDIDATES + 1);
    accounts.push(...rows);
  }
  return { accounts: accounts.slice(0, MAX_CANDIDATES), truncated: accounts.length > MAX_CANDIDATES };
}

export async function coverageRequiresTpmo(ctx: Ctx, coverageType: string): Promise<boolean> {
  const row = await ctx.db
    .query("coverageTypes")
    .withIndex("by_key", (q) => q.eq("key", coverageType))
    .unique();
  return row?.requiresTpmo ?? coverageType === "medicare";
}

export async function buildSnapshot(
  ctx: Ctx,
  account: Doc<"accounts">,
  lead: EligibilityLead,
  now: number,
  holders: ReadonlySet<Id<"accounts">>,
): Promise<CandidateSnapshot> {
  const prefs = await ctx.db
    .query("agentPreferences")
    .withIndex("by_account", (q) => q.eq("accountId", account._id))
    .unique();

  const licenses = await ctx.db
    .query("licenses")
    .withIndex("by_account_state", (q) => q.eq("accountId", account._id).eq("state", lead.state))
    .collect();
  const current = licenses.filter((l) => !l.memberId && !l.supersededAt);
  const bestLicense =
    current.find((l) => l.verificationStatus === "verified" && l.expiresAt > now) ??
    current.sort((a, b) => b.submittedAt - a.submittedAt)[0] ??
    null;

  const policies = await ctx.db
    .query("eoPolicies")
    .withIndex("by_account", (q) => q.eq("accountId", account._id))
    .collect();
  const eo = policies.filter((p) => !p.supersededAt && p.verificationStatus !== "failed").sort((a, b) => b.expiresAt - a.expiresAt)[0]
    ?? policies.filter((p) => !p.supersededAt).sort((a, b) => b.submittedAt - a.submittedAt)[0]
    ?? null;

  let tpmoApproved = false;
  if (lead.requiresTpmo) {
    const approvals = await ctx.db
      .query("tpmoApprovals")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .collect();
    tpmoApproved = approvals.some((t) => t.status === "approved" && !t.revokedAt);
  }

  const balance = summarizeBalance(await getBalanceDoc(ctx, account._id));

  const dayStart = startOfLocalDay(now, account.timezone);
  const today = await ctx.db
    .query("leadAssignments")
    .withIndex("by_account_assignedAt", (q) => q.eq("accountId", account._id).gte("assignedAt", dayStart))
    .collect();
  const assignedToday = today.filter((a) => !a.revokedAt).length;

  let activeVerifiedSeats = 0;
  if (account.type === "agency") {
    const seats = await ctx.db
      .query("agencyMembers")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .collect();
    activeVerifiedSeats = seats.filter(
      (s) => s.status === "active" && s.verificationStatus === "verified" && s.seatRole !== "billing_contact",
    ).length;
  }

  return {
    accountId: account._id,
    name: account.name,
    type: account.type,
    status: account.status,
    timezone: account.timezone,
    qualityHold: account.qualityHold,
    declinedPurchaseOutstanding: account.declinedPurchaseOutstanding,
    lastAssignedAt: account.lastAssignedAt ?? null,
    preferences: prefs
      ? {
          states: prefs.states,
          coverageTypes: prefs.coverageTypes,
          dailyPace: prefs.dailyPace,
          receivingStartHour: prefs.receivingStartHour,
          receivingEndHour: prefs.receivingEndHour,
          paused: prefs.paused,
          pausedUntil: prefs.pausedUntil ?? null,
        }
      : null,
    licenseForState: bestLicense ? { verificationStatus: bestLicense.verificationStatus, expiresAt: bestLicense.expiresAt } : null,
    eoPolicy: eo ? { verificationStatus: eo.verificationStatus, expiresAt: eo.expiresAt } : null,
    tpmoApproved,
    balance: { exclusive: balance.exclusive, standard: balance.standard },
    assignedToday,
    alreadyHoldsLead: holders.has(account._id),
    activeVerifiedSeats,
  };
}

export interface RankingInput extends RankingCandidate {
  accountId: Id<"accounts">;
}

/** Ranking inputs are only computed for accounts that passed every eligibility rule. */
export async function buildRankingInput(
  ctx: Ctx,
  account: Doc<"accounts">,
  lead: EligibilityLead,
  now: number,
  settings: DistributionSettings,
): Promise<RankingInput> {
  const windowStart = now - settings.contactRateWindowDays * DAY;
  const recent = await ctx.db
    .query("leadAssignments")
    .withIndex("by_account_assignedAt", (q) => q.eq("accountId", account._id).gte("assignedAt", windowStart))
    .collect();
  const live = recent.filter((a) => !a.revokedAt);
  const contacted = live.filter((a) => a.contactedAt != null || a.status !== "new").length;
  const disputes = await ctx.db
    .query("disputes")
    .withIndex("by_account", (q) => q.eq("accountId", account._id).gte("submittedAt", windowStart))
    .collect();
  const balance = summarizeBalance(await getBalanceDoc(ctx, account._id));
  return {
    accountId: account._id,
    hoursSinceLastAssignment: account.lastAssignedAt ? (now - account.lastAssignedAt) / HOUR : null,
    contactRate: live.length ? contacted / live.length : null,
    balanceRemaining: balance[lead.leadType],
    balanceIssued: lead.leadType === "exclusive" ? balance.exclusiveIssued : balance.standardIssued,
    volumePurchased: balance.purchased,
    upheldDisputes: disputes.filter((d) => d.status === "upheld").length,
    assignmentsForDisputeRate: live.length,
  };
}

export async function activeHolders(ctx: Ctx, leadId: Id<"leads"> | null) {
  if (!leadId) return { all: new Set<Id<"accounts">>(), active: [] as Doc<"leadAssignments">[] };
  const rows = await ctx.db
    .query("leadAssignments")
    .withIndex("by_lead", (q) => q.eq("leadId", leadId))
    .collect();
  return { all: new Set(rows.map((r) => r.accountId)), active: rows.filter((r) => !r.revokedAt) };
}
