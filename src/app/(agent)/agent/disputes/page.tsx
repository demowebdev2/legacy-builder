"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { DataTable, StatCard } from "@/components/ui/Display";
import { EmptyState, PageLoading } from "@/components/ui/Feedback";
import { DISPUTE_REASONS } from "@/domain/constants";
import { timeAgo } from "@/domain/format";

const reasonLabel = (key: string) => DISPUTE_REASONS.find((r) => r.key === key)?.label ?? key;

export default function DisputesPage() {
  const data = useQuery(api.disputes.mine);
  const router = useRouter();

  if (data === undefined) {
    return (
      <>
        <PageHeader title="Disputes" />
        <PageLoading />
      </>
    );
  }

  const { rows, stats } = data;
  return (
    <>
      <PageHeader title="Disputes" />
      <div className="g g4" style={{ marginBottom: "1.25rem" }}>
        <StatCard label="Total raised" value={stats.total} icon="flow" />
        <StatCard label="Upheld" value={stats.upheld} icon="check" accent="green" />
        <StatCard label="Pending" value={stats.pending} icon="clock" accent="gold" />
        <StatCard label="Upheld rate" value={`${stats.upheldRate}%`} icon="trend" sub="Above 15% deprioritises you" />
      </div>

      <DataTable
        caption="Your disputes"
        isEmpty={rows.length === 0}
        empty={
          <div className="card">
            <EmptyState icon="check" title="No disputes">
              You have not needed to raise one. If a lead is unworkable, you have 72 hours from release.
            </EmptyState>
          </div>
        }
        columns={[{ label: "Lead" }, { label: "Reason" }, { label: "Raised" }, { label: "Decision" }, { label: "Lead returned" }]}
      >
        {rows.map((d) => {
          const href = `/agent/disputes/${d._id}`;
          const notes = d.decisionNotes ?? "";
          return (
            <tr key={d._id} className="clk" onClick={() => router.push(href)}>
              <td>
                <Link href={href} className="nm">
                  {d.consumerName}
                </Link>
                <span className="tsub mono">{d.reference}</span>
              </td>
              <td>{reasonLabel(d.reason)}</td>
              <td className="sm nowrap">{timeAgo(d.submittedAt)}</td>
              <td>
                <StatusBadge status={d.status} />
                {notes && (
                  <span className="tsub">
                    {notes.slice(0, 60)}
                    {notes.length > 60 ? "…" : ""}
                  </span>
                )}
              </td>
              <td>
                {d.returnLedgerEntryId ? (
                  <Badge tone="g">Returned</Badge>
                ) : d.status === "pending" ? (
                  <span className="xs">—</span>
                ) : (
                  <Badge tone="n">Stands</Badge>
                )}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}
