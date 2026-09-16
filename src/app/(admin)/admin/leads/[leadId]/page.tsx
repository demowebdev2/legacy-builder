"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AssignLeadModal, type AssignTarget } from "@/components/admin/AssignLeadModal";
import { ago, ASSIGNABLE_LEAD_STATUSES, formatUsPhone, LEAD_SOURCE_LABELS, WITHDRAWAL_METHOD_LABELS } from "@/components/admin/format";
import { useNow, useStaff } from "@/components/admin/hooks";
import { EditLeadModal, type EditableLead, RawPayloadModal, SuppressLeadModal } from "@/components/admin/LeadActionModals";
import { LeadDistributionRuns } from "@/components/admin/LeadDistributionRuns";
import { RevokeAssignmentModal, type RevokeTarget } from "@/components/admin/RevokeAssignmentModal";
import { useRequeue } from "@/components/admin/useRequeue";
import { PageHeader } from "@/components/layouts/PortalShell";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { ConsentRecordCard } from "@/components/leads/ConsentRecordCard";
import { Badge, LeadTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, DefinitionList, Timeline } from "@/components/ui/Display";
import { Alert, EmptyState, PageLoading } from "@/components/ui/Feedback";
import { formatDate, timeAgo } from "@/domain/format";
import { formatMoney } from "@/domain/money";
import { statusBadge } from "@/domain/status";
import { errorMessage } from "@/lib/errors";

type Contact = { leadId: string; phone: string; email: string; firstName: string; lastName: string; zip: string };

