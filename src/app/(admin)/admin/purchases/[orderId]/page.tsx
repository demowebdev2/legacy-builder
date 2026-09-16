"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useStaff } from "@/components/admin/commerce/hooks";
import { DismissDeclineModal, RefundModal, useRetryDeclined } from "@/components/admin/commerce/OrderActions";
import { OrderFactsCard, OrderLinesCard, PaymentsCard, StatusTimelineCard } from "@/components/admin/commerce/OrderDetailSections";
import { NoAccess, shortId } from "@/components/admin/commerce/shared";
import { LedgerTable } from "@/components/balance/LedgerTable";
import { PageHeader } from "@/components/layouts/PortalShell";
import { StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DefinitionList } from "@/components/ui/Display";
import { Alert, Avatar, EmptyState, PageLoading } from "@/components/ui/Feedback";
import { formatDate, timeAgo } from "@/domain/format";
import { formatMoney } from "@/domain/money";

export default function AdminOrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId as Id<"orders">;
  const wellFormed = /^[a-z0-9]{20,40}$/.test(params.orderId ?? "");
  const { loading, can } = useStaff();
  const allowed = can("payments.read");
  const data = useQuery(api.orders.adminGet, allowed && wellFormed ? { orderId } : "skip");
  const pricing = useQuery(api.pricing.adminPricing, allowed && can("pricing.manage") ? {} : "skip");
  const { retry, retrying, mode } = useRetryDeclined();
  const [modal, setModal] = useState<"refund" | "dismiss" | null>(null);

  const back = (
    <ButtonLink href="/admin/purchases" variant="ghost" size="s" icon="back">
      Purchases
    </ButtonLink>
  );

  if (!loading && !allowed) {
    return (
      <>
        <PageHeader title="Purchase" actions={back} />
        <NoAccess what="Purchase details" />
      </>
    );
  }
  if (data === undefined && wellFormed) {
    return (
      <>
        <PageHeader title="Purchase" actions={back} />
        <PageLoading />
      </>
    );
  }
  if (data === null || data === undefined) {
    return (
      <>
        <PageHeader title="Purchase not found" actions={back} />
        <div className="card">
          <EmptyState icon="card" title="This order does not exist" action={back}>
            It may have been mistyped. Orders are never deleted, so check the invoice number in the purchases list.
          </EmptyState>
        </div>
      </>
    );
  }

  const { order, payments, ledger, bundleName, account } = data;
  const refundable = order.totalCents - order.refundedCents;
  const canRefund = can("refunds.issue");
  const canRetry = can("purchases.retry");
  const refundOpen = (order.status === "paid" || order.status === "partially_refunded") && refundable > 0;
  const declineOpen = order.status === "failed" && !order.declineResolvedAt;
  const version = pricing?.history.find((h) => h._id === order.pricingVersionId);
  const pricingLabel = version ? `${formatDate(version.createdAt)} by ${version.createdByName}` : shortId(order.pricingVersionId);
  const accountName = account?.name ?? "Unknown account";
  const sortedLedger = [...ledger].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <>
      <PageHeader title={order.orderNumber} actions={back} />

      {declineOpen && (
        <div style={{ marginBottom: "1.25rem" }}>
          <Alert kind="e">
            <b>This purchase was declined{order.failedAt ? ` ${timeAgo(order.failedAt)}` : ""}</b>
            {order.failureMessage ? ` (${order.failureMessage})` : ""}. No leads were added. There is no dunning ladder — retry the charge or dismiss the decline with a note. The agent&apos;s balance is frozen, never forfeited, while a lead-flow hold applies.
          </Alert>
        </div>
      )}

      <div className="g g-2-1">
        <div className="stack">
          <OrderLinesCard order={order} bundleName={bundleName} pricingLabel={pricingLabel} />
          <PaymentsCard payments={payments} />
          <Card>
            <CardHeader title="Ledger implications" description="Balance entries written because of this order — credits on payment, reversals on refund" />
            <LedgerTable
              admin
              rows={sortedLedger}
              empty={
                <EmptyState icon="coin" title="No balance entries">
                  {order.status === "paid" || order.status === "partially_refunded" || order.status === "refunded"
                    ? "This order has no linked ledger entries."
                    : "Leads are credited only when the payment succeeds — nothing has touched the balance."}
                </EmptyState>
              }
              footer={
                <CardFooter>
                  <span className="xs">The ledger is append-only. Refunds that remove leads write compensating REFUND_REVERSAL debits — nothing is edited or deleted.</span>
                </CardFooter>
              }
            />
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Account" actions={account && <StatusBadge status={account.status} />} />
            <CardBody>
              {account ? (
                <>
                  <div className="row" style={{ marginBottom: ".9rem", flexWrap: "nowrap" }}>
                    <Avatar name={account.name} large />
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/admin/accounts/${account._id}`} className="strong link" style={{ textDecoration: "none" }}>
                        {account.name}
                      </Link>
                      <div className="xs">{account.type === "agency" ? "Agency" : "Individual agent"}</div>
                    </div>
                  </div>
                  <DefinitionList
                    items={[
                      ["Email", account.email],
                      ["Card", account.cardLast4 ? `${account.cardBrand ?? "Card"} ···· ${account.cardLast4}` : "None on file"],
                      account.declinedPurchaseOutstanding && ["Declines", <StatusBadge key="d" status="failed" label="Outstanding decline" />],
                    ]}
                  />
                  <ButtonLink href={`/admin/accounts/${account._id}`} variant="out" size="s" full className="mt-4">
                    Open account
                  </ButtonLink>
                </>
              ) : (
                <p className="sm">The account for this order could not be loaded.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Actions" />
            <CardBody className="stack" style={{ gap: ".6rem" }}>
              {refundOpen &&
                (canRefund ? (
                  <Button variant="out" size="s" full icon="refresh" onClick={() => setModal("refund")}>
                    Refund up to {formatMoney(refundable)}
                  </Button>
                ) : (
                  <p className="xs">Refunds need the finance permission to issue refunds.</p>
                ))}
              {order.status === "failed" &&
                (canRetry ? (
                  <>
                    <Button variant="navy" size="s" full loading={retrying} onClick={() => void retry(order._id)}>
                      Retry charge{mode === "mock" ? " (test payment)" : ""}
                    </Button>
                    {declineOpen && (
                      <Button variant="out" size="s" full onClick={() => setModal("dismiss")}>
                        Dismiss decline
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="xs">Retrying or dismissing a declined purchase needs the purchases retry permission.</p>
                ))}
              {!refundOpen && order.status !== "failed" && (
                <p className="sm">
                  {order.status === "refunded"
                    ? "Fully refunded. Nothing left to refund."
                    : order.status === "authorized"
                      ? "Authorised, not captured. The opening purchase is captured when the application is approved."
                      : order.status === "requires_payment"
                        ? "Awaiting payment from the agent."
                        : "No actions available for this order."}
                </p>
              )}
            </CardBody>
          </Card>

          <OrderFactsCard order={order} />
          <StatusTimelineCard order={order} payments={payments} />
        </div>
      </div>

      {modal === "refund" && <RefundModal order={order} accountName={accountName} onClose={() => setModal(null)} />}
      {modal === "dismiss" && <DismissDeclineModal order={order} onClose={() => setModal(null)} />}
    </>
  );
}
