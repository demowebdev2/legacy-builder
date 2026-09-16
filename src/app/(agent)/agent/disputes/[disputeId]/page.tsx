"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAgentAccount } from "@/components/agent/useAgentAccount";
import { PageHeader } from "@/components/layouts/PortalShell";
import { StatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DefinitionList, type TimelineItem, Timeline } from "@/components/ui/Display";
import { Alert, EmptyState, PageLoading } from "@/components/ui/Feedback";
import { formatDate, timeAgo } from "@/domain/format";

export default function DisputeDetailPage() {
  const { disputeId } = useParams<{ disputeId: string }>();
  const data = useQuery(api.disputes.myDispute, { disputeId: disputeId as Id<"disputes"> });
  const agent = useAgentAccount();

  const back = (
    <ButtonLink href="/agent/disputes" variant="ghost" size="s" icon="back" style={{ marginBottom: ".9rem" }}>
      Back to disputes
    </ButtonLink>
  );

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
        <PageHeader title="Dispute" />
        {back}
        <div className="card">
          <EmptyState icon="warn" title="Dispute not found">
            That dispute does not exist or is not on one of your leads.
          </EmptyState>
        </div>
      </>
    );
  }

  const { dispute, returnEntry } = data;
  const leadHref = `/agent/leads/${dispute.assignmentId}`;
  const typeLabel = dispute.leadType === "exclusive" ? "Exclusive" : "Standard";
  const hoursAfterRelease = Math.max(0, Math.round((dispute.submittedAt - data.assignedAt) / 3_600_000));

  const history: TimelineItem[] = [];
  if (returnEntry) {
    history.push({ key: "return", tone: "ok", time: formatDate(returnEntry.createdAt, true), title: `One ${dispute.leadType} lead returned to your balance` });
  }
  if (dispute.decidedAt) {
    history.push({
      key: "decided",
      tone: dispute.status === "upheld" ? "ok" : "bad",
      time: `${formatDate(dispute.decidedAt, true)} · ${dispute.decidedByName ?? "Legacy Builders"}`,
      title: dispute.status === "upheld" ? "Upheld" : "Rejected",
      body: dispute.decisionNotes,
    });
  } else {
    history.push({ key: "review", tone: "now", time: "Now", title: "Under review", body: "Decisions are made within two business days." });
  }
  history.push({ key: "raised", tone: "warn", time: formatDate(dispute.submittedAt, true), title: `Dispute raised — ${data.reasonLabel}`, body: dispute.details });
  history.push({ key: "released", tone: "ok", time: formatDate(data.assignedAt, true), title: "Lead released to you" });

  return (
    <>
      <PageHeader title={`Dispute — ${data.reference}`} />
      {back}
      <div className="g g-2-1">
        <div className="stack">
          <Card>
            <CardHeader title={`Dispute on ${data.reference}`} description={data.consumerName} actions={<StatusBadge status={dispute.status} />} />
            <CardBody>
              <DefinitionList
                items={[
                  [
                    "Lead",
                    <Link key="lead" className="link" href={leadHref}>
                      {data.consumerName} · {data.reference}
                    </Link>,
                  ],
                  ["Reason", data.reasonLabel],
                  ["What happened", dispute.details ? <span style={{ whiteSpace: "pre-line" }}>{dispute.details}</span> : <span className="xs">No details given</span>],
                  ["Lead type", typeLabel],
                  ["Released to you", formatDate(data.assignedAt, true)],
                  ["Submitted", `${formatDate(dispute.submittedAt, true)} · ${hoursAfterRelease}h after release`],
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Decision" actions={dispute.autoDecided ? <span className="xs">Automatic system check</span> : undefined} />
            <CardBody>
              {dispute.status === "pending" ? (
                <Alert kind="i">
                  <b>Under review.</b> Raised {timeAgo(dispute.submittedAt)}. Decisions are made within two business days and you will be notified either way.
                </Alert>
              ) : (
                <>
                  <DefinitionList
                    items={[
                      ["Decision", <StatusBadge key="s" status={dispute.status} />],
                      ["Decided", formatDate(dispute.decidedAt, true)],
                      ["Decided by", dispute.autoDecided ? "System (auto-uphold)" : (dispute.decidedByName ?? "Legacy Builders")],
                    ]}
                  />
                  {dispute.decisionNotes && (
                    <p className="sm" style={{ marginTop: ".8rem", whiteSpace: "pre-line" }}>
                      {dispute.decisionNotes}
                    </p>
                  )}
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" />
            <CardBody>
              <Timeline items={history} />
            </CardBody>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Lead returned" />
            <CardBody>
              {returnEntry ? (
                <>
                  <DefinitionList
                    items={[
                      ["Entry", "Dispute upheld"],
                      ["Type", returnEntry.leadType === "exclusive" ? "Exclusive" : "Standard"],
                      ["Amount", <b key="a" style={{ color: "var(--green)" }}>+{returnEntry.delta}</b>],
                      ["Balance after", `${returnEntry.balanceAfter} ${returnEntry.leadType} remaining`],
                      ["Recorded", formatDate(returnEntry.createdAt, true)],
                    ]}
                  />
                  <p className="xs" style={{ marginTop: ".7rem" }}>
                    The original release is never edited. The return is its own entry on the append-only ledger.
                  </p>
                  {!agent?.producer && (
                    <ButtonLink href="/agent/balance" variant="out" size="s" full style={{ marginTop: ".9rem" }}>
                      View the ledger
                    </ButtonLink>
                  )}
                </>
              ) : dispute.status === "pending" ? (
                <p className="sm">If upheld, one {dispute.leadType} lead returns to your balance as a separate ledger entry.</p>
              ) : (
                <p className="sm">The lead stands. Its release stays on your ledger and nothing was returned.</p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Something to add?" />
            <CardBody>
              <p className="sm" style={{ marginBottom: ".9rem" }}>
                Evidence that was not in the original dispute can still help. Send it to support with the lead reference {data.reference}.
              </p>
              <ButtonLink href="/agent/support" variant="out" size="s" full>
                Contact support
              </ButtonLink>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
