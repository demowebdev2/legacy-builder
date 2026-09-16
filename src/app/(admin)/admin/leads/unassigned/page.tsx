"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo } from "react";
import { api } from "@convex/_generated/api";
import { ago, formatMinutesLong, formatMinutesShort } from "@/components/admin/format";
import { useNow, useStaff } from "@/components/admin/hooks";
import { useRequeue } from "@/components/admin/useRequeue";
import { PageHeader } from "@/components/layouts/PortalShell";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { LeadTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DataTable, StatCard } from "@/components/ui/Display";
import { Alert, EmptyState, PageLoading } from "@/components/ui/Feedback";
import { timeAgo } from "@/domain/format";
import { formatMoney } from "@/domain/money";

function UnassignedView() {
  const data = useQuery(api.leads.unassigned);
  const { can } = useStaff();
  const now = useNow();
  const [requeue, requeuingId] = useRequeue();

  const actions = useMemo(
    () =>
      can("leads.manage") ? (
        <ButtonLink href="/admin/leads?create=1" variant="navy" size="s" icon="plus">
          New lead
        </ButtonLink>
      ) : undefined,
    [can],
  );

  if (data === undefined) {
    return (
      <>
        <PageHeader title="Unassigned leads" actions={actions} />
        <PageLoading />
      </>
    );
  }

  const { rows, retrySchedule, adminAlertAfterMinutes, unassignableAfterMinutes } = data;
  const spend = rows.reduce((s, r) => s + r.acquisitionCostCents, 0);
  const ladder = retrySchedule.map(formatMinutesShort);
  const ladderRange = ladder.length ? `${ladder[0]} → ${ladder[ladder.length - 1]}` : "not configured";

  return (
    <>
      <PageHeader title="Unassigned leads" actions={actions} />
      <Alert kind="w">
        <b>This queue is acquisition cost sitting idle.</b> Each of these leads cost real money to acquire and no agent could take it — or, for a shared
        standard lead, not every recipient slot could be filled. The retry ladder runs {ladderRange}; an admin is alerted after{" "}
        {formatMinutesLong(adminAlertAfterMinutes)}, and after {formatMinutesLong(unassignableAfterMinutes)} a lead becomes unassignable. Nothing is ever
        deleted.
      </Alert>

      <div className="g g4" style={{ margin: "1.25rem 0" }}>
        <StatCard label="Waiting" value={rows.length} icon="warn" accent="red" />
        <StatCard label="Spend at risk" value={formatMoney(spend)} icon="money" accent="red" />
        <StatCard
          label="Oldest"
          value={rows.length ? ago(rows[0].capturedAt, now).replace(" ago", "") : "—"}
          icon="clock"
          sub={`Alert threshold is ${formatMinutesShort(adminAlertAfterMinutes)}`}
        />
        <StatCard label="Retry ladder" value={retrySchedule.length} unit="steps" icon="refresh" sub={ladder.join(", ") || "—"} />
      </div>

      <DataTable
        caption="Unassigned leads"
        columns={[
          { label: "Reference" },
          { label: "Product" },
          { label: "Where" },
          { label: "Type" },
          { label: "Waiting" },
          { label: "Why nobody took it" },
          { label: "Actions", align: "right", srOnly: true },
        ]}
        isEmpty={rows.length === 0}
        empty={
          <EmptyState icon="check" title="Nothing waiting">
            Every captured lead has found an eligible agent.
          </EmptyState>
        }
      >
        {rows.map((l) => (
          <tr key={l.id}>
            <td>
              <Link href={`/admin/leads/${l.id}`} className="mono nm nowrap">
                {l.reference}
              </Link>
              <span className="tsub">{l.name}</span>
            </td>
            <td className="sm">{l.coverageName}</td>
            <td className="sm">
              {l.city ? `${l.city}, ` : ""}
              {l.state}
            </td>
            <td>
              <LeadTypeBadge type={l.leadType} />
              {l.status === "partially_assigned" && (
                <span className="tsub">
                  {l.assignedCount} of {l.recipientTarget} filled
                </span>
              )}
            </td>
            <td className="sm nowrap">
              {ago(l.capturedAt, now)}
              <span className="tsub">
                {l.status === "unassignable" ? (
                  <StatusBadge status="unassignable" />
                ) : l.nextRetryAt ? (
                  `Retry ${l.retryAttempt + 1} ${l.nextRetryAt > now ? timeAgo(l.nextRetryAt, now) : "due now"}`
                ) : l.retryAttempt >= retrySchedule.length ? (
                  "Retry ladder finished"
                ) : (
                  `Retry step ${l.retryAttempt} of ${retrySchedule.length}`
                )}
              </span>
            </td>
            <td className="sm" style={{ maxWidth: 280 }}>
              {l.reason}
            </td>
            <td className="tr">
              <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                {can("distribution.read") && (
                  <ButtonLink href={`/admin/simulator?leadId=${l.id}`} variant="out" size="xs">
                    Diagnose
                  </ButtonLink>
                )}
                {can("leads.manage") && (
                  <Button variant="navy" size="xs" loading={requeuingId === l.id} disabled={!!requeuingId} onClick={() => void requeue(l.id, l.reference)}>
                    Re-queue
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}

export default function UnassignedLeadsPage() {
  return (
    <RequirePermission permission="leads.read" title="Unassigned leads">
      <UnassignedView />
    </RequirePermission>
  );
}
