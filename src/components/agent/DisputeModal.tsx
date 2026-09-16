"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Chips, Field, FieldGroup } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { DISPUTE_REASONS, type DisputeReason } from "@/domain/constants";
import { timeAgo } from "@/domain/format";

/** Prototype `openDispute` modal. Auto-uphold is decided on the server (assumption D11). */
export function DisputeModal({
  open,
  onClose,
  assignmentId,
  reference,
  consumerName,
  assignedAt,
  leadType,
  now,
}: {
  open: boolean;
  onClose: () => void;
  assignmentId: Id<"leadAssignments">;
  reference: string;
  consumerName: string;
  assignedAt: number;
  leadType: "exclusive" | "standard";
  now: number;
}) {
  const submit = useMutation(api.disputes.submit);
  const toast = useToast();
  const [reason, setReason] = useState<DisputeReason>(DISPUTE_REASONS[0].key);
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);

  const onSubmit = async () => {
    setPending(true);
    try {
      const result = await submit({ assignmentId, reason, details: details.trim() || undefined });
      if (result.status === "upheld") toast.success("Dispute upheld immediately", "One lead has been returned to your balance.");
      else toast.success("Dispute submitted", "You will hear back within two business days.");
      setDetails("");
      onClose();
    } catch (e) {
      toast.error(e, "The dispute was not submitted");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Raise a dispute"
      subtitle={`Lead ${reference} · ${consumerName} · released ${timeAgo(assignedAt, now)}`}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="navy" size="s" onClick={onSubmit} loading={pending}>
            Submit dispute
          </Button>
        </>
      }
    >
      <FieldGroup label="Reason" required>
        <Chips
          options={DISPUTE_REASONS.map((r) => ({ value: r.key, label: r.label }))}
          selected={[reason]}
          onToggle={(value) => setReason(value as DisputeReason)}
        />
      </FieldGroup>
      <Field
        label="What happened?"
        help="Duplicates and out-of-area leads are checked by the system and upheld straight away when the check confirms them. Everything else, including disconnected numbers, is reviewed by our team."
      >
        <textarea
          placeholder="A sentence is enough. Anything you can evidence helps."
          value={details}
          maxLength={2000}
          onChange={(e) => setDetails(e.target.value)}
        />
      </Field>
      <Alert kind="i">
        If upheld, one {leadType} lead returns to your balance and the source that produced this lead is marked down. Decisions come within two business
        days.
      </Alert>
    </Modal>
  );
}
