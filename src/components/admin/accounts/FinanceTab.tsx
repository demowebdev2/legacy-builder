"use client";

import { useAction as useConvexAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { formatDate } from "@/domain/format";
import { formatMoney } from "@/domain/money";
import { useAction } from "@/hooks/useAction";
import { ORDER_KIND_LABELS } from "./PurchasesTab";
import { RefundModal } from "./RefundModal";
import type { AdminAccount, StaffAccess } from "./types";

export type AccountOrder = FunctionReturnType<typeof api.adminAccountViews.ordersForAccount>[number];

const PAYMENT_KIND: Record<string, string> = {
  authorization: "Card authorised",
  capture: "Captured",
  charge: "Charge",
  refund: "Refund",
};

export function FinanceTab({ data, access }: { data: AdminAccount; access: StaffAccess }) {
  const orders = useQuery(api.adminAccountViews.ordersForAccount, { accountId: data.account._id });
  const retryStripe = useConvexAction(api.stripeActions.retryDeclinedOrder);
  const retryMock = useMutation(api.payments.retryMockOrder);
  const [refunding, setRefunding] = useState<AccountOrder | null>(null);
  const [retrying, setRetrying] = useState<Id<"orders"> | null>(null);
  const canRefund = access.can("refunds.issue");
  const canRetry = access.can("purchases.retry");

  const [retry] = useAction(
    async (order: AccountOrder) => {
      setRetrying(order._id);
      try {
        if (order.provider === "mock") {
          await retryMock({ orderId: order._id });
          return "paid";
        }
        return (await retryStripe({ orderId: order._id })).status;
      } finally {
        setRetrying(null);
      }
    },
    { success: (status) => (status === "paid" ? "Purchase retried — paid" : `Retry finished: ${status}`), errorTitle: "Retry failed" },
  );

  if (orders === undefined) return <LoadingBlock rows={5} label="Loading payments" />;

  const rows = orders.flatMap((order) => order.payments.map((payment, index) => ({ order, payment, latest: index === 0 })));

  return (
    <>
      <Alert kind="w">
        <b>No automatic refund of unused balance.</b> Unused leads never expire and closing an account freezes the balance. A refund is a manual finance
        exception: written reason, partial amounts allowed, and only unused leads can be removed with it. Every refund is audited.
      </Alert>
      <div style={{ height: "1.25rem" }} />
      <DataTable
        caption="Payments and refunds"
        columns={[{ label: "Date" }, { label: "Document" }, { label: "Description" }, { label: "Amount", align: "right" }, { label: "Status" }, { label: "Actions", align: "right", srOnly: true }]}
        isEmpty={rows.length === 0}
        empty={
          <EmptyState icon="card" title="No payments yet">
            Card authorisations, captures, charges and refunds for this account appear here.
          </EmptyState>
        }
      >
        {rows.map(({ order, payment, latest }) => {
          const refund = payment.kind === "refund";
          const settled = (payment.kind === "capture" || payment.kind === "charge") && payment.status === "succeeded";
          const refundable = settled && order.refundableCents > 0 && (order.status === "paid" || order.status === "partially_refunded");
          const retryable = latest && payment.status === "failed" && order.status === "failed";
          return (
            <tr key={payment._id}>
              <td className="sm nowrap">{formatDate(payment.createdAt, true)}</td>
              <td className="mono">
                <Link href={`/admin/purchases/${order._id}`} className="nm">
                  {payment.documentNumber ?? order.orderNumber}
                </Link>
                {payment.documentNumber && <span className="tsub">for {order.orderNumber}</span>}
              </td>
              <td className="sm">
                {PAYMENT_KIND[payment.kind] ?? payment.kind} — {order.label}{order.label === ORDER_KIND_LABELS[order.kind] ? "" : ` (${ORDER_KIND_LABELS[order.kind] ?? order.kind})`}, {order.quantity} leads
                {payment.cardLast4 && <span className="tsub">{`${payment.cardBrand ?? "Card"} ending ${payment.cardLast4}`}</span>}
                {payment.reason && <span className="tsub">{payment.reason}</span>}
                {payment.failureMessage && (
                  <span className="tsub" style={{ color: "var(--red)" }}>
                    {payment.failureMessage}
                  </span>
                )}
                {order.provider === "mock" && <span className="tsub">Test payment (bypass)</span>}
              </td>
              <td className="tr strong nowrap">{formatMoney(refund ? -payment.amountCents : payment.amountCents)}</td>
              <td>
                <StatusBadge status={refund ? "refunded" : payment.status} />
                {retryable && order.declineResolvedAt && <span className="tsub">Decline dismissed</span>}
              </td>
              <td className="tr">
                <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  {canRefund && refundable && (
                    <Button variant="ghost" size="xs" onClick={() => setRefunding(order)}>
                      Refund
                    </Button>
                  )}
                  {canRetry && retryable && (
                    <Button variant="out" size="xs" icon="refresh" loading={retrying === order._id} onClick={() => void retry(order)}>
                      Retry
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </DataTable>
      {refunding && <RefundModal order={refunding} accountName={data.account.name} onClose={() => setRefunding(null)} />}
    </>
  );
}
