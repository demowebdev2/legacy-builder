"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense } from "react";
import { api } from "@convex/_generated/api";
import { useStaff, useTabParam } from "@/components/admin/commerce/hooks";
import { NoAccess, ORDER_KIND_LABEL } from "@/components/admin/commerce/shared";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { DataTable, StatCard } from "@/components/ui/Display";
import { EmptyState, LoadingBlock, PageLoading } from "@/components/ui/Feedback";
import { LoadMore, Tabs } from "@/components/ui/Navigation";
import { formatDate } from "@/domain/format";
import { formatMoney, formatRate } from "@/domain/money";

const TABS = ["all", "opening", "bundle", "top_up", "auto_reload", "declined"] as const;
type Tab = (typeof TABS)[number];

const EMPTY: Record<Tab, [string, string]> = {
  all: ["No purchases yet", "Opening purchases are captured when an application is approved."],
  opening: ["No opening purchases", "Opening purchases are authorised at application and captured on approval."],
  bundle: ["No bundle purchases", "Bundles bought from the agent portal appear here."],
  top_up: ["No top-ups", "Quantity purchases bought from the agent portal appear here."],
  auto_reload: ["No auto-reloads", "Auto-reload charges run when an agent's balance falls to their threshold."],
  declined: ["No declined purchases", "Every purchase and auto-reload has settled."],
};

export default function AdminPurchasesPage() {
  return (
    <>
      <PageHeader title="Purchases" />
      <Suspense fallback={<PageLoading />}>
        <Purchases />
      </Suspense>
    </>
  );
}

function Purchases() {
  const { loading, can } = useStaff();
  const allowed = can("payments.read");
  const [tab, setTab] = useTabParam(TABS, "all");
  const summary = useQuery(api.orders.adminSummary, allowed ? {} : "skip");

  if (!loading && !allowed) return <NoAccess what="Purchases" />;
  if (summary === undefined) return <PageLoading />;

  const average = summary.paidCount ? Math.round(summary.valueCents / summary.paidCount) : null;
  return (
    <>
      <Tabs
        label="Purchase type"
        active={tab}
        onChange={setTab}
        items={[
          { key: "all", label: "All", count: summary.total },
          { key: "opening", label: "Opening", count: summary.opening },
          { key: "bundle", label: "Bundles", count: summary.bundle },
          { key: "top_up", label: "Top-ups", count: summary.topUp },
          { key: "auto_reload", label: "Auto-reload", count: summary.autoReload },
          { key: "declined", label: "Declined", count: summary.declined },
        ]}
      />
      <div className="g g4" style={{ marginBottom: "1.25rem" }}>
        <StatCard label="Orders" value={summary.total} icon="card" sub={`${summary.paidCount} paid`} />
        <StatCard label="Leads sold" value={summary.leadsSold} icon="coin" accent="gold" />
        <StatCard label="Value" value={formatMoney(summary.valueCents)} icon="money" accent="green" sub="Paid, net of refunds" />
        <StatCard
          label="Average order"
          value={average == null ? "—" : formatMoney(average)}
          icon="trend"
          sub={summary.paidCount ? `${Math.round(summary.leadsSold / summary.paidCount)} leads each` : undefined}
        />
      </div>
      <OrdersTable key={tab} tab={tab} />
    </>
  );
}

function OrdersTable({ tab }: { tab: Tab }) {
  const router = useRouter();
  const args = tab === "all" ? {} : tab === "declined" ? { status: "failed" as const } : { kind: tab };
  const { results, status, loadMore } = usePaginatedQuery(api.orders.adminList, args, { initialNumItems: 25 });

  if (status === "LoadingFirstPage") return <LoadingBlock rows={6} label="Loading purchases" />;
  const [title, body] = EMPTY[tab];

  return (
    <DataTable
      caption="Purchases"
      isEmpty={results.length === 0}
      empty={
        <EmptyState icon="card" title={title}>
          {body}
        </EmptyState>
      }
      columns={[
        { label: "Date" },
        { label: "Account" },
        { label: "Invoice" },
        { label: "Order" },
        { label: "Qty", align: "right" },
        { label: "Split" },
        { label: "Amount", align: "right" },
        { label: "Status" },
      ]}
      footer={<LoadMore status={status} onLoadMore={() => loadMore(25)} count={results.length} />}
    >
      {results.map((o) => (
        <tr key={o._id} className="clk" onClick={() => router.push(`/admin/purchases/${o._id}`)}>
          <td className="sm nowrap">
            <Link href={`/admin/purchases/${o._id}`} className="rowlink" onClick={(e) => e.stopPropagation()}>
              {formatDate(o.createdAt)}
              <span className="sr-only"> — open order {o.orderNumber}</span>
            </Link>
          </td>
          <td>
            <span className="nm">{o.accountName}</span>
            <span className="tsub">{o.accountType === "agency" ? "Agency" : "Individual"}</span>
          </td>
          <td className="mono nowrap">{o.orderNumber}</td>
          <td className="sm">
            {o.label}
            <span className="tsub">
              {o.label !== ORDER_KIND_LABEL[o.kind] ? `${ORDER_KIND_LABEL[o.kind]} · ` : ""}{formatRate(Math.round(o.totalCents / o.quantity))} per lead
            </span>
          </td>
          <td className="tr strong">{o.quantity}</td>
          <td className="sm nowrap">
            {o.exclusiveQty} ex · {o.standardQty} std
          </td>
          <td className="tr strong">
            {formatMoney(o.totalCents)}
            {o.refundedCents > 0 && <span className="tsub">−{formatMoney(o.refundedCents)} refunded</span>}
          </td>
          <td>
            <div className="row" style={{ gap: ".3rem" }}>
              <StatusBadge status={o.status} label={o.status === "failed" ? "Declined" : undefined} />
              {o.status === "failed" && o.declineResolvedAt && <Badge tone="n">Dismissed</Badge>}
            </div>
            {o.status === "failed" && o.failureMessage && (
              <span className="tsub" style={{ color: "var(--red)" }}>
                {o.failureMessage}
              </span>
            )}
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
