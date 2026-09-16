"use client";

import { useAction as useConvexAction } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { DefinitionList } from "@/components/ui/Display";
import { Alert } from "@/components/ui/Feedback";
import { Checkbox, Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/domain/format";
import { formatMoney } from "@/domain/money";
import type { AccountOrder } from "./FinanceTab";
import { ModalButtons, ModalError, parseDollars, useModalSubmit } from "./kit";

/** Prototype `refundModal`, with partial amounts and the BD-8 rule that only unused leads can be removed. */
export function RefundModal({ order, accountName, onClose }: { order: AccountOrder; accountName: string; onClose: () => void }) {
  const refundOrder = useConvexAction(api.stripeActions.refundOrder);
  const [amount, setAmount] = useState((order.refundableCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [removeLeads, setRemoveLeads] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});
  const cents = parseDollars(amount);

  const { submit, pending, error } = useModalSubmit(
    () => refundOrder({ orderId: order._id, amountCents: cents ?? 0, reason: reason.trim(), removeLeads }),
    {
      success: "Refund issued",
      successBody: (result) => `${formatMoney(cents ?? 0)} refunded — credit note ${result.creditNote}.`,
      onDone: onClose,
    },
  );

  const confirm = () => {
    const next: typeof errors = {};
    if (cents == null || cents <= 0) next.amount = "Enter an amount in dollars, e.g. 52.00.";
    else if (cents > order.refundableCents) next.amount = `At most ${formatMoney(order.refundableCents)} can be refunded.`;
    if (reason.trim().length < 5) next.reason = "Refunds need a written reason.";
    setErrors(next);
    if (Object.keys(next).length === 0) void submit();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Refund ${order.orderNumber}`}
      subtitle={`${accountName} · ${order.label}`}
      footer={<ModalButtons onCancel={onClose} onConfirm={confirm} label="Issue refund" variant="red" pending={pending} />}
    >
      <DefinitionList
        items={[
          ["Order", `${order.quantity} leads — ${order.exclusiveQty} exclusive, ${order.standardQty} standard`],
          ["Charged", formatDate(order.paidAt ?? order.createdAt, true)],
          ["Amount", formatMoney(order.totalCents)],
          order.refundedCents > 0 && ["Already refunded", formatMoney(order.refundedCents)],
          ["Refundable", formatMoney(order.refundableCents)],
        ]}
      />
      <Field label="Refund amount (USD)" required error={errors.amount} className="mt-4" help={`Up to ${formatMoney(order.refundableCents)}. Partial refunds are allowed.`}>
        <input inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setErrors((x) => ({ ...x, amount: undefined })); }} />
      </Field>
      <Field label="Reason" required error={errors.reason}>
        <input
          value={reason}
          maxLength={200}
          placeholder="Goodwill — service disruption"
          onChange={(e) => { setReason(e.target.value); setErrors((x) => ({ ...x, reason: undefined })); }}
        />
      </Field>
      <Checkbox checked={removeLeads} onChange={setRemoveLeads}>
        Also remove the leads this order added to the balance <b>(only unused leads)</b> — never more than the order credited or than the balance holds.
      </Checkbox>
      <Alert kind="w">
        Refunds are manual finance exceptions. There is no automatic refund of unused balance when an account closes or goes quiet.
      </Alert>
      {order.provider === "mock" && (
        <div style={{ marginTop: ".6rem" }}>
          <Alert kind="n">
            <b>Test payment (bypass).</b> No card is refunded — the refund, credit note and any lead removal are recorded exactly as in production.
          </Alert>
        </div>
      )}
      <ModalError error={error} />
    </Modal>
  );
}
