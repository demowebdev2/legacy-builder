"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@convex/_generated/api";
import { DecideDisputeModal, type DecideTarget } from "@/components/admin/DecideDisputeModal";
import { ago } from "@/components/admin/format";
import { useNow, useSearchParamState, useStaff } from "@/components/admin/hooks";
import { PageHeader } from "@/components/layouts/PortalShell";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { LeadTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock, PageLoading } from "@/components/ui/Feedback";
import { LoadMore, Tabs } from "@/components/ui/Navigation";

const TABS = ["pending", "upheld", "rejected", "all"] as const;
type Tab = (typeof TABS)[number];

export default function AdminDisputesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <RequirePermission permission="disputes.read" title="Disputes">
        <DisputesView />
      </RequirePermission>
    </Suspense>
  );
}

function DisputesView() {
  const router = useRouter();
  const { can } = useStaff();
  const now = useNow();
  const [params] = useSearchParamState();
  const tabParam = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "pending";
  const counts = useQuery(api.disputes.counts);
  const { results, status, loadMore } = usePaginatedQuery(api.disputes.adminList, { status: tab === "all" ? undefined : tab }, { initialNumItems: 25 });
  const [decide, setDecide] = useState<DecideTarget | null>(null);
  const canDecide = can("disputes.decide");

  const label = (t: Tab) => ({ pending: "Pending", upheld: "Upheld", rejected: "Rejected", all: "All" })[t];

  return (
    <>
      <PageHeader title="Disputes" />
      <Tabs
        label="Dispute status"
        active={tab}
        items={TABS.map((t) => ({ key: t, label: label(t), count: counts ? counts[t] : null, href: t === "pending" ? "/admin/disputes" : `/admin/disputes?tab=${t}` }))}
      />
      <Alert kind="i">
        <b>Auto-uphold only when the system can verify the claim.</b> A dispute is upheld without a human when the same agent already held a lead for this
        consumer (duplicate), or when no verified licence for the lead&rsquo;s state was in force at release — that second case is a distribution fault and
        is worth an engineering look. Everything else, including disconnected numbers, comes here for a written decision within two business days.
      </Alert>
      <div style={{ height: "1.25rem" }} />

      {status === "LoadingFirstPage" ? (
        <LoadingBlock rows={6} label="Loading disputes" />
      ) : (
        <DataTable
          caption="Disputes"
          columns={[
            { label: "Lead" },
            { label: "Agent" },
            { label: "Reason" },
            { label: "Raised" },
            { label: "Status" },
            { label: "Actions", align: "right", srOnly: true },
          ]}
          isEmpty={results.length === 0}
          empty={
            <EmptyState icon="check" title="No disputes here">
              Nothing in this state right now.
            </EmptyState>
          }
          footer={<LoadMore status={status} count={results.length} onLoadMore={() => loadMore(25)} />}
        >
          {results.map((d) => (
            <tr key={d._id} className="clk" onClick={() => router.push(`/admin/disputes/${d._id}`)}>
              <td>
                <Link href={`/admin/disputes/${d._id}`} className="mono nm nowrap" onClick={(e) => e.stopPropagation()}>
                  {d.reference}
                </Link>
                <span className="tsub">{d.consumerName}</span>
              </td>
              <td>
                <span className="nm">{d.accountName}</span>
                <span className="tsub">
                  <LeadTypeBadge type={d.leadType} />
                </span>
              </td>
              <td className="sm" style={{ maxWidth: 260 }}>
                {d.reasonLabel}
                {d.details && (
                  <span className="tsub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }} title={d.details}>
                    {d.details}
                  </span>
                )}
              </td>
              <td className="sm nowrap">
                {ago(d.submittedAt, now)}
                {d.slaRisk && (
                  <span className="tsub" style={{ color: "var(--red)", fontWeight: 600 }}>
                    SLA risk
                  </span>
                )}
              </td>
              <td>
                <StatusBadge status={d.status} />
                {d.autoDecided && <span className="tsub">Auto — system verified</span>}
              </td>
              <td className="tr" onClick={(e) => e.stopPropagation()}>
                {d.status === "pending" && canDecide ? (
                  <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <Button variant="green" size="xs" onClick={() => setDecide({ disputeId: d._id, decision: "upheld" })}>
                      Uphold
                    </Button>
                    <Button variant="out" size="xs" onClick={() => setDecide({ disputeId: d._id, decision: "rejected" })}>
                      Reject
                    </Button>
                  </div>
                ) : (
                  <span className="xs">{d.decidedByName ?? (d.status === "pending" ? "Awaiting decision" : "")}</span>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <DecideDisputeModal target={decide} onClose={() => setDecide(null)} />
    </>
  );
}
