"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { type EoDecisionTarget, EoDecisionModal, type TpmoTarget, TpmoDecisionModal } from "@/components/admin/accounts/ComplianceTab";
import { SectionBoundary, useReferenceNames, useStaffAccess } from "@/components/admin/accounts/kit";
import { type LicenceDecisionTarget, LicenceDecisionModal } from "@/components/admin/accounts/LicencesTab";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, StatCard } from "@/components/ui/Display";
import { Alert, Avatar, EmptyState, LoadingBlock, Skeleton } from "@/components/ui/Feedback";
import { formatDate, timeAgo, timeUntil } from "@/domain/format";
import { formatMoney } from "@/domain/money";
import type { BadgeTone } from "@/domain/status";

const LICENCE_TONE: Record<string, BadgeTone> = { verified: "g", unverified: "a", failed: "r", expired: "r" };

export default function VerificationPage() {
  const access = useStaffAccess();
  const canVerify = access.can("licenses.verify");
  const canDecideTpmo = access.can("tpmo.decide");
  const applications = useQuery(api.accounts.verificationQueue, canVerify ? {} : "skip");
  const licences = useQuery(api.licenses.pending, canVerify ? {} : "skip");
  const policies = useQuery(api.eoPolicies.pending, canVerify ? {} : "skip");
  const tpmo = useQuery(api.tpmo.pending, canDecideTpmo ? {} : "skip");

  if (!canVerify) {
    return (
      <>
        <PageHeader title="Verification" />
        <div className="card">
          <EmptyState icon="lock" title="No access to verification">
            Licence, E&amp;O and TPMO reviews are handled by Admin and Support staff.
          </EmptyState>
        </div>
      </>
    );
  }

  const tile = (value: number | undefined) => (value === undefined ? <Skeleton height={28} width={40} /> : value);

  return (
    <>
      <PageHeader title="Verification" />
      <Alert kind="i">
        <b>Phase 1 verification is manual.</b> Each state licence is reviewed against the state&apos;s public lookup, E&amp;O evidence against the carrier
        declarations, and Medicare TPMO requests against CMS requirements. Nothing is released to an account until its licence and E&amp;O checks pass — and
        no rule is bent for a manual assignment.
      </Alert>
      <div style={{ height: "1.25rem" }} />

      <div className="g g4" style={{ marginBottom: "1.25rem" }}>
        <StatCard label="Applications" value={tile(applications?.length)} icon="users" accent={applications?.length ? "gold" : null} sub="Pending or waiting on the applicant" />
        <StatCard label="Licence reviews" value={tile(licences?.length)} icon="badge" accent={licences?.length ? "gold" : null} sub="Unverified state licences" />
        <StatCard label="E&O reviews" value={tile(policies?.length)} icon="shield" accent={policies?.length ? "gold" : null} sub="Evidence awaiting review" />
        <StatCard
          label="TPMO requests"
          value={canDecideTpmo ? tile(tpmo?.length) : "—"}
          icon="cross"
          accent={tpmo?.length ? "gold" : null}
          sub="Medicare approvals to decide"
        />
      </div>

      <div className="stack" style={{ gap: "1.25rem" }}>
        <SectionBoundary>
          <ApplicationsCard rows={applications} />
        </SectionBoundary>
        <SectionBoundary>
          <LicencesCard rows={licences} />
        </SectionBoundary>
        <SectionBoundary>
          <EoCard rows={policies} />
        </SectionBoundary>
        {canDecideTpmo && (
          <SectionBoundary>
            <TpmoCard rows={tpmo} />
          </SectionBoundary>
        )}
      </div>
    </>
  );
}

type Applications = FunctionReturnType<typeof api.accounts.verificationQueue>;
type PendingLicences = FunctionReturnType<typeof api.licenses.pending>;
type PendingPolicies = FunctionReturnType<typeof api.eoPolicies.pending>;
type PendingTpmo = FunctionReturnType<typeof api.tpmo.pending>;

