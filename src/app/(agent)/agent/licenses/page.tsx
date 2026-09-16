"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { EoRenewalModal, LicenseModal, TpmoRequestModal } from "@/components/agent/ComplianceModals";
import { type AgentAccount, useAgentAccount, useMountTime } from "@/components/agent/useAgentAccount";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, DefinitionList } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock, PageLoading } from "@/components/ui/Feedback";
import { daysUntil, formatDate, timeUntil } from "@/domain/format";

export default function LicensesPage() {
  const agent = useAgentAccount();
  if (agent === undefined) {
    return (
      <>
        <PageHeader title="Licences & compliance" />
        <PageLoading />
      </>
    );
  }
  if (!agent) return <PageHeader title="Licences & compliance" />;
  return <LicensesView agent={agent} />;
}

function LicensesView({ agent }: { agent: AgentAccount }) {
  const title = agent.producer ? "My licences" : "Licences & compliance";
  const licenses = useQuery(api.licenses.myLicenses);
  const reference = useQuery(api.referenceData.publicData);
  const now = useMountTime();
  const [licenseModal, setLicenseModal] = useState<{ state?: string } | null>(null);

  const stateName = useMemo(() => {
    const map = new Map((reference?.states ?? []).map((s) => [s.code, s.name]));
    return (code: string) => map.get(code) ?? code;
  }, [reference]);

  if (licenses === undefined) {
    return (
      <>
        <PageHeader title={title} />
        <PageLoading />
      </>
    );
  }

  const rows = agent.producer ? licenses.mine : licenses.account;

  const table = (
    <Card>
      <CardHeader
        title="State licences"
        description={agent.producer ? "The states you personally hold a licence in. Your principal can only hand you leads in verified states." : "A state can receive leads only while its licence is verified and in date."}
      />
      <DataTable
        flush
        caption="State licences"
        isEmpty={rows.length === 0}
        empty={
          <EmptyState icon="badge" title="No licences on file">
            Add each state you are licensed in. Our licensing team reviews it before the state unlocks.
          </EmptyState>
        }
        columns={[{ label: "State" }, { label: "Licence number" }, { label: "Expires" }, { label: "Verification" }, { label: "Action", srOnly: true }]}
      >
        {rows.map((l: Doc<"licenses">) => {
          const days = daysUntil(l.expiresAt, now);
          const lapsed = l.expiresAt <= now;
          return (
            <tr key={l._id}>
              <td>
                <span className="nm">{stateName(l.state)}</span>
                <span className="tsub mono">{l.state}</span>
              </td>
              <td className="mono sm">{l.licenseNumber}</td>
              <td className="nowrap">
                {formatDate(l.expiresAt)}
                <span className="tsub" style={lapsed || days < 60 ? { color: lapsed ? "var(--red)" : "var(--amber)" } : undefined}>
                  {lapsed ? `Expired ${timeUntil(l.expiresAt, now)}` : timeUntil(l.expiresAt, now)}
                </span>
              </td>
              <td>
                <StatusBadge status={lapsed && l.verificationStatus === "verified" ? "expired" : l.verificationStatus} />
                {l.verificationNotes ? (
                  <span className="tsub">{l.verificationNotes}</span>
                ) : l.verificationStatus === "unverified" ? (
                  <span className="tsub">Awaiting review</span>
                ) : null}
              </td>
              <td className="tr">
                <Button variant="ghost" size="xs" onClick={() => setLicenseModal({ state: l.state })}>
                  Renew
                </Button>
              </td>
            </tr>
          );
        })}
      </DataTable>
      <CardFooter>
        <span className="xs">Licences are reviewed by our licensing team. A renewal replaces the record once it is verified.</span>
        <Button variant="out" size="s" icon="plus" onClick={() => setLicenseModal({})}>
          Add or renew a licence
        </Button>
      </CardFooter>
    </Card>
  );

  return (
    <>
      <PageHeader title={title} />
      {agent.readOnly && (
        <div style={{ marginBottom: "1.25rem" }}>
          <Alert kind="w">
            Your account is read-only. You can still send licence and E&amp;O renewal evidence — that is how a compliance suspension is lifted.
          </Alert>
        </div>
      )}
      {agent.producer ? (
        table
      ) : (
        <div className="g g-2-1">
          <div className="stack">{table}</div>
          <div className="stack">
            <EoCard now={now} />
            <TpmoCard readOnly={agent.readOnly} />
          </div>
        </div>
      )}
      {licenseModal && reference && (
        <LicenseModal
          open
          onClose={() => setLicenseModal(null)}
          states={reference.servicedStates}
          initialState={licenseModal.state}
          producer={agent.producer}
        />
      )}
    </>
  );
}

