"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import { StatusBadge } from "@/components/ui/Badge";
import { DataTable, StatCard } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { formatDate } from "@/domain/format";
import { formatMoney, formatRate } from "@/domain/money";
import type { AdminAccount } from "./types";

export const ORDER_KIND_LABELS: Record<string, string> = {
  opening: "Opening purchase",
  top_up: "Top-up",
  bundle: "Bundle",
  auto_reload: "Auto-reload",
};

export function PurchasesTab({ data }: { data: AdminAccount }) {
  const orders = useQuery(api.adminAccountViews.ordersForAccount, { accountId: data.account._id });
  const router = useRouter();
  const { metrics, preferences: prefs } = data;
  const autoReload = !!prefs?.autoReloadEnabled;

  return (
    <>
      <div className="g g4" style={{ marginBottom: "1.25rem" }}>
        <StatCard label="Leads bought" value={metrics.leadsBought || "—"} icon="coin" sub={`${metrics.orderCount} paid order${metrics.orderCount === 1 ? "" : "s"}`} />
        <StatCard label="Lifetime spend" value={formatMoney(metrics.spendCents)} icon="money" accent="gold" sub="Net of refunds" />
        <StatCard
          label="Effective rate"
          value={metrics.leadsBought ? formatRate(Math.round(metrics.spendCents / metrics.leadsBought)) : "—"}
          icon="trend"
          sub="per lead, blended"
        />
        <StatCard
          label="Auto-reload"
          value={autoReload ? "On" : "Off"}
          icon="refresh"
          accent={autoReload ? "green" : null}
          sub={prefs ? `${prefs.autoReloadQuantity} leads at ${prefs.autoReloadThreshold}` : "—"}
        />
      </div>

      <Alert kind="i">
        <b>There is no subscription record.</b> Every row below is a one-time purchase against the rates published at the time. Rates are frozen on leads
        already bought — a later rate change only touches the next order.
      </Alert>
      <div style={{ height: "1.25rem" }} />

      {orders === undefined ? (
        <LoadingBlock rows={4} label="Loading purchases" />
      ) : (
        <DataTable
          caption="Purchases"
          columns={[
            { label: "Date" },
            { label: "Invoice" },
            { label: "Order" },
            { label: "Qty", align: "right" },
            { label: "Exclusive", align: "right" },
            { label: "Standard", align: "right" },
            { label: "Status" },
            { label: "Paid", align: "right" },
          ]}
          isEmpty={orders.length === 0}
          empty={
            <EmptyState icon="card" title="No purchases yet">
              The opening purchase is captured when the application is approved.
            </EmptyState>
          }
        >
          {orders.map((o) => (
            <tr key={o._id} className="clk" onClick={() => router.push(`/admin/purchases/${o._id}`)}>
              <td className="sm nowrap">{formatDate(o.paidAt ?? o.createdAt)}</td>
              <td className="mono">
                <Link href={`/admin/purchases/${o._id}`} className="nm" onClick={(e) => e.stopPropagation()}>
                  {o.orderNumber}
                </Link>
              </td>
              <td>
                <span className="nm">{o.label}</span>
                <span className="tsub">
                  {ORDER_KIND_LABELS[o.kind] ?? o.kind} · {formatRate(Math.round(o.totalCents / Math.max(1, o.quantity)))} per lead
                  {o.discountPercent ? ` · ${o.discountPercent}% off` : ""}
                </span>
              </td>
              <td className="tr strong">{o.quantity}</td>
              <td className="tr">{o.exclusiveQty}</td>
              <td className="tr">{o.standardQty}</td>
              <td>
                <StatusBadge status={o.status} />
                {o.provider === "mock" && <span className="tsub">Test payment (bypass)</span>}
              </td>
              <td className="tr strong nowrap">
                {formatMoney(o.totalCents)}
                {o.refundedCents > 0 && <span className="tsub">{formatMoney(-o.refundedCents)} refunded</span>}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