function ApplicationsCard({ rows }: { rows: Applications | undefined }) {
  const router = useRouter();
  const { stateName } = useReferenceNames();
  return (
    <Card>
      <CardHeader title="Applications" description="Oldest first. The opening purchase is authorised, not captured, until approval." />
      {rows === undefined ? (
        <div className="card-bd">
          <LoadingBlock rows={3} label="Loading applications" />
        </div>
      ) : (
        <DataTable
          flush
          caption="Applications awaiting verification"
          columns={[{ label: "Applicant" }, { label: "Applied" }, { label: "Opening purchase" }, { label: "States" }, { label: "Status" }, { label: "Open", srOnly: true, align: "right" }]}
          isEmpty={rows.length === 0}
          empty={
            <EmptyState icon="users" title="No applications waiting">
              New agent applications land here as soon as they are submitted.
            </EmptyState>
          }
        >
          {rows.map((a) => (
            <tr key={a.id} className="clk" onClick={() => router.push(`/admin/accounts/${a.id}?tab=licences`)}>
              <td>
                <div className="row" style={{ gap: ".55rem", flexWrap: "nowrap" }}>
                  <Avatar name={a.name} />
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/admin/accounts/${a.id}?tab=licences`} className="nm" onClick={(e) => e.stopPropagation()}>
                      {a.name}
                    </Link>
                    <span className="tsub">{a.type === "agency" ? "Agency" : "Individual"}</span>
                  </div>
                </div>
              </td>
              <td className="sm nowrap">
                {timeAgo(a.appliedAt)}
                <span className="tsub">{formatDate(a.appliedAt)}</span>
              </td>
              <td className="sm nowrap">
                {a.orderStatus ? <StatusBadge status={a.orderStatus} /> : <Badge tone="r">No order</Badge>}
                <span className="tsub">
                  {a.openingQuantity} leads · {formatMoney(a.orderTotalCents)}
                </span>
              </td>
              <td>
                <div className="row" style={{ gap: ".3rem" }}>
                  {a.states.length ? (
                    a.states.map((s) => (
                      <span key={s.state} title={`${stateName(s.state)} — ${s.status}`}>
                        <Badge tone={LICENCE_TONE[s.status] ?? "n"}>{s.state}</Badge>
                      </span>
                    ))
                  ) : (
                    <span className="xs">No licences</span>
                  )}
                </div>
              </td>
              <td>
                <StatusBadge status={a.status} />
              </td>
              <td className="tr">
                <ButtonLink href={`/admin/accounts/${a.id}?tab=licences`} variant="out" size="xs" iconRight="arrow" onClick={(e) => e.stopPropagation()}>
                  Review
                </ButtonLink>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Card>
  );
}

function LicencesCard({ rows }: { rows: PendingLicences | undefined }) {
  const { stateName } = useReferenceNames();
  const [target, setTarget] = useState<LicenceDecisionTarget | null>(null);
  return (
    <Card>
      <CardHeader title="Licence reviews" description="Every unverified state licence, including producer-seat licences." />
      {rows === undefined ? (
        <div className="card-bd">
          <LoadingBlock rows={3} label="Loading licences" />
        </div>
      ) : (
        <DataTable
          flush
          caption="Licences awaiting review"
          columns={[{ label: "Account" }, { label: "State" }, { label: "Number" }, { label: "Expires" }, { label: "Submitted" }, { label: "Actions", srOnly: true, align: "right" }]}
          isEmpty={rows.length === 0}
          empty={
            <EmptyState icon="badge" title="No licences to review">
              Newly submitted and renewed licences appear here.
            </EmptyState>
          }
        >
          {rows.map((l) => {
            const holder = l.memberName ?? l.accountName;
            return (
              <tr key={l._id}>
                <td>
                  <Link href={`/admin/accounts/${l.accountId}?tab=licences`} className="nm">
                    {l.accountName}
                  </Link>
                  <span className="tsub">
                    {l.memberName ? `Producer: ${l.memberName}` : "Account licence"}
                    {l.accountStatus ? ` · ${l.accountStatus.replace(/_/g, " ")}` : ""}
                  </span>
                </td>
                <td className="sm">
                  <span className="nm">{stateName(l.state)}</span>
                  <span className="tsub">{l.state}</span>
                </td>
                <td className="mono sm nowrap">{l.licenseNumber}</td>
                <td className="sm nowrap">
                  {formatDate(l.expiresAt)}
                  <span className="tsub">{timeUntil(l.expiresAt)}</span>
                </td>
                <td className="sm nowrap">{timeAgo(l.submittedAt)}</td>
                <td className="tr">
                  <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <Button variant="green" size="xs" onClick={() => setTarget({ id: l._id, state: l.state, licenseNumber: l.licenseNumber, holder, decision: "verified" })}>
                      Verify
                    </Button>
                    <Button variant="ghost" size="xs" onClick={() => setTarget({ id: l._id, state: l.state, licenseNumber: l.licenseNumber, holder, decision: "failed" })}>
                      Fail
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
      {target && <LicenceDecisionModal target={target} onClose={() => setTarget(null)} />}
    </Card>
  );
}

function EoCard({ rows }: { rows: PendingPolicies | undefined }) {
  const [target, setTarget] = useState<EoDecisionTarget | null>(null);
  return (
    <Card>
      <CardHeader title="E&O reviews" description="Open the account's Compliance tab to see the uploaded document." />
      {rows === undefined ? (
        <div className="card-bd">
          <LoadingBlock rows={3} label="Loading E&O reviews" />
        </div>
      ) : (
        <DataTable
          flush
          caption="E&O evidence awaiting review"
          columns={[{ label: "Account" }, { label: "Carrier" }, { label: "Policy" }, { label: "Expires" }, { label: "Submitted" }, { label: "Actions", srOnly: true, align: "right" }]}
          isEmpty={rows.length === 0}
          empty={
            <EmptyState icon="shield" title="No E&O evidence to review">
              Renewals and new policies appear here when an agent uploads them.
            </EmptyState>
          }
        >
          {rows.map((p) => (
            <tr key={p._id}>
              <td>
                <Link href={`/admin/accounts/${p.accountId}?tab=compliance`} className="nm">
                  {p.accountName}
                </Link>
                {p.accountStatus && <span className="tsub">{p.accountStatus.replace(/_/g, " ")}</span>}
              </td>
              <td className="sm">{p.carrier}</td>
              <td className="mono sm nowrap">{p.policyNumber ?? "—"}</td>
              <td className="sm nowrap">
                {formatDate(p.expiresAt)}
                <span className="tsub">{timeUntil(p.expiresAt)}</span>
              </td>
              <td className="sm nowrap">{timeAgo(p.submittedAt)}</td>
              <td className="tr">
                <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  <Button variant="green" size="xs" onClick={() => setTarget({ id: p._id, carrier: p.carrier, accountName: p.accountName, decision: "verified" })}>
                    Verify
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setTarget({ id: p._id, carrier: p.carrier, accountName: p.accountName, decision: "failed" })}>
                    Fail
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {target && <EoDecisionModal target={target} onClose={() => setTarget(null)} />}
    </Card>
  );
}

function TpmoCard({ rows }: { rows: PendingTpmo | undefined }) {
  const [target, setTarget] = useState<TpmoTarget | null>(null);
  return (
    <Card>
      <CardHeader title="Medicare TPMO requests" description="No Medicare lead is released to an account without an approval in force." />
      {rows === undefined ? (
        <div className="card-bd">
          <LoadingBlock rows={2} label="Loading TPMO requests" />
        </div>
      ) : (
        <DataTable
          flush
          caption="TPMO requests awaiting a decision"
          columns={[{ label: "Account" }, { label: "Requested" }, { label: "Account status" }, { label: "Actions", srOnly: true, align: "right" }]}
          isEmpty={rows.length === 0}
          empty={
            <EmptyState icon="cross" title="No TPMO requests">
              Requests appear here when an agent attests to the Medicare TPMO addendum.
            </EmptyState>
          }
        >
          {rows.map((r) => (
            <tr key={r._id}>
              <td>
                <Link href={`/admin/accounts/${r.accountId}?tab=compliance`} className="nm">
                  {r.accountName}
                </Link>
              </td>
              <td className="sm nowrap">
                {timeAgo(r.requestedAt)}
                <span className="tsub">{formatDate(r.requestedAt)}</span>
              </td>
              <td>{r.accountStatus ? <StatusBadge status={r.accountStatus} /> : "—"}</td>
              <td className="tr">
                <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  <Button variant="green" size="xs" onClick={() => setTarget({ id: r._id, accountName: r.accountName, action: "approved" })}>
                    Approve
                  </Button>
                  <Button variant="ghost" size="xs" onClick={() => setTarget({ id: r._id, accountName: r.accountName, action: "rejected" })}>
                    Reject
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {target && <TpmoDecisionModal target={target} onClose={() => setTarget(null)} />}
    </Card>
  );
}
