"use client";

import { useState } from "react";
import type { Doc } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { BadgeTone } from "@/domain/status";
import { formatDate } from "@/domain/format";
import { cn } from "@/lib/cn";
import { AccountTrace } from "./EligibilityTrace";
import { RUN_TRIGGER_LABELS } from "./format";

const OUTCOME: Record<Doc<"distributionRuns">["outcome"], { tone: "ok" | "warn" | "bad" | undefined; badge: BadgeTone; label: string }> = {
  assigned: { tone: "ok", badge: "g", label: "Released" },
  partial: { tone: "warn", badge: "gold", label: "Partly filled" },
  none: { tone: "bad", badge: "r", label: "Nobody eligible" },
  held: { tone: "warn", badge: "a", label: "Held — engine off" },
  skipped: { tone: undefined, badge: "n", label: "Skipped" },
};

/** Distribution attempts timeline (prototype) with the per-account eligibility trace stored on every run (new). */
export function LeadDistributionRuns({ runs }: { runs: Doc<"distributionRuns">[] }) {
  const [openRun, setOpenRun] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Distribution attempts" description="Newest first. Each attempt keeps the rule-by-rule trace for every account it evaluated." />
      <CardBody>
        {runs.length === 0 ? (
          <p className="sm">No attempts logged yet.</p>
        ) : (
          <ol className="tl">
            {runs.map((run) => {
              const outcome = OUTCOME[run.outcome];
              const isOpen = openRun === run._id;
              return (
                <li key={run._id} className={cn("tli", outcome.tone)}>
                  <time>
                    {formatDate(run.startedAt, true)} · {RUN_TRIGGER_LABELS[run.trigger] ?? run.trigger}
                  </time>
                  <h5 className="row" style={{ gap: ".45rem" }}>
                    <span>
                      {run.evaluatedCount} evaluated · {run.eligibleCount} eligible · {run.assignedCount} assigned
                    </span>
                    <Badge tone={outcome.badge}>{outcome.label}</Badge>
                  </h5>
                  <p className="xs">
                    Slots filled before this attempt: {run.slotsFilledBefore} of {run.slotsTarget}
                  </p>
                  {run.reason && <p className="sm">{run.reason}</p>}
                  {run.trace.length > 0 && (
                    <button
                      type="button"
                      className="link xs"
                      style={{ marginTop: ".3rem" }}
                      aria-expanded={isOpen}
                      onClick={() => setOpenRun(isOpen ? null : run._id)}
                    >
                      {isOpen ? "Hide eligibility trace" : `Show eligibility trace (${run.trace.length} account${run.trace.length === 1 ? "" : "s"})`}
                    </button>
                  )}
                  {isOpen && (
                    <div className="stack" style={{ gap: ".5rem", marginTop: ".6rem" }}>
                      {run.trace.map((row) => (
                        <AccountTrace
                          key={row.accountId}
                          name={row.accountName}
                          eligible={row.eligible}
                          assigned={row.assigned}
                          rules={row.rules}
                          score={row.score ?? null}
                          subtitle={row.eligible && row.score ? `#${row.score.position} · score ${row.score.total}` : undefined}
                        />
                      ))}
                      {run.traceTruncated && <p className="xs">Trace truncated — only the first accounts evaluated were stored.</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
