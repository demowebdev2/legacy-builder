"use client";

import { usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { DataTable } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { LoadMore } from "@/components/ui/Navigation";
import { formatDate } from "@/domain/format";
import type { AdminAccount } from "./types";

export function AuditTab({ data }: { data: AdminAccount }) {
  const audit = usePaginatedQuery(api.audit.list, { accountId: data.account._id }, { initialNumItems: 30 });

  return (
    <>
      <Alert kind="n">
        The audit trail is <b>insert-only</b>. Nobody — including admins — can edit or delete these rows. Status changes, balance adjustments, licence and
        TPMO decisions, refunds and revocations on this account are all recorded here.
      </Alert>
      <div style={{ height: "1.25rem" }} />
      {audit.status === "LoadingFirstPage" ? (
        <LoadingBlock rows={6} label="Loading audit trail" />
      ) : (
        <DataTable
          caption="Audit trail for this account"
          columns={[{ label: "When" }, { label: "Actor" }, { label: "Action" }, { label: "Summary" }]}
          isEmpty={audit.results.length === 0}
          empty={
            <EmptyState icon="eye" title="No audit events">
              Nothing has been recorded against this account yet.
            </EmptyState>
          }
          footer={audit.results.length ? <LoadMore status={audit.status} count={audit.results.length} onLoadMore={() => audit.loadMore(30)} /> : undefined}
        >
          {audit.results.map((e) => (
            <tr key={e._id}>
              <td className="sm nowrap">{formatDate(e.createdAt, true)}</td>
              <td className="sm">
                <span className="nm">{e.actorName}</span>
                <span className="tsub">{e.actorRole}</span>
              </td>
              <td className="mono xs nowrap">{e.action}</td>
              <td className="sm">{e.summary}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
