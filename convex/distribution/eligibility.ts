import { type CandidateSnapshot, ELIGIBILITY_RULES, type EligibilityLead, type EligibilityRule, type RuleContext } from "./rules";

export interface RuleTraceEntry {
  key: string;
  label: string;
  pass: boolean;
  skipped?: boolean;
  reason?: string;
}

export interface EligibilityResult {
  eligible: boolean;
  /** Only hard rules failed? (false when every failure is a soft preference/hold) */
  hardFailure: boolean;
  trace: RuleTraceEntry[];
  failedRule?: RuleTraceEntry;
}

/**
 * Runs the rules in order. With `shortCircuit` (the engine) evaluation stops at the first failure;
 * without it (manual assignment, diagnostics) every rule is evaluated so hard and soft failures can
 * be told apart.
 */
export function evaluateEligibility(
  account: CandidateSnapshot,
  lead: EligibilityLead,
  ctx: RuleContext,
  options: { shortCircuit?: boolean; rules?: readonly EligibilityRule[] } = {},
): EligibilityResult {
  const rules = options.rules ?? ELIGIBILITY_RULES;
  const trace: RuleTraceEntry[] = [];
  let failedRule: RuleTraceEntry | undefined;
  let hardFailure = false;
  for (const rule of rules) {
    if (rule.appliesTo && !rule.appliesTo(lead, account)) {
      trace.push({ key: rule.key, label: rule.label, pass: true, skipped: true });
      continue;
    }
    const reason = rule.check(account, lead, ctx);
    if (reason === null) {
      trace.push({ key: rule.key, label: rule.label, pass: true });
      continue;
    }
    const entry: RuleTraceEntry = { key: rule.key, label: rule.label, pass: false, reason };
    trace.push(entry);
    failedRule ??= entry;
    if (rule.hard) hardFailure = true;
    if (options.shortCircuit ?? true) break;
  }
  return { eligible: !failedRule, hardFailure, trace, failedRule };
}

export function hardRuleKeys(rules: readonly EligibilityRule[] = ELIGIBILITY_RULES): string[] {
  return rules.filter((r) => r.hard).map((r) => r.key);
}
