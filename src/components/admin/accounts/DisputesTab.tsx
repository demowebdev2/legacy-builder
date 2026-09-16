"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import { LeadTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { DataTable, StatCard } from "@/components/ui/Display";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { formatDate, timeAgo } from "@/domain/format";
import type { AdminAccount } from "./types";

export function DisputesTab({ data }: { data: AdminAccount }) {
  const rows = useQuery(api.adminAccountViews.disputesForAccount, { accountId: data.account._id });
  const router = useRouter();
  const { disputes } = data;
  const rate = disputes.total ? Math.round((disputes.upheld / disputes.total) * 100) : 0;

  return (
    <>
      <div className="g g4" style={{ marginBottom: "1.25rem" }}>
        <StatCard label="Raised" value={disputes.total} icon="flow" />
        <StatCard label="Pending" value={disputes.pending} icon="clock" accent={disputes.pending ? "gold" : null} />
        <StatCard label="Upheld" value={disputes.upheld} icon="check" accent="green" sub="A lead was returned each time" />
        <StatCard label="Upheld rate" value={`${rate}%`} icon="chart" accent={rate > 30 ? "red" : null} sub="Feeds the dispute-penalty tier" />
      </div>
      {rows === undefined ? (
        <LoadingBlock rows={4} label="Loading disputes" />
      ) : (
        <DataTable
          caption="Disputes raised by this account"
          columns={[{ label: "Lead" }, { label: "Reason" }, { label: "Type" }, { label: "Raised" }, { label: "Status" }, { label: "Decision" }]}
          isEmpty={rows.length === 0}
          empty={
            <EmptyState icon="flow" title="No disputes">
              This account has not disputed any lead.
            </EmptyState>
          }
        >
          {rows.map((d) => (
            <tr key={d._id} className="clk" onClick={() => router.push(`/admin/disputes/${d._id}`)}>
              <td className="mono nowrap">
                <Link href={`/admin/disputes/${d._id}`} className="nm" onClick={(e) => e.stopPropagation()}>
                  {d.reference}
                </Link>
                <span className="tsub" style={{ fontFamily: "var(--fb)" }}>
                  {d.consumerName}
                </span>
              </td>
              <td className="sm">
                {d.reasonLabel}
                {d.details && <span className="tsub">{d.details.length > 90 ? `${d.details.slice(0, 90)}…` : d.details}</span>}
              </td>
              <td>
                <LeadTypeBadge type={d.leadType} />
              </td>
              <td className="sm nowrap">
                {formatDate(d.submittedAt)}
                <span className="tsub">{timeAgo(d.submittedAt)}</span>
              </td>
              <td>
                <StatusBadge status={d.status} />
                {d.autoDecided && <span className="tsub">Auto-decided</span>}
              </td>
              <td className="sm">
                {d.decisionNotes ?? "—"}
                {d.decidedByName && <span className="tsub">{d.decidedByName}</span>}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
