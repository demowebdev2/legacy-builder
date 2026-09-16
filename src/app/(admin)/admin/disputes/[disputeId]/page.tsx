"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ago } from "@/components/admin/format";
import { useNow, useStaff } from "@/components/admin/hooks";
import { PageHeader } from "@/components/layouts/PortalShell";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { Badge, LeadTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DefinitionList, Timeline, type TimelineItem } from "@/components/ui/Display";
import { Alert, EmptyState, Meter, PageLoading } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/domain/format";

const HOUR = 3_600_000;

function DisputeDetailView() {
  const params = useParams<{ disputeId: string }>();
  const disputeId = params.disputeId as Id<"disputes">;
  const data = useQuery(api.disputes.adminGet, { disputeId });
  const reference = useQuery(api.referenceData.publicData);
  const decide = useMutation(api.disputes.decide);
  const { can } = useStaff();
  const toast = useToast();
  const now = useNow();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"upheld" | "rejected" | null>(null);

  if (data === undefined) {
    return (
      <>
        <PageHeader title="Dispute" />
        <PageLoading />
      </>
    );
  }
  if (data === null) {
    return (
      <>
        <PageHeader title="Dispute not found" />
        <div className="card">
          <EmptyState
            icon="warn"
            title="Dispute not found"
            action={
              <ButtonLink href="/admin/disputes" variant="out" size="s" icon="back">
                Back to disputes
              </ButtonLink>
            }
          >
            No dispute with that id exists.
          </EmptyState>
        </div>
      </>
    );
  }

  const { dispute, lead, account, assignment, accountDisputeRate } = data;
  const coverageName = lead ? (reference?.coverageTypes.find((c) => c.key === lead.coverageType)?.name ?? lead.coverageType) : "—";
  const windowHours = assignment ? Math.round((assignment.disputeDeadlineAt - assignment.assignedAt) / HOUR) : null;
  const raisedAfterHours = assignment ? (dispute.submittedAt - assignment.assignedAt) / HOUR : null;
  const insideWindow = assignment ? dispute.submittedAt <= assignment.disputeDeadlineAt : null;
  const canDecide = can("disputes.decide") && dispute.status === "pending";
  const type = dispute.leadType === "exclusive" ? "exclusive" : "standard";

  const submit = async (decision: "upheld" | "rejected") => {
    if (notes.trim().length < 5) {
      setError("Every decision needs a reason the agent can read (at least 5 characters).");
      return;
    }
    setPending(decision);
    try {
      await decide({ disputeId, decision, notes: notes.trim() });
      toast.success(decision === "upheld" ? "Dispute upheld" : "Dispute rejected", "The agent has been notified with your note.");
      setNotes("");
    } catch (e) {
      toast.error(e, "Could not record the decision");
    } finally {
      setPending(null);
    }
  };

  const timeline: TimelineItem[] = [];
  if (lead) timeline.push({ key: "captured", time: formatDate(lead.capturedAt, true), title: "Lead captured" });
  if (assignment) {
    timeline.push({ key: "released", tone: "ok", time: formatDate(assignment.assignedAt, true), title: `Released to ${account?.name ?? "the agent"}` });
    if (assignment.openedAt) timeline.push({ key: "opened", time: formatDate(assignment.openedAt, true), title: "Opened by the agent" });
    if (assignment.contactedAt) timeline.push({ key: "contacted", time: formatDate(assignment.contactedAt, true), title: "First status update" });
  }
  timeline.push({
    key: "raised",
    tone: "warn",
    time: formatDate(dispute.submittedAt, true),
    title: `Dispute raised — ${data.reasonLabel}`,
    body: raisedAfterHours != null ? `${Math.round(raisedAfterHours * 10) / 10}h after release` : undefined,
  });
  if (assignment)
    timeline.push({
      key: "deadline",
      tone: assignment.disputeDeadlineAt < now ? undefined : "now",
      time: formatDate(assignment.disputeDeadlineAt, true),
      title: `Dispute window closes (${windowHours}h)`,
    });
  if (dispute.decidedAt)
    timeline.push({
      key: "decided",
      tone: dispute.status === "upheld" ? "ok" : "bad",
      time: formatDate(dispute.decidedAt, true),
      title: `${dispute.status === "upheld" ? "Upheld" : "Rejected"} by ${dispute.decidedByName ?? "staff"}`,
    });

  return (
    <>
      <PageHeader title={`Dispute ${lead?.reference ?? ""}`.trim()} />
      <ButtonLink href="/admin/disputes" variant="ghost" size="s" icon="back" style={{ marginBottom: ".9rem" }}>
        Back to disputes
      </ButtonLink>

      <div className="g g-2-1">
        <div className="stack">
          <Card>
            <CardHeader>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: ".5rem" }}>
                  <h2 className="h2">{data.reasonLabel}</h2>
                  <StatusBadge status={dispute.status} />
                  {dispute.autoDecided && <Badge tone="b">Auto-decided</Badge>}
                </div>
                <p className="sm" style={{ marginTop: ".2rem" }}>
                  {account?.name ?? "Agent"} · raised {formatDate(dispute.submittedAt, true)} ({ago(dispute.submittedAt, now)})
                </p>
              </div>
            </CardHeader>
            <CardBody>
              {dispute.details ? (
                <div
                  style={{
                    background: "var(--soft)",
                    borderLeft: "3px solid var(--line-2)",
                    borderRadius: "var(--r-s)",
                    padding: ".85rem 1rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div className="eyebrow">What the agent says</div>
                  <p style={{ marginTop: ".3rem", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{dispute.details}</p>
                </div>
              ) : (
                <p className="sm" style={{ marginBottom: "1rem" }}>
                  The agent added no details beyond the reason.
                </p>
              )}
              {dispute.status === "pending" && now - dispute.submittedAt > 40 * HOUR && (
                <div style={{ marginBottom: "1rem" }}>
                  <Alert kind="e">
                    <b>SLA risk.</b> This dispute has waited {Math.round((now - dispute.submittedAt) / HOUR)} hours for a decision.
                  </Alert>
                </div>
              )}
              <DefinitionList
                items={[
                  ["Reason", data.reasonLabel],
                  ["Lead type", <LeadTypeBadge key="t" type={dispute.leadType} />],
                  ["Raised", formatDate(dispute.submittedAt, true)],
                  [
                    "Within window",
                    insideWindow == null ? "—" : insideWindow ? `Yes — ${Math.round((raisedAfterHours ?? 0) * 10) / 10}h of ${windowHours}h used` : "No — raised after the window closed",
                  ],
                ]}
              />
              {assignment && raisedAfterHours != null && windowHours && (
                <div style={{ marginTop: ".8rem" }}>
                  <Meter percent={(raisedAfterHours / windowHours) * 100} tone={raisedAfterHours / windowHours > 0.85 ? "amber" : "green"} />
                  <p className="xs" style={{ marginTop: ".3rem" }}>
                    Assignment timing against the {windowHours}-hour dispute window.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Lead"
              actions={
                lead ? (
                  <ButtonLink href={`/admin/leads/${lead.id}`} variant="out" size="s" iconRight="arrow">
                    Open lead
                  </ButtonLink>
                ) : undefined
              }
            />
            <CardBody>
              {lead ? (
                <DefinitionList
                  items={[
                    ["Reference", <span key="r" className="mono">{lead.reference}</span>],
                    ["Consumer", lead.name],
                    ["Product", coverageName],
                    ["State", lead.state],
                    ["Captured", formatDate(lead.capturedAt, true)],
                    lead.duplicateOfLeadId
                      ? [
                          "Duplicate of",
                          <Link key="d" className="link" href={`/admin/leads/${lead.duplicateOfLeadId}`}>
                            Original lead
                          </Link>,
                        ]
                      : null,
                    assignment?.revokedAt ? ["Assignment", `Revoked — ${assignment.revokedReason ?? ""}`] : null,
                  ]}
                />
              ) : (
                <p className="sm">The lead record could not be found.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Timeline" />
            <CardBody>
              <Timeline items={timeline} />
            </CardBody>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Agent" />
            <CardBody>
              <DefinitionList
                items={[
                  [
                    "Account",
                    account ? (
                      <Link key="a" className="link" href={`/admin/accounts/${account.id}`}>
                        {account.name}
                      </Link>
                    ) : (
                      "—"
                    ),
                  ],
                  [
                    "Dispute rate",
                    accountDisputeRate.assignments
                      ? `${accountDisputeRate.percent}% (${accountDisputeRate.disputes} of ${accountDisputeRate.assignments})`
                      : "—",
                  ],
                ]}
              />
              <Meter percent={accountDisputeRate.percent} tone={accountDisputeRate.percent > 15 ? "red" : accountDisputeRate.percent >= 5 ? "amber" : "green"} />
              <p className="xs" style={{ marginTop: ".5rem" }}>
                All disputes raised against live releases. Ranking deprioritises an account only when its upheld-dispute rate passes the penalty
                threshold in Rules &amp; weights — accounts are never auto-blocked for disputes.
              </p>
            </CardBody>
          </Card>

          {canDecide ? (
            <Card>
              <CardHeader title="Decision" />
              <CardBody>
                <Field
                  label="Decision note"
                  required
                  error={error}
                  help="Visible to the agent. This is the whole difference between a fair process and an arbitrary one."
                >
                  <textarea
                    value={notes}
                    maxLength={2000}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="What confirmed the claim — or why the lead stands"
                  />
                </Field>
                <Alert kind="i">
                  Upholding returns one {type} lead to {account?.name ?? "the agent"}&rsquo;s balance as a compensating ledger entry. Rejecting returns
                  nothing; the agent sees your note.
                </Alert>
                <div className="b-row" style={{ marginTop: "1rem" }}>
                  <Button variant="green" size="s" loading={pending === "upheld"} disabled={!!pending} onClick={() => void submit("upheld")}>
                    Uphold and return lead
                  </Button>
                  <Button variant="red" size="s" loading={pending === "rejected"} disabled={!!pending} onClick={() => void submit("rejected")}>
                    Reject
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Decision" actions={<StatusBadge status={dispute.status} />} />
              <CardBody>
                {dispute.status === "pending" ? (
                  <p className="sm">Awaiting a decision. Your role can view disputes but not decide them.</p>
                ) : (
                  <>
                    <DefinitionList
                      items={[
                        ["Decided by", dispute.decidedByName ?? "—"],
                        ["Decided", formatDate(dispute.decidedAt, true)],
                        ["Lead returned", dispute.returnLedgerEntryId ? `Yes — one ${type} lead` : "No"],
                      ]}
                    />
                    {dispute.decisionNotes && (
                      <p className="sm" style={{ marginTop: ".8rem", whiteSpace: "pre-wrap" }}>
                        {dispute.decisionNotes}
                      </p>
                    )}
                  </>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

export default function AdminDisputeDetailPage() {
  return (
    <RequirePermission permission="disputes.read" title="Dispute">
      <DisputeDetailView />
    </RequirePermission>
  );
}