function EoCard({ now }: { now: number }) {
  const policies = useQuery(api.eoPolicies.mine);
  const [open, setOpen] = useState(false);
  if (policies === undefined) return <LoadingBlock rows={4} />;

  const live = policies.filter((p) => !p.supersededAt);
  const current = live.find((p) => p.verificationStatus === "verified") ?? live[0] ?? null;
  const pendingRenewal = live.find((p) => p.verificationStatus === "unverified" && p !== current && (!current || p.submittedAt > current.submittedAt));
  const days = current ? daysUntil(current.expiresAt, now) : null;
  const lapsed = current ? current.expiresAt <= now : false;

  return (
    <Card>
      <CardHeader
        title="E&O cover"
        actions={current ? <StatusBadge status={lapsed && current.verificationStatus === "verified" ? "expired" : current.verificationStatus} /> : <Badge tone="r">Missing</Badge>}
      />
      <CardBody>
        {current ? (
          <DefinitionList
            items={[
              ["Carrier", current.carrier],
              ["Policy", current.policyNumber ? <span key="p" className="mono">{current.policyNumber}</span> : "—"],
              ["Expires", `${formatDate(current.expiresAt)} (${lapsed ? `expired ${timeUntil(current.expiresAt, now)}` : timeUntil(current.expiresAt, now)})`],
              ["Submitted", formatDate(current.submittedAt)],
              current.verificationNotes ? ["Notes", current.verificationNotes] : null,
            ]}
          />
        ) : (
          <p className="sm">No E&amp;O policy is on file. Leads cannot be released without current cover.</p>
        )}
        {current && lapsed ? (
          <div style={{ marginTop: ".9rem" }}>
            <Alert kind="e">
              <b>E&amp;O cover has lapsed.</b> Lead flow is halted across all states until a renewal is verified.
            </Alert>
          </div>
        ) : current && days != null && days < 60 ? (
          <div style={{ marginTop: ".9rem" }}>
            <Alert kind="w">
              <b>E&amp;O cover expires {timeUntil(current.expiresAt, now)}.</b> Lead flow halts across all states the day it lapses — upload your renewal
              before then.
            </Alert>
          </div>
        ) : null}
        {pendingRenewal && (
          <div style={{ marginTop: ".9rem" }}>
            <Alert kind="i">
              Renewal from {pendingRenewal.carrier} (expires {formatDate(pendingRenewal.expiresAt)}) submitted {formatDate(pendingRenewal.submittedAt)} — awaiting
              review.
            </Alert>
          </div>
        )}
        <Button variant="out" size="s" full style={{ marginTop: "1rem" }} onClick={() => setOpen(true)}>
          Upload renewal
        </Button>
      </CardBody>
      {open && <EoRenewalModal open onClose={() => setOpen(false)} />}
    </Card>
  );
}

function TpmoCard({ readOnly }: { readOnly: boolean }) {
  const tpmo = useQuery(api.tpmo.mine);
  const [open, setOpen] = useState(false);
  if (tpmo === undefined) return <LoadingBlock rows={3} />;

  const latest = tpmo.history[0] ?? null;
  const approvedRow = tpmo.history.find((r) => r.status === "approved" && !r.revokedAt);
  const pendingRow = tpmo.history.find((r) => r.status === "requested");

  return (
    <Card>
      <CardHeader
        title="Medicare TPMO"
        actions={
          tpmo.approved ? (
            <Badge tone="g" dot>
              Approved
            </Badge>
          ) : tpmo.pending ? (
            <Badge tone="a" dot>
              Requested
            </Badge>
          ) : (
            <Badge tone="n">Not requested</Badge>
          )
        }
      />
      <CardBody>
        {tpmo.approved ? (
          <p className="sm">
            Approved{approvedRow?.decidedAt ? ` on ${formatDate(approvedRow.decidedAt)}` : ""}. Medicare leads can be released to you when your licences and
            preferences match.
          </p>
        ) : tpmo.pending ? (
          <p className="sm">
            Requested on {formatDate(pendingRow?.requestedAt)}. Our compliance team is reviewing it — Medicare leads start once it is approved.
          </p>
        ) : (
          <>
            <p className="sm" style={{ marginBottom: ".9rem" }}>
              Medicare leads are only released to accounts approved as a Third-Party Marketing Organization partner. Request it once and sign the
              addendum.
            </p>
            {latest && (latest.status === "rejected" || latest.status === "revoked") && (
              <div style={{ marginBottom: ".9rem" }}>
                <Alert kind="w">
                  Your last request was {latest.status}
                  {latest.decisionNotes ? `: ${latest.decisionNotes}` : "."}
                </Alert>
              </div>
            )}
            {readOnly ? (
              <Alert kind="w">TPMO requests are disabled while your account is read-only.</Alert>
            ) : (
              <Button variant="navy" size="s" full onClick={() => setOpen(true)}>
                Request TPMO approval
              </Button>
            )}
          </>
        )}
      </CardBody>
      {open && <TpmoRequestModal open onClose={() => setOpen(false)} addendum={tpmo.addendum} />}
    </Card>
  );
}
