"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Alert } from "@/components/ui/Feedback";
import { Field, FieldGrid } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Navigation";
import { ModalButtons, ModalError, useModalSubmit } from "./kit";
import type { AdminAccount } from "./types";

/** Prototype `grantModal`, extended to removals (both are append-only ADMIN_ADJUSTMENT entries). */
export function AdjustLeadsModal({ data, onClose }: { data: AdminAccount; onClose: () => void }) {
  const adjust = useMutation(api.ledger.adjust);
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [leadType, setLeadType] = useState<"exclusive" | "standard">("standard");
  const [quantity, setQuantity] = useState("5");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ quantity?: string; reason?: string }>({});
  const qty = Number(quantity);
  const available = data.metrics.balance[leadType];

  const { submit, pending, error } = useModalSubmit(
    () => adjust({ accountId: data.account._id, leadType, direction, quantity: qty, reason: reason.trim() }),
    {
      success: direction === "credit" ? "Leads granted" : "Leads removed",
      successBody: `${qty} ${leadType} lead${qty === 1 ? "" : "s"} ${direction === "credit" ? "added to" : "removed from"} the balance.`,
      onDone: onClose,
    },
  );

  const confirm = () => {
    const next: typeof errors = {};
    if (!Number.isInteger(qty) || qty < 1 || qty > 500) next.quantity = "Enter a whole number between 1 and 500.";
    else if (direction === "debit" && qty > available) next.quantity = `Only ${available} ${leadType} lead${available === 1 ? "" : "s"} available.`;
    if (reason.trim().length < 5) next.reason = "A written reason is required for every adjustment.";
    setErrors(next);
    if (Object.keys(next).length === 0) void submit();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${direction === "credit" ? "Grant leads to" : "Remove leads from"} ${data.account.name}`}
      subtitle="Visible in the agent's own ledger with the reason you write here"
      footer={
        <ModalButtons
          onCancel={onClose}
          onConfirm={confirm}
          label={direction === "credit" ? "Grant leads" : "Remove leads"}
          variant={direction === "credit" ? "navy" : "red"}
          pending={pending}
        />
      }
    >
      <div style={{ marginBottom: ".9rem" }}>
        <Segmented
          label="Adjustment direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: "credit", label: "Add leads" },
            { value: "debit", label: "Remove leads" },
          ]}
        />
      </div>
      <FieldGrid>
        <Field label="Type" required help={`${available} currently in the balance`}>
          <select value={leadType} onChange={(e) => setLeadType(e.target.value as "exclusive" | "standard")}>
            <option value="exclusive">Exclusive</option>
            <option value="standard">Standard</option>
          </select>
        </Field>
        <Field label="Quantity" required error={errors.quantity}>
          <input
            type="number"
            min={1}
            max={500}
            step={1}
            value={quantity}
            onChange={(e) => { setQuantity(e.target.value); setErrors((x) => ({ ...x, quantity: undefined })); }}
          />
        </Field>
      </FieldGrid>
      <Field label="Reason" required error={errors.reason}>
        <input
          value={reason}
          maxLength={300}
          placeholder="Goodwill after three disputed leads"
          onChange={(e) => { setReason(e.target.value); setErrors((x) => ({ ...x, reason: undefined })); }}
        />
      </Field>
      <Alert kind="i">
        Adjustments are append-only ledger entries like any other. They never overwrite a balance — the balance is always the sum of the ledger — and like
        every other entry, they do not expire. A removal can never take a balance below zero.
      </Alert>
      <ModalError error={error} />
    </Modal>
  );
}
