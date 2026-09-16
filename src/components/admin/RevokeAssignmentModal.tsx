"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Checkbox, Field, Select } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { REVOKE_REASONS } from "@/domain/constants";
import { errorMessage } from "@/lib/errors";

export interface RevokeTarget {
  assignmentId: Id<"leadAssignments">;
  accountName: string;
  reference: string;
  leadType: string;
}

/** Prototype `revokeModal`. Rendered only while a target is set so its form state resets each time. */
export function RevokeAssignmentModal({ target, onClose }: { target: RevokeTarget | null; onClose: () => void }) {
  if (!target) return null;
  return <RevokeDialog target={target} onClose={onClose} />;
}

function RevokeDialog({ target, onClose }: { target: RevokeTarget; onClose: () => void }) {
  const revoke = useMutation(api.assignments.revoke);
  const toast = useToast();
  const [reason, setReason] = useState<string>(REVOKE_REASONS[0]);
  const [returnLead, setReturnLead] = useState(true);
  const [requeue, setRequeue] = useState(true);
  const [pending, setPending] = useState(false);
  const [alreadyReturned, setAlreadyReturned] = useState(false);

  const submit = async () => {
    setPending(true);
    try {
      const result = await revoke({ assignmentId: target.assignmentId, reason, returnLead, requeue });
      const assigned = result.requeue?.assigned ?? [];
      toast.warn(
        "Assignment revoked",
        assigned.length
          ? `${target.accountName} has been told to cease contact. Re-released to ${assigned.join(", ")}.`
          : requeue
            ? `${target.accountName} has been told to cease contact. Nobody else was eligible — the lead is back in the retry ladder.`
            : `${target.accountName} has been told to cease contact.`,
      );
      onClose();
    } catch (error) {
      const message = errorMessage(error);
      if (returnLead && /already been returned/i.test(message)) {
        // The balance was already credited by an upheld dispute — returning it again would double-credit.
        setAlreadyReturned(true);
        setReturnLead(false);
      } else {
        toast.error(error, "Could not revoke");
      }
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Revoke this assignment"
      subtitle={`${target.accountName} · lead ${target.reference}`}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="red" size="s" onClick={() => void submit()} loading={pending}>
            Revoke
          </Button>
        </>
      }
    >
      <Alert kind="n">
        The assignment row is <b>never deleted</b>. Revoking stamps it with a timestamp and reason so the history stays intact and auditable. The agent is
        told to cease contact, and the recipient slot opens for the next eligible agent.
      </Alert>
      <div style={{ marginTop: "1rem" }}>
        <Field label="Reason" required>
          <Select value={reason} onChange={(e) => setReason(e.target.value)} options={REVOKE_REASONS} />
        </Field>
      </div>
      {alreadyReturned && (
        <div style={{ marginBottom: ".4rem" }}>
          <Alert kind="w">
            <b>This lead was already returned to {target.accountName}&rsquo;s balance</b> when a dispute on it was upheld, so it cannot be returned twice.
            &ldquo;Return the lead&rdquo; has been unticked — press Revoke again to revoke without a second credit.
          </Alert>
        </div>
      )}
      <Checkbox checked={returnLead} onChange={setReturnLead} disabled={alreadyReturned}>
        Return the lead to {target.accountName}&rsquo;s balance <span className="xs">(one {target.leadType} lead, as a compensating ledger entry)</span>
      </Checkbox>
      <Checkbox checked={requeue} onChange={setRequeue}>
        Re-queue the lead so the next eligible agent receives it
      </Checkbox>
    </Modal>
  );
}
