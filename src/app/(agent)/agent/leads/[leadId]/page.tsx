"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { BalanceDrawCard, DisputeCard, HandoutCard, LeadHistoryCard, LeadWorkCard } from "@/components/agent/LeadActionCards";
import { useAgentAccount } from "@/components/agent/useAgentAccount";
import { PageHeader } from "@/components/layouts/PortalShell";
import { ConsentRecordCard } from "@/components/leads/ConsentRecordCard";
import { LeadTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { DefinitionList } from "@/components/ui/Display";
import { Alert, Avatar, PageLoading } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { formatDate, timeAgo } from "@/domain/format";
import { formatUsPhone } from "@/domain/normalize";

export default function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const assignmentId = leadId as Id<"leadAssignments">;
  const data = useQuery(api.leads.myLead, { assignmentId });
  const reference = useQuery(api.referenceData.publicData);
  const agent = useAgentAccount();
  const markOpened = useMutation(api.leads.markOpened);
  const marked = useRef<string | null>(null);

  // Mark opened once per assignment, only after the server confirmed the lead is ours.
  const visible = data !== undefined && !data.forbidden;
  useEffect(() => {
    if (!visible || marked.current === assignmentId) return;
    marked.current = assignmentId;
    markOpened({ assignmentId }).catch(() => undefined);
  }, [visible, assignmentId, markOpened]);

  const stateName = useMemo(() => {
    const map = new Map((reference?.states ?? []).map((s) => [s.code, s.name]));
    return (code: string) => map.get(code) ?? code;
  }, [reference]);

  const back = (
    <ButtonLink href="/agent/leads" variant="ghost" size="s" icon="back" style={{ marginBottom: ".9rem" }}>
      Back to leads
    </ButtonLink>
  );

  if (data === undefined || agent === undefined) {
    return (
      <>
        <PageHeader title="Lead" />
        <PageLoading />
      </>
    );
  }

  if (data.forbidden) {
    return (
      <>
        <PageHeader title="Lead" />
        {back}
        <Alert kind="e">
          <b>403 — not your lead.</b> This assignment belongs to another account and was never released to you.
        </Alert>
      </>
    );
  }

  const { lead, assignment } = data;
  const name = `${lead.firstName} ${lead.lastName}`;
  const readOnly = agent?.readOnly ?? false;
  const ceased = !!assignment.ceaseContactAt;
  const others = data.otherHolders;

  return (
    <>
      <PageHeader title={name} />
      {back}
      {ceased && (
        <div style={{ marginBottom: "1.25rem" }}>
          <Alert kind="e">
            <b>Consent withdrawn — stop all contact.</b> The consumer withdrew consent on {formatDate(assignment.ceaseContactAt, true)}. Do not call, text or
            email them. Their contact details are hidden; the record stays here for your files.
          </Alert>
        </div>
      )}
      <div className="g g-2-1">
        <div className="stack">
          <Card>
            <div className="card-hd">
              <div className="row">
                <Avatar name={name} large />
                <div>
                  <h2 className="h2">{name}</h2>
                  <div className="row" style={{ gap: ".4rem", marginTop: ".2rem" }}>
                    <LeadTypeBadge type={assignment.leadType} />
                    <StatusBadge status={assignment.status} />
                    <span className="xs mono">{lead.reference}</span>
                  </div>
                </div>
              </div>
              {!ceased && (
                <div className="b-row">
                  <a className="b b-navy b-s" href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>
                    <Icon name="phone" />
                    Call
                  </a>
                  <a className="b b-out b-s" href={`mailto:${lead.email}`}>
                    <Icon name="mail" />
                    Email
                  </a>
                </div>
              )}
            </div>
            <CardBody>
              <div className="reason-note">
                <div className="eyebrow">What is bringing them here</div>
                <p>{lead.reason}</p>
              </div>
              <DefinitionList
                items={[
                  [
                    "Phone",
                    <>
                      <b>{formatUsPhone(lead.phone)}</b>
                      {lead.bestTimeToCall ? ` · best time ${lead.bestTimeToCall}` : ""}
                    </>,
                  ],
                  ["Preferred contact", lead.preferredContactMethod ?? "No preference given"],
                  ["Email", <span key="e" style={{ wordBreak: "break-all" }}>{lead.email}</span>],
                  [
                    "Product",
                    <>
                      {lead.coverageName}
                      {lead.coverageUndetermined && <span className="xs"> · the consumer was not sure — confirm what fits on the call</span>}
                    </>,
                  ],
                  ["Budget", lead.budgetRange ?? "—"],
                  ["Cover in mind", lead.coverageAmount ?? "—"],
                  ["Protecting", lead.protecting ?? "—"],
                  ["Age range", lead.ageRange ?? "—"],
                  ["Location", `${lead.city ? `${lead.city}, ` : ""}${stateName(lead.state)} ${lead.zip}`],
                  ["Enquired", `${formatDate(lead.capturedAt, true)} (${timeAgo(lead.capturedAt, data.now)})`],
                  ["Released to you", formatDate(assignment.assignedAt, true)],
                  data.canHandOut && ["With", assignment.producerName ?? "Agency pool"],
                  [
                    "Who else has it",
                    assignment.leadType === "exclusive" ? (
                      <>
                        <b>Nobody.</b> Exclusive leads are released to one agent only — these details were never sent to anyone else.
                      </>
                    ) : others > 0 ? (
                      <>
                        <b>
                          Shared with {others} other licensed agent{others === 1 ? "" : "s"}.
                        </b>{" "}
                        Standard leads can be released to more than one agent, each licensed in {lead.state}.
                      </>
                    ) : (
                      <>
                        <b>Nobody else right now.</b> Standard leads can be released to more than one licensed agent.
                      </>
                    ),
                  ],
                ]}
              />
            </CardBody>
          </Card>

          <ConsentRecordCard consent={data.consent} />
          <LeadHistoryCard data={data} />
        </div>

        <div className="stack">
          <LeadWorkCard data={data} readOnly={readOnly} />
          {data.canHandOut && <HandoutCard data={data} readOnly={readOnly} state={lead.state} />}
          <DisputeCard data={data} readOnly={readOnly} consumerName={name} />
          <BalanceDrawCard data={data} producer={agent?.producer ?? false} />
        </div>
      </div>
    </>
  );
}

