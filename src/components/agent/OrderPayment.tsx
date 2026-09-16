"use client";

import { useAction as useConvexAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { type PaymentOutcome, PaymentForm } from "@/components/balance/PaymentForm";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/domain/money";

/** Toast for a completed payment attempt; the order itself updates reactively. */
export function usePaymentOutcomeToast(order: Pick<Doc<"orders">, "exclusiveQty" | "standardQty">) {
  const toast = useToast();
  return (outcome: PaymentOutcome) => {
    if (outcome === "paid") toast.success("Leads added", `${order.exclusiveQty} exclusive and ${order.standardQty} standard are in your balance now.`);
    else if (outcome === "failed") toast.warn("Payment declined", "No leads were added. You can try again.");
  };
}

/** Pay (or re-pay after a decline) an existing top-up / bundle order. */
export function PayOrderForm({ order, retry }: { order: Doc<"orders">; retry?: boolean }) {
  const onComplete = usePaymentOutcomeToast(order);
  return (
    <PaymentForm
      orderId={order._id}
      amountCents={order.totalCents}
      onComplete={onComplete}
      submitLabel={retry ? `Try again — pay ${formatMoney(order.totalCents)}` : `Pay ${formatMoney(order.totalCents)}`}
    />
  );
}

/**
 * Retry a declined purchase against the saved card: Stripe off-session charge in live mode, or the bypass
 * retry in mock mode. The server re-checks ownership and that the order is still declined.
 */
export function RetryDeclinedButton({ order, label = "Retry the purchase" }: { order: Doc<"orders">; label?: string }) {
  const config = useQuery(api.payments.config);
  const retryStripe = useConvexAction(api.stripeActions.retryDeclinedOrder);
  const retryMock = useMutation(api.payments.retryMockOrder);
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try {
      if (config?.mode === "stripe") {
        const result = await retryStripe({ orderId: order._id });
        if (result.status === "paid") toast.success("Payment taken", `${order.quantity} leads were added to your balance.`);
        else toast.warn("Still declined", "The saved card was declined again. Update your card and retry.");
      } else {
        await retryMock({ orderId: order._id });
        toast.success("Payment taken", `${order.quantity} leads were added to your balance.`);
      }
    } catch (e) {
      toast.error(e, "The retry failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button variant="navy" size="s" loading={pending} disabled={config === undefined} onClick={() => void run()}>
      {label}
      {config?.mode === "mock" ? " (test)" : ""}
    </Button>
  );
}
