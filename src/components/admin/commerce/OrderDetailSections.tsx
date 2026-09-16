"use client";

import type { Doc } from "@convex/_generated/dataModel";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, DefinitionList, Timeline, type TimelineItem } from "@/components/ui/Display";
import { EmptyState } from "@/components/ui/Feedback";
import { formatDate } from "@/domain/format";
import { formatMoney } from "@/domain/money";
import { ORDER_KIND_LABEL } from "./shared";

type Order = Doc<"orders">;
type Payment = Doc<"payments">;

const PAYMENT_KIND: Record<Payment["kind"], string> = {
  authorization: "Authorisation",
  capture: "Capture",
  charge: "Charge",
  refund: "Refund",
};

export function OrderLinesCard({ order, bundleName, pricingLabel }: { order: Order; bundleName: string | null; pricingLabel: string }) {
  const net = order.totalCents - order.refundedCents;
  return (
    <Card>
      <CardHeader
        title="Order lines"
        description={`${ORDER_KIND_LABEL[order.kind]}${bundleName ? ` · ${bundleName}` : ""} · priced ${formatDate(order.createdAt, true)}`}
        actions={order.provider === "mock" ? <Badge tone="gold">Test payment (bypass)</Badge> : <Badge tone="navy">Stripe</Badge>}
      />
      <DataTable
        flush
        caption="Order lines"
        columns={[{ label: "Line" }, { label: "Qty", align: "right" }, { label: "Rate", align: "right" }, { label: "Amount", align: "right" }]}
      >
        <tr>
          <td>
            <span className="nm">Exclusive leads</span>
            <span className="tsub">One agent only</span>
          </td>
          <td className="tr strong">{order.exclusiveQty}</td>
          <td className="tr sm">{formatMoney(order.exclusiveRateCents)}</td>
          <td className="tr">{formatMoney(order.exclusiveQty * order.exclusiveRateCents)}</td>
        </tr>
        <tr>
          <td>
            <span className="nm">Standard leads</span>
            <span className="tsub">Prospecting campaigns</span>
          </td>
          <td className="tr strong">{order.standardQty}</td>
          <td className="tr sm">{formatMoney(order.standardRateCents)}</td>
          <td className="tr">{formatMoney(order.standardQty * order.standardRateCents)}</td>
        </tr>
      </DataTable>
      <CardBody>
        <div className="bill" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
          <div>
            <span>List price · {order.quantity} leads</span>
            <b>{formatMoney(order.listCents)}</b>
          </div>
          {order.discountCents > 0 && (
            <div>
              <span>Bundle discount {order.discountPercent}%</span>
              <b>−{formatMoney(order.discountCents)}</b>
            </div>
          )}
          <div className="tot">
            <span>Total charged</span>
            <span>{formatMoney(order.totalCents)}</span>
          </div>
          {order.refundedCents > 0 && (
            <>
              <div>
                <span>Refunded</span>
                <b style={{ color: "var(--red)" }}>−{formatMoney(order.refundedCents)}</b>
              </div>
              <div>
                <span>Net</span>
                <b>{formatMoney(net)}</b>
              </div>
            </>
          )}
        </div>
      </CardBody>
      <CardFooter>
        <span className="xs">
          Rates are frozen on the order. Pricing version: {pricingLabel}. Mix: {order.exclusiveQty} exclusive · {order.standardQty} standard (fixed 2 in every 10).
        </span>
      </CardFooter>
    </Card>
  );
}

