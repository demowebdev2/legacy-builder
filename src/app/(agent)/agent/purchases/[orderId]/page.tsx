"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PayOrderForm, RetryDeclinedButton } from "@/components/agent/OrderPayment";
import { useAgentAccount } from "@/components/agent/useAgentAccount";
import { LEDGER_ENTRY_LABELS } from "@/components/balance/LedgerTable";
import { PageHeader } from "@/components/layouts/PortalShell";
import { StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink, ButtonRow } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, DefinitionList } from "@/components/ui/Display";
import { Alert, EmptyState, PageLoading } from "@/components/ui/Feedback";
import { formatDate } from "@/domain/format";
import { formatMoney, formatRate } from "@/domain/money";
import { useAction } from "@/hooks/useAction";

const ORDER_KIND: Record<string, string> = { opening: "Opening purchase", top_up: "Lead purchase", bundle: "Volume bundle", auto_reload: "Auto-reload" };
const PAYMENT_KIND: Record<string, string> = { authorization: "Authorisation", capture: "Capture", charge: "Charge", refund: "Refund" };

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const data = useQuery(api.orders.myOrder, { orderId: orderId as Id<"orders"> });
  const agent = useAgentAccount();
  const cancelUnpaid = useMutation(api.orders.cancelUnpaid);
  const [paying, setPaying] = useState(false);
  const [cancel, cancelling] = useAction((id: Id<"orders">) => cancelUnpaid({ orderId: id }), { success: "Order cancelled" });

  const back = (
    <ButtonLink href="/agent/purchases" variant="ghost" size="s" icon="back" style={{ marginBottom: ".9rem" }}>
      Back to billing &amp; purchases
    </ButtonLink>
  );

  if (data === undefined || agent === undefined) {
    return (
      <>
        <PageHeader title="Purchase" />
        <PageLoading />
      </>
    );
  }
  if (data === null) {
    return (
      <>
        <PageHeader title="Purchase" />
        {back}
        <div className="card">
          <EmptyState icon="warn" title="Order not found">
            That order does not exist or belongs to another account.
          </EmptyState>
        </div>
      </>
    );
  }

  const { order, payments, ledger } = data;
  const canPay = !!agent && !agent.readOnly && agent.active && !agent.producer;
  const manualKind = order.kind === "top_up" || order.kind === "bundle";

  return (
    <>
      <PageHeader title={`Purchase ${order.orderNumber}`} />
      {back}
      <div className="g g-2-1">
        <div className="stack">
          <Card>
            <CardHeader title={order.orderNumber} description={[order.label, ORDER_KIND[order.kind] ?? order.kind].filter((v, i, all) => all.indexOf(v) === i).join(" · ")} actions={<StatusBadge status={order.status} />} />
            <CardBody>
              <DefinitionList
                items={[
                  ["Created", formatDate(order.createdAt, true)],
                  data.bundleName ? ["Bundle", data.bundleName] : null,
                  order.authorizedAt ? ["Authorised", formatDate(order.authorizedAt, true)] : null,
                  order.paidAt ? ["Paid", formatDate(order.paidAt, true)] : null,
                  order.failedAt ? ["Declined", `${formatDate(order.failedAt, true)}${order.failureMessage ? ` — ${order.failureMessage}` : ""}`] : null,
                  order.canceledAt ? ["Cancelled", formatDate(order.canceledAt, true)] : null,
                  ["Payment attempts", String(order.attemptCount)],
                  order.receiptSentAt ? ["Receipt emailed", formatDate(order.receiptSentAt, true)] : null,
                ]}
              />
              <div className="bill" style={{ marginTop: "1.1rem" }}>
                <div>
                  <span>
                    {order.standardQty} standard at {formatMoney(order.standardRateCents)}
                  </span>
                  <b>{formatMoney(order.standardQty * order.standardRateCents)}</b>
                </div>
                <div>
                  <span>
                    {order.exclusiveQty} exclusive at {formatMoney(order.exclusiveRateCents)}
                  </span>
                  <b>{formatMoney(order.exclusiveQty * order.exclusiveRateCents)}</b>
                </div>
                {order.discountCents > 0 && (
                  <div>
                    <span>Bundle discount {order.discountPercent}%</span>
                    <b>−{formatMoney(order.discountCents)}</b>
                  </div>
                )}
                {order.refundedCents > 0 && (
                  <div>
                    <span>Refunded</span>
                    <b>−{formatMoney(order.refundedCents)}</b>
                  </div>
                )}
                <div className="tot">
                  <span>
                    Total · {order.quantity} leads · {formatRate(Math.round(order.totalCents / order.quantity))} each
                  </span>
                  <span>{formatMoney(order.totalCents)}</span>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payments" description="Each attempt against this order, including declines and refunds." />
            <DataTable
              flush
              caption="Payment attempts"
              isEmpty={payments.length === 0}
              empty={<EmptyState icon="card" title="No payment attempts yet">Nothing has been charged for this order.</EmptyState>}
              columns={[{ label: "When" }, { label: "Kind" }, { label: "Card" }, { label: "Amount", align: "right" }, { label: "Status" }]}
            >
              {payments.map((p) => (
                <tr key={p._id}>
                  <td className="sm nowrap">{formatDate(p.createdAt, true)}</td>
                  <td>
                    {PAYMENT_KIND[p.kind] ?? p.kind}
                    {p.documentNumber && <span className="tsub mono">{p.documentNumber}</span>}
                    {p.failureMessage && (
                      <span className="tsub" style={{ color: "var(--red)" }}>
                        {p.failureMessage}
                      </span>
                    )}
                    {p.reason && <span className="tsub">{p.reason}</span>}
                  </td>
                  <td className="sm">{p.cardLast4 ? `${p.cardBrand ?? "Card"} ···· ${p.cardLast4}` : "—"}</td>
                  <td className="tr strong">
                    {p.kind === "refund" ? "−" : ""}
                    {formatMoney(p.amountCents)}
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </DataTable>
          </Card>

          <Card>
            <CardHeader title="Ledger credits" description="The balance entries this order produced." />
            <DataTable
              flush
              caption="Ledger entries for this order"
              isEmpty={ledger.length === 0}
              empty={
                <EmptyState icon="coin" title="No leads credited">
                  {order.status === "paid" ? "Credits are being recorded." : "Leads are added to the balance only once the payment succeeds."}
                </EmptyState>
              }
              columns={[{ label: "When" }, { label: "Entry" }, { label: "Type" }, { label: "Amount", align: "right" }, { label: "Balance after", align: "right" }]}
            >
              {ledger.map((e) => (
                <tr key={e._id}>
                  <td className="sm nowrap">{formatDate(e.createdAt, true)}</td>
                  <td>
                    <span className="nm">{LEDGER_ENTRY_LABELS[e.entryType]}</span>
                    <span className="tsub">{e.reason}</span>
                  </td>
                  <td className="sm">{e.leadType === "exclusive" ? "Exclusive" : "Standard"}</td>
                  <td className="tr" style={{ fontWeight: 700, color: e.delta > 0 ? "var(--green)" : "var(--red)" }}>
                    {e.delta > 0 ? "+" : ""}
                    {e.delta}
                  </td>
                  <td className="tr sm">{e.balanceAfter}</td>
                </tr>
              ))}
            </DataTable>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader title={order.status === "failed" ? "Declined purchase" : order.status === "requires_payment" ? "Awaiting payment" : "Status"} />
            <CardBody>
              {order.status === "paid" ? (
                <Alert kind="s">
                  <b>Paid.</b> {order.exclusiveQty} exclusive and {order.standardQty} standard leads were added to your balance.
                </Alert>
              ) : order.status === "failed" ? (
                <div className="stack" style={{ gap: ".9rem" }}>
                  <Alert kind="e">
                    <b>{order.kind === "auto_reload" ? "This auto-reload was declined." : "This payment was declined."}</b>{" "}
                    {order.failureMessage ? order.failureMessage.replace(/\.?\s*$/, ". ") : ""}No leads
                    were added. Your existing balance is untouched.
                  </Alert>
                  {order.declineResolvedAt ? (
                    <p className="sm">A later payment succeeded, so this decline no longer needs action.</p>
                  ) : !canPay ? (
                    <Alert kind="w">Retries are disabled while your account is {agent?.readOnly ? "read-only" : "not active"}.</Alert>
                  ) : (
                    <>
                      <ButtonRow>
                        <RetryDeclinedButton order={order} label="Retry with the saved card" />
                        {manualKind && !paying && (
                          <Button variant="out" size="s" onClick={() => setPaying(true)}>
                            Pay with another card
                          </Button>
                        )}
                      </ButtonRow>
                      {manualKind && paying && <PayOrderForm order={order} retry />}
                      <p className="xs">Changed cards? Update the saved card on Billing &amp; purchases first, then retry.</p>
                    </>
                  )}
                </div>
              ) : order.status === "requires_payment" ? (
                manualKind && canPay ? (
                  <div className="stack" style={{ gap: ".9rem" }}>
                    {paying ? (
                      <PayOrderForm order={order} />
                    ) : (
                      <p className="sm">This order has not been paid yet. Nothing has been charged and no leads were added.</p>
                    )}
                    <ButtonRow>
                      {!paying && (
                        <Button variant="gold" size="s" onClick={() => setPaying(true)}>
                          Pay now — {formatMoney(order.totalCents)}
                        </Button>
                      )}
                      <Button variant="ghost" size="s" loading={cancelling} onClick={() => void cancel(order._id)}>
                        Cancel order
                      </Button>
                    </ButtonRow>
                  </div>
                ) : (
                  <p className="sm">This order is being processed. It updates here automatically.</p>
                )
              ) : order.status === "authorized" ? (
                <Alert kind="i">The card was authorised. It is charged when your application is approved.</Alert>
              ) : order.status === "canceled" ? (
                <Alert kind="n">This order was cancelled. Nothing was charged.</Alert>
              ) : (
                <Alert kind="n">
                  {formatMoney(order.refundedCents)} of this order was refunded. Any leads removed show on the ledger as refund reversals.
                </Alert>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Questions about this charge?" />
            <CardBody>
              <p className="sm" style={{ marginBottom: ".9rem" }}>
                Quote {order.orderNumber} and we will look into it.
              </p>
              <ButtonLink href="/agent/support" variant="out" size="s" full>
                Contact support
              </ButtonLink>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
