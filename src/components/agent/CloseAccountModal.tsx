"use client";

import { useMutation } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { CheckList } from "@/components/ui/Display";
import { Alert } from "@/components/ui/Feedback";
import { Field, Select } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ACCOUNT_CLOSURE_REASONS } from "@/domain/constants";

/**
 * Prototype `cancelModal`, with the refund promise removed (assumption D3 / BD-8): closing is a request that
 * our team reviews; the balance is frozen, not forfeited, and any refund is a separate manual decision.
 */
export function ClosureChecklist({ unused }: { unused: number }) {
  return (
    <CheckList
      items={[
        { text: "No notice period and no fee — there is no subscription to end" },
        { text: "Closing is a request — our team reviews it and confirms with you before anything changes" },
        { text: `Your ${unused} unused lead${unused === 1 ? " is" : "s are"} frozen on the ledger, not forfeited` },
        { text: "Leads already released to you stay readable" },
        { text: "No new leads are released once the account is closed", ok: false },
      ]}
    />
  );
}

export function CloseAccountModal({ open, onClose, unused }: { open: boolean; onClose: () => void; unused: number }) {
  const requestClosure = useMutation(api.accounts.requestClosure);
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);

  const submit = async () => {
    setTouched(true);
    if (!reason) return;
    setPending(true);
    try {
      await requestClosure({ reason, note: note.trim() || undefined });
      toast.warn("Closure requested", "Our team will confirm with you. Your balance is frozen, not forfeited.");
      onClose();
    } catch (e) {
      toast.error(e, "The request was not sent");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Close your account"
      subtitle="There is no subscription to cancel — no notice period and no fee."
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Keep my account
          </Button>
          <Button variant="red" size="s" loading={pending} onClick={() => void submit()}>
            Request closure
          </Button>
        </>
      }
    >
      <ClosureChecklist unused={unused} />
      <div style={{ marginTop: "1rem" }}>
        <Alert kind="i">
          You do not have to close the account to stop leads arriving. <b>Pausing</b> in{" "}
          <Link className="link" href="/agent/preferences">
            Preferences
          </Link>{" "}
          stops the engine immediately and your balance keeps — nothing expires while you are away.
        </Alert>
      </div>
      <Field
        label="Why are you leaving?"
        required
        className="mt-4"
        error={touched && !reason ? "Choose a reason." : null}
        help="This goes straight to the founders, not a survey tool."
      >
        <Select value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Select…" options={ACCOUNT_CLOSURE_REASONS} />
      </Field>
      <Field label="Anything else we should know?">
        <textarea value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
      </Field>
      <p className="xs">
        Any refund for unused leads is not automatic — it is reviewed separately by our finance team with you.
      </p>
    </Modal>
  );
}
