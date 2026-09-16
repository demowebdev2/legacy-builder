"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Alert } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { BLOCK_REASONS, REJECTION_REASONS } from "@/domain/constants";
import { ModalButtons, ModalError, NotesModal, useModalSubmit } from "./kit";
import type { AdminAccount } from "./types";

type Props = { data: AdminAccount; onClose: () => void };

/** Prototype `rejectAcct`. */
export function RejectModal({ data, onClose }: Props) {
  const reject = useMutation(api.accounts.reject);
  const [reason, setReason] = useState<string>(REJECTION_REASONS[0]);
  const [message, setMessage] = useState("");
  const { submit, pending, error } = useModalSubmit(() => reject({ accountId: data.account._id, reason, message: message.trim() || undefined }), {
    success: "Application rejected",
    successBody: "Authorisation released, applicant notified.",
    onDone: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Reject ${data.account.name}`}
      subtitle="The card authorisation is released. Nothing is charged."
      footer={<ModalButtons onCancel={onClose} onConfirm={() => void submit()} label="Reject application" variant="red" pending={pending} />}
    >
      <Field label="Reason" required>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {REJECTION_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      <Field label="Message to the applicant">
        <textarea value={message} maxLength={1000} placeholder="Tell them what would let them reapply." onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <Alert kind="i">Rejected applicants can reapply once the underlying issue is fixed. The record is kept, not deleted.</Alert>
      <ModalError error={error} />
    </Modal>
  );
}

/** Prototype `blockModal`. */
export function BlockModal({ data, onClose }: Props) {
  const block = useMutation(api.accounts.block);
  const [reason, setReason] = useState<string>(BLOCK_REASONS[0]);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const { submit, pending, error } = useModalSubmit(() => block({ accountId: data.account._id, reason, note: note.trim() }), {
    success: "Account blocked",
    successBody: "Distribution stopped, auto-reload off, balance frozen.",
    onDone: onClose,
  });
  const confirm = () => {
    if (note.trim().length < 5) {
      setNoteError("A block needs a written note.");
      return;
    }
    setNoteError(null);
    void submit();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Block ${data.account.name}`}
      subtitle="Block is for conduct. Suspend is for an operational lapse."
      footer={<ModalButtons onCancel={onClose} onConfirm={confirm} label="Block account" variant="red" pending={pending} />}
    >
      <Alert kind="e">
        <b>Blocking stops distribution immediately, disables auto-reload, and freezes the lead balance.</b> The balance is frozen, not forfeited — nothing
        expires, and existing leads stay visible so the agent can close what they already paid for. Only staff who manage accounts can lift it.
      </Alert>
      <Field label="Reason" required className="mt-4">
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {BLOCK_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      <Field label="Internal note" required error={noteError}>
        <textarea
          value={note}
          maxLength={2000}
          placeholder="What happened, and what would lift the block?"
          onChange={(e) => { setNote(e.target.value); setNoteError(null); }}
        />
      </Field>
      <ModalError error={error} />
    </Modal>
  );
}

export function RequestActionModal({ data, onClose }: Props) {
  const requestAction = useMutation(api.accounts.requestAction);
  return (
    <NotesModal
      title={`Request action from ${data.account.name}`}
      subtitle="The application stays open. The applicant sees this message on their application page."
      label="What the applicant needs to do"
      placeholder="Upload a copy of your Mississippi licence showing the licence number and expiry date."
      minLength={10}
      confirmLabel="Send request"
      success="Action requested"
      onSubmit={(message) => requestAction({ accountId: data.account._id, message })}
      onClose={onClose}
    />
  );
}

export function SuspendModal({ data, onClose }: Props) {
  const suspend = useMutation(api.accounts.suspend);
  return (
    <NotesModal
      title={`Suspend ${data.account.name}`}
      subtitle="Suspend is for an operational lapse. Block is for conduct."
      intro={
        <Alert kind="w">
          <b>Suspending halts distribution on the next lead.</b> The lead balance is frozen, not forfeited, and existing leads stay visible. The agent is told
          the reason you write here.
        </Alert>
      }
      label="Reason"
      placeholder="E&O cover lapsed — upload renewal evidence to lift."
      minLength={5}
      confirmLabel="Suspend account"
      variant="red"
      success="Account suspended"
      onSubmit={(reason) => suspend({ accountId: data.account._id, reason })}
      onClose={onClose}
    />
  );
}

export function RestoreModal({ data, onClose }: Props) {
  const restore = useMutation(api.accounts.restore);
  const verb = data.account.status === "blocked" ? "Unblock" : data.account.status === "closed" ? "Reopen" : "Reactivate";
  return (
    <NotesModal
      title={`${verb} ${data.account.name}`}
      subtitle="The account returns to active."
      intro={
        <Alert kind="s">
          Lead flow resumes on the next distribution run. The balance is exactly as it was.
          {data.account.status === "blocked" ? " The quality hold applied by the block is lifted too." : ""}
        </Alert>
      }
      label="Note"
      placeholder={
        data.account.status === "blocked"
          ? "Conduct review complete — no further complaints."
          : data.account.status === "closed"
            ? "Agent asked to reopen the account."
            : "Renewal evidence received and verified."
      }
      minLength={3}
      confirmLabel={verb}
      variant="green"
      success={`Account ${verb === "Unblock" ? "unblocked" : verb === "Reopen" ? "reopened" : "reactivated"}`}
      onSubmit={(note) => restore({ accountId: data.account._id, note })}
      onClose={onClose}
    />
  );
}

export function CloseAccountModal({ data, onClose }: Props) {
  const close = useMutation(api.accounts.close);
  return (
    <NotesModal
      title={`Close ${data.account.name}`}
      subtitle="Closure requested by the agent"
      intro={
        <Alert kind="w">
          <b>No automatic refund of unused balance.</b> Closing stops distribution and turns auto-reload off. Any remaining balance is frozen and restored
          if the account reopens. A cash refund is a manual finance exception issued from the Finance tab.
        </Alert>
      }
      label="Note"
      placeholder="Closure confirmed with the agent by phone."
      minLength={5}
      confirmLabel="Close account"
      variant="red"
      success="Account closed"
      onSubmit={(note) => close({ accountId: data.account._id, note })}
      onClose={onClose}
    />
  );
}

export function QualityHoldModal({ data, onClose }: Props) {
  const setQualityHold = useMutation(api.accounts.setQualityHold);
  const hold = !data.account.qualityHold;
  return (
    <NotesModal
      title={hold ? "Apply quality hold" : "Lift quality hold"}
      subtitle={data.account.name}
      intro={
        <Alert kind={hold ? "w" : "i"}>
          {hold
            ? "A quality hold removes the account from distribution without changing its status. The balance is untouched."
            : "Lifting the hold makes the account eligible again on the next lead, subject to every other rule."}
        </Alert>
      }
      label="Reason"
      placeholder={hold ? "Contact rate under review after complaints." : "Review complete — no further action."}
      minLength={5}
      confirmLabel={hold ? "Apply hold" : "Lift hold"}
      variant={hold ? "red" : "green"}
      success={hold ? "Quality hold applied" : "Quality hold lifted"}
      onSubmit={(reason) => setQualityHold({ accountId: data.account._id, hold, reason })}
      onClose={onClose}
    />
  );
}
