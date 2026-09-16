"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { DefinitionList } from "@/components/ui/Display";
import { Alert, LoadingBlock } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/domain/format";
import { ago } from "./format";

export interface DecideTarget {
  disputeId: Id<"disputes">;
  decision: "upheld" | "rejected";
}

/** Prototype `decideDispute`. A written decision note is mandatory and visible to the agent. */
export function DecideDisputeModal({ target, onClose }: { target: DecideTarget | null; onClose: () => void }) {
  if (!target) return null;
  return <DecideDialog target={target} onClose={onClose} />;
}

function DecideDialog({ target, onClose }: { target: DecideTarget; onClose: () => void }) {
  const data = useQuery(api.disputes.adminGet, { disputeId: target.disputeId });
  const decide = useMutation(api.disputes.decide);
  const toast = useToast();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const uphold = target.decision === "upheld";
  const [now] = useState(() => Date.now());

  const submit = async () => {
    if (notes.trim().length < 5) {
      setError("Every decision needs a reason the agent can read.");
      return;
    }
    setPending(true);
    try {
      await decide({ disputeId: target.disputeId, decision: target.decision, notes: notes.trim() });
      toast.success(uphold ? "Dispute upheld" : "Dispute rejected", uphold ? "One lead returned to the agent's balance. The agent has been notified." : "The agent has been notified with your note.");
      onClose();
    } catch (e) {
      toast.error(e, "Could not record the decision");
      setPending(false);
    }
  };

  const dispute = data?.dispute;
  const type = dispute?.leadType === "exclusive" ? "exclusive" : "standard";

  return (
    <Modal
      open
      onClose={onClose}
      title={uphold ? "Uphold this dispute" : "Reject this dispute"}
      subtitle={data ? `${data.account?.name ?? "Agent"} · lead ${data.lead?.reference ?? "—"} · ${data.reasonLabel}` : "Loading…"}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant={uphold ? "green" : "red"} size="s" onClick={() => void submit()} loading={pending} disabled={!data || dispute?.status !== "pending"}>
            {uphold ? "Uphold and return lead" : "Reject"}
          </Button>
        </>
      }
    >
      {data === undefined ? (
        <LoadingBlock rows={3} label="Loading dispute" />
      ) : data === null || !dispute ? (
        <Alert kind="e">This dispute no longer exists.</Alert>
      ) : (
        <>
          {dispute.status !== "pending" && (
            <div style={{ marginBottom: "1rem" }}>
              <Alert kind="n">This dispute was already {dispute.status} by {dispute.decidedByName ?? "someone else"}.</Alert>
            </div>
          )}
          <DefinitionList
            items={[
              ["Consumer", data.lead ? `${data.lead.name} · ${data.lead.state}` : "—"],
              ["Raised", `${formatDate(dispute.submittedAt, true)} (${ago(dispute.submittedAt, now)})`],
              dispute.details ? ["Agent says", <span key="d" style={{ whiteSpace: "pre-wrap" }}>{dispute.details}</span>] : null,
              [
                "Agent dispute rate",
                data.accountDisputeRate.assignments
                  ? `${data.accountDisputeRate.percent}% (${data.accountDisputeRate.disputes} of ${data.accountDisputeRate.assignments})`
                  : "—",
              ],
            ]}
          />
          <div style={{ marginTop: "1rem" }}>
            <Field
              label="Decision note"
              required
              error={error}
              help="Visible to the agent. This is the whole difference between a fair process and an arbitrary one."
            >
              <textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  if (error) setError(null);
                }}
                maxLength={2000}
                placeholder={uphold ? "What confirmed the agent's claim?" : "Why does the lead stand?"}
              />
            </Field>
          </div>
          {uphold ? (
            <Alert kind="i">
              One {type} lead returns to {data.account?.name ?? "the agent"}&rsquo;s balance as a compensating ledger entry. The original release is never
              edited or deleted.
            </Alert>
          ) : (
            <Alert kind="w">No lead is returned. The agent sees this note and can reply through support.</Alert>
          )}
        </>
      )}
    </Modal>
  );
}