export function PaymentsCard({ payments }: { payments: Payment[] }) {
  return (
    <Card>
      <CardHeader title="Payments" description="Every authorisation, charge, capture and refund recorded against this order" />
      <DataTable
        flush
        caption="Payments"
        isEmpty={payments.length === 0}
        empty={
          <EmptyState icon="card" title="No payment attempts yet">
            The order has not been paid or authorised.
          </EmptyState>
        }
        columns={[{ label: "When" }, { label: "Kind" }, { label: "Amount", align: "right" }, { label: "Status" }, { label: "Detail" }, { label: "Document" }]}
      >
        {payments.map((p) => (
          <tr key={p._id}>
            <td className="sm nowrap">
              {formatDate(p.createdAt)}
              <span className="tsub">{new Date(p.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
            </td>
            <td className="sm">
              {PAYMENT_KIND[p.kind]}
              <span className="tsub nowrap">
                {[p.provider === "mock" ? "Bypass" : null, p.cardLast4 ? `${p.cardBrand ?? "Card"} ···· ${p.cardLast4}` : null].filter(Boolean).join(" · ") || "—"}
              </span>
            </td>
            <td className="tr strong" style={p.kind === "refund" ? { color: "var(--red)" } : undefined}>
              {p.kind === "refund" ? "−" : ""}
              {formatMoney(p.amountCents)}
            </td>
            <td>
              <StatusBadge status={p.status} label={p.status === "failed" ? "Declined" : undefined} />
            </td>
            <td className="sm" style={{ minWidth: "8rem" }}>
              {p.failureMessage ? (
                <span style={{ color: "var(--red)" }}>
                  {p.failureMessage}
                  {p.failureCode && <span className="tsub mono">{p.failureCode}</span>}
                </span>
              ) : (
                (p.reason ?? "—")
              )}
            </td>
            <td className="mono nowrap">{p.documentNumber ?? "—"}</td>
          </tr>
        ))}
      </DataTable>
    </Card>
  );
}

export function orderTimeline(order: Order, payments: Payment[]): TimelineItem[] {
  const events: Array<TimelineItem & { at: number }> = [
    { key: "created", at: order.createdAt, time: formatDate(order.createdAt, true), title: "Order created", body: `${order.quantity} leads priced at ${formatMoney(order.totalCents)}` },
  ];
  for (const p of [...payments].sort((a, b) => a.createdAt - b.createdAt)) {
    const time = formatDate(p.createdAt, true);
    if (p.kind === "refund") {
      events.push({ key: p._id, at: p.createdAt, time, tone: "warn", title: `Refunded ${formatMoney(p.amountCents)}`, body: [p.documentNumber, p.reason].filter(Boolean).join(" · ") });
    } else if (p.status === "failed") {
      events.push({ key: p._id, at: p.createdAt, time, tone: "bad", title: `${PAYMENT_KIND[p.kind]} declined`, body: p.failureMessage ?? undefined });
    } else if (p.status === "authorized") {
      events.push({ key: p._id, at: p.createdAt, time, title: "Payment authorised", body: "Held on the card, not yet captured" });
    } else if (p.status === "succeeded") {
      events.push({ key: p._id, at: p.createdAt, time, tone: "ok", title: p.kind === "capture" ? "Captured — leads credited" : "Paid — leads credited", body: `${order.exclusiveQty} exclusive + ${order.standardQty} standard added to the balance` });
    } else {
      events.push({ key: p._id, at: p.createdAt, time, title: `${PAYMENT_KIND[p.kind]} ${p.status.replace(/_/g, " ")}` });
    }
  }
  if (order.canceledAt) events.push({ key: "canceled", at: order.canceledAt, time: formatDate(order.canceledAt, true), title: "Cancelled" });
  if (order.status === "failed" && order.declineResolvedAt) {
    events.push({ key: "dismissed", at: order.declineResolvedAt, time: formatDate(order.declineResolvedAt, true), title: "Decline dismissed by staff", body: "No charge was taken and no leads were added" });
  }
  events.sort((a, b) => a.at - b.at);
  if (order.status === "requires_payment" || (order.status === "failed" && !order.declineResolvedAt)) {
    events.push({ key: "now", at: Number.MAX_SAFE_INTEGER, tone: "now", title: order.status === "failed" ? "Awaiting retry or dismissal" : "Awaiting payment" });
  }
  return events.map(({ at: _at, ...item }) => item);
}

export function StatusTimelineCard({ order, payments }: { order: Order; payments: Payment[] }) {
  return (
    <Card>
      <CardHeader title="Status timeline" />
      <CardBody>
        <Timeline items={orderTimeline(order, payments)} />
      </CardBody>
    </Card>
  );
}

export function OrderFactsCard({ order }: { order: Order }) {
  return (
    <Card>
      <CardHeader title="Order" actions={<StatusBadge status={order.status} label={order.status === "failed" ? "Declined" : undefined} />} />
      <CardBody>
        <DefinitionList
          items={[
            ["Invoice", <span key="n" className="mono">{order.orderNumber}</span>],
            ["Type", ORDER_KIND_LABEL[order.kind]],
            ["Leads", `${order.quantity} · ${order.exclusiveQty} ex · ${order.standardQty} std`],
            ["Total", formatMoney(order.totalCents)],
            order.refundedCents > 0 && ["Refunded", formatMoney(order.refundedCents)],
            ["Attempts", String(order.attemptCount)],
            ["Provider", order.provider === "mock" ? "Test payment (bypass)" : "Stripe"],
          ]}
        />
      </CardBody>
    </Card>
  );
}
