"use client";

import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { ago } from "@/components/admin/format";
import { useNow, useStaff } from "@/components/admin/hooks";
import { RevokeAssignmentModal, type RevokeTarget } from "@/components/admin/RevokeAssignmentModal";
import { PageHeader } from "@/components/layouts/PortalShell";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { LoadMore } from "@/components/ui/Navigation";
import { formatDate } from "@/domain/format";

function AssignmentLogView() {
  const { results, status, loadMore } = usePaginatedQuery(api.assignments.log, {}, { initialNumItems: 30 });
  const { can } = useStaff();
  const now = useNow();
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const manage = can("leads.manage");

  return (
    <>
      <PageHeader title="Assignment log" />
      <Alert kind="n">
        Assignment rows are <b>immutable and never deleted</b>. A revocation sets a timestamp and reason; the original row, its balance debit and the
        ranking snapshot it was made under stay exactly as written.
      </Alert>
      <div style={{ height: "1.25rem" }} />

      {status === "LoadingFirstPage" ? (
        <LoadingBlock rows={8} label="Loading assignments" />
      ) : (
        <DataTable
          caption="Assignment log"
          columns={[
            { label: "When" },
            { label: "Lead" },
            { label: "Agent" },
            { label: "Method" },
            { label: "Balance" },
            { label: "Status" },
            { label: "Opened" },
            { label: "Actions", align: "right", srOnly: true },
          ]}
          isEmpty={results.length === 0}
          empty={
            <EmptyState icon="refresh" title="No assignments yet">
              Every release — automatic or manual — is written here the moment it happens.
            </EmptyState>
          }
          footer={<LoadMore status={status} count={results.length} onLoadMore={() => loadMore(30)} />}
        >
          {results.map((a) => (
            <tr key={a._id}>
              <td className="sm nowrap">{formatDate(a.assignedAt, true)}</td>
              <td>
                <Link href={`/admin/leads/${a.leadId}`} className="mono nm nowrap">
                  {a.reference}
                </Link>
                <span className="tsub">{a.consumerName}</span>
              </td>
              <td>
                <Link href={`/admin/accounts/${a.accountId}`} className="nm">
                  {a.accountName}
                </Link>
                {a.scoreSnapshot && (
                  <span className="tsub">
                    #{a.scoreSnapshot.position} · score {a.scoreSnapshot.total}
                  </span>
                )}
              </td>
              <td>{a.method === "auto" ? <Badge tone="n">Auto</Badge> : <Badge tone="gold">Manual</Badge>}</td>
              <td className="sm nowrap">−1 {a.leadType}</td>
              <td>
                {a.revokedAt ? <StatusBadge status="revoked" /> : <StatusBadge status={a.status} />}
                {a.revokedReason && <span className="tsub">{a.revokedReason}</span>}
                {!a.revokedAt && a.ceaseContactAt && (
                  <span className="tsub" style={{ color: "var(--red)" }}>
                    Cease contact
                  </span>
                )}
              </td>
              <td className="sm nowrap">{a.openedAt ? ago(a.openedAt, now) : <span className="xs">Not opened</span>}</td>
              <td className="tr">
                {a.revokedAt ? (
                  <span className="xs">Revoked</span>
                ) : manage ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setRevokeTarget({ assignmentId: a._id, accountName: a.accountName, reference: a.reference, leadType: a.leadType })}
                  >
                    Revoke
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <RevokeAssignmentModal target={revokeTarget} onClose={() => setRevokeTarget(null)} />
    </>
  );
}

export default function AssignmentLogPage() {
  return (
    <RequirePermission permission="distribution.read" title="Assignment log">
      <AssignmentLogView />
    </RequirePermission>
  );
}
