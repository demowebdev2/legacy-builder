"use client";

import { useAction as useConvexAction, useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { DefinitionList } from "@/components/ui/Display";
import { Alert } from "@/components/ui/Feedback";
import { Checkbox, Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/domain/format";
import { formatMoney } from "@/domain/money";
import { useAction } from "@/hooks/useAction";
import { centsToInput, inputToCents } from "./shared";

export interface OrderSummary {
  _id: Id<"orders">;
  orderNumber: string;
  label: string;
  quantity: number;
  exclusiveQty: number;
  standardQty: number;
  totalCents: number;
  refundedCents: number;
  paidAt?: number;
  createdAt: number;
  provider: "stripe" | "mock";
}

/**
 * Retry a declined off-session purchase. Stripe mode charges the saved card through the Node action;
 * bypass mode completes the order with a simulated test payment.
 */
export function useRetryDeclined() {
  const config = useQuery(api.payments.config);
  const retryStripe = useConvexAction(api.stripeActions.retryDeclinedOrder);
  const retryMock = useMutation(api.payments.retryMockOrder);
  const toast = useToast();
  const [run, pending] = useAction(async (orderId: Id<"orders">) => {
    if (config?.mode === "stripe") {
      const result = await retryStripe({ orderId });
      if (result.status !== "paid") {
        toast.warn("The charge did not go through", "The card was declined again. The order stays declined; the agent can update their card.");
        return false;
      }
    } else {
      await retryMock({ orderId });
    }
    toast.success("Charge retried", config?.mode === "stripe" ? "Payment succeeded and the leads were added." : "Test payment (bypass) succeeded and the leads were added.");
    return true;
  });
  return { retry: run, retrying: pending, mode: config?.mode ?? null };
}

/** Prototype `refundModal`, against a real order: partial amounts, written reason, optional lead removal. */
export function RefundModal({ order, accountName, onClose }: { order: OrderSummary; accountName: string; onClose: () => void }) {
  const refundOrder = useConvexAction(api.stripeActions.refundOrder);
  const refundable = order.totalCents - order.refundedCents;
  const [amount, setAmount] = useState(centsToInput(refundable));
  const [reason, setReason] = useState("");
  const [removeLeads, setRemoveLeads] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const cents = inputToCents(amount);
  const amountError = cents == null || cents > refundable ? `Enter an amount between $0.01 and ${formatMoney(refundable)}.` : null;
  const reasonError = reason.trim().length < 5 ? "Refunds need a written reason (at least 5 characters)." : null;

  const [submit, pending] = useAction(
    async (amountCents: number) => {
      const result = await refundOrder({ orderId: order._id, amountCents, reason: reason.trim(), removeLeads });
      return result.creditNote;
    },
    {
      success: "Refund issued",
      successBody: order.provider === "mock" ? "Recorded as a test refund (bypass) — no card was touched." : "Returned to the card on file through Stripe.",
    },
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (amountError || reasonError || cents == null) return;
    if (await submit(cents)) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Refund ${order.orderNumber}`}
      subtitle={`${accountName} · ${order.label}`}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="red" size="s" type="submit" form="refund-form" loading={pending}>
            Issue refund
          </Button>
        </>
      }
    >
      <form id="refund-form" onSubmit={onSubmit} noValidate>
        <DefinitionList
          items={[
            ["Order", `${order.quantity} leads · ${order.exclusiveQty} exclusive, ${order.standardQty} standard`],
            ["Charged", formatDate(order.paidAt ?? order.createdAt, true)],
            ["Paid", formatMoney(order.totalCents)],
            order.refundedCents > 0 && ["Already refunded", formatMoney(order.refundedCents)],
            ["Refundable", formatMoney(refundable)],
          ]}
        />
        <div style={{ height: "1rem" }} />
        <Field label="Amount (USD)" required error={submitted ? amountError : null} help={`Partial refunds are allowed, up to ${formatMoney(refundable)}.`}>
          <input type="number" inputMode="decimal" min="0.01" max={refundable / 100} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Reason" required error={submitted ? reasonError : null}>
          <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Goodwill — service disruption" />
        </Field>
        <Checkbox checked={removeLeads} onChange={setRemoveLeads}>
          <b>Also remove the unused leads this order added.</b> Removes at most {order.exclusiveQty} exclusive and {order.standardQty} standard, and never more than
          is still unused in the balance.
        </Checkbox>
        <div style={{ height: ".6rem" }} />
        <Alert kind="i">
          Refunds are a manual, audited finance decision. Unused balance is never refunded automatically (BD-8), and leads already released stay with the agent.
          A credit note number is issued and the agent is notified.
        </Alert>
      </form>
    </Modal>
  );
}

/** Close out a declined purchase without charging it (e.g. the agent bought a replacement). */
export function DismissDeclineModal({ order, onClose }: { order: OrderSummary; onClose: () => void }) {
  const resolveDecline = useMutation(api.orders.resolveDecline);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const noteError = note.trim().length < 5 ? "A note of at least 5 characters is required." : null;
  const [submit, pending] = useAction(
    async () => {
      await resolveDecline({ orderId: order._id, note: note.trim() });
      return true;
    },
    { success: "Decline dismissed", successBody: "The order stays declined in the history. No leads were added." },
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (noteError) return;
    if (await submit()) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Dismiss decline on ${order.orderNumber}`}
      subtitle={`${formatMoney(order.totalCents)} · ${order.quantity} leads`}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="navy" size="s" type="submit" form="dismiss-form" loading={pending}>
            Dismiss decline
          </Button>
        </>
      }
    >
      <form id="dismiss-form" onSubmit={onSubmit} noValidate>
        <Field label="Note" required error={submitted ? noteError : null} help="Recorded in the audit log.">
          <textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Agent bought a replacement bundle the same day" />
        </Field>
        <Alert kind="i">
          Dismissing clears the declined-purchase flag once no other decline is open on the account, which lifts the lead-flow hold. It does not charge the card
          and does not add leads.
        </Alert>
      </form>
    </Modal>
  );
}