function LeadDetailView() {
  const params = useParams<{ leadId: string }>();
  const leadId = params.leadId as Id<"leads">;
  const { can } = useStaff();
  const now = useNow();
  const detail = useQuery(api.leads.adminGet, { leadId });
  const extras = useQuery(api.adminLeadViews.leadExtras, { leadId });
  const reference = useQuery(api.referenceData.publicData);
  const revealContact = useMutation(api.leads.revealContact);
  const [requeue, requeuing] = useRequeue();

  const [contact, setContact] = useState<Contact | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [editLead, setEditLead] = useState<EditableLead | null>(null);
  const [suppressOpen, setSuppressOpen] = useState(false);
  const [payloadOpen, setPayloadOpen] = useState(false);

  const canSeePii = can("leads.pii");
  const loaded = !!detail;
  const revealedFor = useRef<string | null>(null);
  useEffect(() => {
    // Revealing contact details writes a PII-access audit event, so it happens once per lead view.
    if (!canSeePii || !loaded || revealedFor.current === leadId) return;
    revealedFor.current = leadId;
    revealContact({ leadId })
      .then((c) => setContact({ leadId, ...c }))
      .catch((e: unknown) => setContactError(errorMessage(e)));
  }, [canSeePii, loaded, leadId, revealContact]);

  if (detail === undefined) {
    return (
      <>
        <PageHeader title="Lead" />
        <PageLoading />
      </>
    );
  }
  if (detail === null) {
    return (
      <>
        <PageHeader title="Lead not found" />
        <div className="card">
          <EmptyState
            icon="warn"
            title="Lead not found"
            action={
              <ButtonLink href="/admin/leads" variant="out" size="s" icon="back">
                Back to leads
              </ButtonLink>
            }
          >
            No lead with that id exists.
          </EmptyState>
        </div>
      </>
    );
  }

  const { lead, assignments, runs, consent, withdrawals } = detail;
  const shownContact = contact?.leadId === leadId ? contact : null;
  const consumerName = shownContact ? `${shownContact.firstName} ${shownContact.lastName}` : `${lead.firstName} ${lead.lastName}`;
  const stateName = reference?.states.find((s) => s.code === lead.state)?.name ?? lead.state;
  const active = assignments.filter((a) => !a.revokedAt);
  const type = lead.leadType === "exclusive" ? "exclusive" : "standard";
  const withdrawn = !!lead.withdrawnAt;
  const assignable = ASSIGNABLE_LEAD_STATUSES.has(lead.status) && !withdrawn;
  const slotsFull = active.length >= lead.recipientTarget;
  const blockedReason = withdrawn
    ? "Consent withdrawn — this lead is never released again."
    : slotsFull && lead.assignedCount > 0
      ? "Every recipient slot is filled. Revoke an assignment to free one."
      : !assignable
        ? `Leads with status “${statusBadge(lead.status)[1]}” are not released.`
        : null;
  const manage = can("leads.manage");
  const subtitle = `${lead.coverageName} · ${lead.city ? `${lead.city}, ` : ""}${lead.state}`;

  return (
    <>
      <PageHeader title={`Lead ${lead.reference}`} />
      <ButtonLink href="/admin/leads" variant="ghost" size="s" icon="back" style={{ marginBottom: ".9rem" }}>
        Back to leads
      </ButtonLink>

      <div className="g g-2-1">
        <div className="stack">
          <Card>
            <CardHeader>
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: ".5rem" }}>
                  <h2 className="h2 mono" style={{ fontSize: "1.3rem" }}>
                    {lead.reference}
                  </h2>
                  <StatusBadge status={lead.status} />
                  <LeadTypeBadge type={lead.leadType} />
                </div>
                <p className="sm" style={{ marginTop: ".2rem" }}>
                  {consumerName} · captured {formatDate(lead.capturedAt, true)}
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <div className="g g2">
                <DefinitionList
                  items={[
                    ["Phone", <span key="p" className="mono">{shownContact ? formatUsPhone(shownContact.phone) : lead.phone}</span>],
                    ["Email", shownContact ? shownContact.email : lead.email],
                    ["Location", `${lead.city ? `${lead.city}, ` : ""}${stateName} ${lead.zip}`],
                    ["Product", lead.coverageUndetermined ? `${lead.coverageName} (consumer not sure)` : lead.coverageName],
                    ["Cover", lead.coverageAmount ?? "—"],
                    ["Budget", lead.budgetRange ?? "—"],
                    lead.ageRange ? ["Age range", lead.ageRange] : null,
                    lead.protecting ? ["Protecting", lead.protecting] : null,
                    lead.bestTimeToCall ? ["Best time", lead.bestTimeToCall] : null,
                    lead.preferredContactMethod ? ["Prefers", lead.preferredContactMethod] : null,
                  ]}
                />
                <DefinitionList
                  items={[
                    ["Source", LEAD_SOURCE_LABELS[lead.source] ?? lead.source],
                    ["Marketing source", extras?.marketingSourceName ?? "—"],
                    extras?.createdByName ? ["Created by", extras.createdByName] : null,
                    ["Captured", `${formatDate(lead.capturedAt, true)} (${ago(lead.capturedAt, now)})`],
                    lead.qualityScore != null ? ["Quality score", `${lead.qualityScore} / 100`] : null,
                    [
                      "Released to",
                      active.length
                        ? `${active.map((a) => a.accountName).join(", ")}${lead.leadType === "exclusive" ? " — sole holder" : ""}`
                        : "Nobody yet",
                    ],
                    ["Acquisition cost", <span key="c">{formatMoney(detail.acquisitionCostCents)} <span className="xs">({type} rate)</span></span>],
                  ]}
                />
              </div>

              <div
                style={{
                  marginTop: "1.15rem",
                  background: "var(--gold-wash)",
                  borderLeft: "3px solid var(--gold)",
                  borderRadius: "var(--r-s)",
                  padding: ".9rem 1.1rem",
                }}
              >
                <div className="eyebrow" style={{ color: "#8A6413" }}>
                  What is bringing them to Legacy Builders — in their words
                </div>
                <p style={{ fontSize: "1rem", lineHeight: 1.65, marginTop: ".35rem", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{lead.reason}</p>
              </div>

              {(lead.processingNote || withdrawn) && (
                <div className="stack" style={{ marginTop: "1rem", gap: ".6rem" }}>
                  {withdrawn && (
                    <Alert kind="e">
                      <b>Consent withdrawn {formatDate(lead.withdrawnAt, true)}.</b> The contact is suppressed, the lead is never released again and every
                      holder was told to cease contact.
                    </Alert>
                  )}
                  {lead.processingNote && (
                    <Alert kind="w">
                      {lead.processingNote}
                      {lead.duplicateOfLeadId && detail.duplicateOfReference && (
                        <>
                          {" "}
                          <Link className="link" href={`/admin/leads/${lead.duplicateOfLeadId}`}>
                            Open {detail.duplicateOfReference} →
                          </Link>
                        </>
                      )}
                    </Alert>
                  )}
                </div>
              )}
              {!canSeePii && (
                <div style={{ marginTop: "1rem" }}>
                  <Alert kind="n">Contact details hidden for your role. Names, phone and email are masked; viewing them requires consumer-data access.</Alert>
                </div>
              )}
              {canSeePii && contactError && (
                <div style={{ marginTop: "1rem" }}>
                  <Alert kind="e">Contact details could not be loaded: {contactError}</Alert>
                </div>
              )}
              {canSeePii && shownContact && (
                <p className="xs" style={{ marginTop: ".8rem" }}>
                  Your view of these contact details has been recorded in the audit log.
                </p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Assignments"
              description={`${active.length} of ${lead.recipientTarget} recipient slot${lead.recipientTarget === 1 ? "" : "s"} filled`}
              actions={<span className="xs">Immutable · never deleted</span>}
            />
            {assignments.length ? (
              <DataTable
                flush
                caption="Assignments"
                columns={[
                  { label: "Agent" },
                  { label: "Method" },
                  { label: "Released" },
                  { label: "Opened" },
                  { label: "Contacted" },
                  { label: "Status" },
                  { label: "Actions", align: "right", srOnly: true },
                ]}
              >
                {assignments.map((a) => (
                  <tr key={a._id}>
                    <td style={{ minWidth: 170 }}>
                      <Link className="nm" href={`/admin/accounts/${a.accountId}`}>
                        {a.accountName}
                      </Link>
                      <span className="tsub">
                        {a.balanceOfType} {a.leadType} left
                      </span>
                    </td>
                    <td>{a.method === "auto" ? <Badge tone="n">Auto</Badge> : <Badge tone="gold">Manual</Badge>}</td>
                    <td className="sm nowrap">{formatDate(a.assignedAt, true)}</td>
                    <td className="sm nowrap">{a.openedAt ? ago(a.openedAt, now) : "—"}</td>
                    <td className="sm nowrap">{a.contactedAt ? ago(a.contactedAt, now) : "—"}</td>
                    <td>
                      {a.revokedAt ? <StatusBadge status="revoked" /> : <StatusBadge status={a.status} />}
                      {a.revokedReason && <span className="tsub">{a.revokedReason}</span>}
                      {!a.revokedAt && a.ceaseContactAt && (
                        <span className="tsub" style={{ color: "var(--red)" }}>
                          Cease contact sent
                        </span>
                      )}
                    </td>
                    <td className="tr">
                      {!a.revokedAt && manage && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setRevokeTarget({ assignmentId: a._id, accountName: a.accountName, reference: lead.reference, leadType: a.leadType })}
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <EmptyState icon="inbox" title="Not assigned">
                This lead has not been released to anyone.
              </EmptyState>
            )}
          </Card>

          <LeadDistributionRuns runs={runs} />

          <ConsentRecordCard
            consent={
              consent
                ? {
                    versionLabel: consent.versionLabel,
                    agreedAt: consent.agreedAt,
                    ipAddress: consent.ipAddress ?? null,
                    pageUrl: consent.pageUrl ?? null,
                    userAgent: consent.userAgent ?? null,
                    contentHash: consent.contentHash,
                    method: consent.method,
                    wording: extras?.consentWording ?? null,
                    wordingTitle: extras?.consentWordingTitle ?? null,
                    publishedAt: extras?.consentPublishedAt ?? null,
                  }
                : null
            }
          />

          {withdrawals.length > 0 && (
            <Card>
              <CardHeader
                title="Consent withdrawals"
                actions={
                  <Badge tone="r" dot>
                    Withdrawn
                  </Badge>
                }
              />
              <CardBody>
                <Timeline
                  items={[...withdrawals]
                    .sort((a, b) => b.requestedAt - a.requestedAt)
                    .map((w) => ({
                      key: w._id,
                      tone: "bad" as const,
                      time: formatDate(w.requestedAt, true),
                      title: WITHDRAWAL_METHOD_LABELS[w.method] ?? w.method,
                      body: `${w.note ? `${w.note} · ` : ""}${w.ceaseContactNotices} cease-contact notice${w.ceaseContactNotices === 1 ? "" : "s"} sent`,
                    }))}
                />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Actions" />
            <CardBody className="stack" style={{ gap: ".5rem" }}>
              {manage && (
                <>
                  <Button
                    variant="navy"
                    size="s"
                    full
                    icon="user"
                    disabled={!!blockedReason}
                    onClick={() => setAssignTarget({ leadId: lead._id, reference: lead.reference, leadType: lead.leadType, subtitle })}
                  >
                    Assign manually
                  </Button>
                  <Button
                    variant="out"
                    size="s"
                    full
                    icon="refresh"
                    disabled={!!blockedReason}
                    loading={requeuing === lead._id}
                    onClick={() => void requeue(lead._id, lead.reference)}
                  >
                    Re-queue for distribution
                  </Button>
                  {blockedReason && <p className="xs">{blockedReason}</p>}
                </>
              )}
              {can("distribution.read") && (
                <ButtonLink href={`/admin/simulator?leadId=${lead._id}`} variant="out" size="s" full icon="target">
                  Diagnose in simulator
                </ButtonLink>
              )}
              {manage && (
                <Button
                  variant="out"
                  size="s"
                  full
                  icon="edit"
                  onClick={() =>
                    setEditLead({
                      id: lead._id,
                      reference: lead.reference,
                      firstName: shownContact?.firstName ?? null,
                      lastName: shownContact?.lastName ?? null,
                      city: lead.city ?? null,
                      zip: lead.zip,
                      bestTimeToCall: lead.bestTimeToCall ?? null,
                      leadType: lead.leadType,
                      assignedCount: lead.assignedCount,
                    })
                  }
                >
                  Edit lead
                </Button>
              )}
              {can("suppression.manage") && (
                <Button variant="out" size="s" full icon="ban" disabled={withdrawn} onClick={() => setSuppressOpen(true)} style={{ color: withdrawn ? undefined : "var(--red)" }}>
                  {withdrawn ? "Consent already withdrawn" : "Suppress / withdraw consent"}
                </Button>
              )}
              {!manage && !can("suppression.manage") && <p className="xs">Your role can view this lead but not change it.</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Distribution" />
            <CardBody>
              <DefinitionList
                items={[
                  [
                    "Recipients",
                    lead.leadType === "exclusive"
                      ? `${active.length} of 1 — exclusive`
                      : `${active.length} of ${lead.recipientTarget} — shared standard lead`,
                  ],
                  ["First released", lead.firstAssignedAt ? formatDate(lead.firstAssignedAt, true) : "—"],
                  ["Retry step", lead.retryAttempt ? `${lead.retryAttempt}` : "—"],
                  lead.nextRetryAt ? ["Next retry", `${formatDate(lead.nextRetryAt, true)} (${timeAgo(lead.nextRetryAt, now)})`] : null,
                  lead.adminAlertedAt ? ["Admin alerted", formatDate(lead.adminAlertedAt, true)] : null,
                  lead.unassignableAt ? ["Unassignable", formatDate(lead.unassignableAt, true)] : null,
                  ["Engine", detail.engineEnabled ? "Running" : "Paused — leads held"],
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Raw payload" />
            <CardBody>
              <p className="sm" style={{ marginBottom: ".9rem" }}>
                The exact payload received at capture, stored write-once with its hash. Opening it is recorded in the audit log.
              </p>
              <Button variant="out" size="s" full icon="doc" disabled={!canSeePii || !extras?.hasRawPayload} onClick={() => setPayloadOpen(true)}>
                View raw payload
              </Button>
              {extras && !extras.hasRawPayload && (
                <p className="xs" style={{ marginTop: ".5rem" }}>
                  No external payload — this lead was {lead.source === "admin" ? "entered manually by staff" : "captured without one"}.
                </p>
              )}
              {!canSeePii && extras?.hasRawPayload && <p className="xs" style={{ marginTop: ".5rem" }}>Hidden for your role — it contains consumer contact details.</p>}
            </CardBody>
          </Card>
        </div>
      </div>

      <RevokeAssignmentModal target={revokeTarget} onClose={() => setRevokeTarget(null)} />
      <AssignLeadModal target={assignTarget} onClose={() => setAssignTarget(null)} />
      <EditLeadModal lead={editLead} onClose={() => setEditLead(null)} callTimes={reference?.formOptions.call_time ?? []} />
      <SuppressLeadModal open={suppressOpen} onClose={() => setSuppressOpen(false)} leadId={lead._id} reference={lead.reference} holders={active.length} />
      <RawPayloadModal open={payloadOpen} onClose={() => setPayloadOpen(false)} leadId={lead._id} reference={lead.reference} />
    </>
  );
}

export default function AdminLeadDetailPage() {
  return (
    <RequirePermission permission="leads.read" title="Lead">
      <LeadDetailView />
    </RequirePermission>
  );
}
