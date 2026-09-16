"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field, FieldGrid, Select } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/errors";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Invite a producer (or billing contact) seat. The invitation email carries a one-time link. */
export function InviteSeatModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const invite = useMutation(api.agencyMembers.invite);
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [npn, setNpn] = useState("");
  const [seatRole, setSeatRole] = useState<"producer" | "billing_contact">("producer");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    name: name.trim().length >= 2 ? null : "Enter their name.",
    email: EMAIL_RE.test(email.trim()) ? null : "Enter a valid email address.",
  };

  const onSubmit = async () => {
    setTouched(true);
    if (errors.name || errors.email) return;
    setPending(true);
    setError(null);
    try {
      await invite({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, npn: npn.trim() || undefined, seatRole });
      toast.success("Invite sent", `A sign-up link has gone to ${email.trim()}. It expires in 7 days.`);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a producer"
      subtitle="Seats are free. Every producer is verified individually before they can hold a lead."
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="navy" size="s" loading={pending} onClick={() => void onSubmit()}>
            Send invite
          </Button>
        </>
      }
    >
      {error && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="e">{error}</Alert>
        </div>
      )}
      <FieldGrid>
        <Field label="Full name" required error={touched ? errors.name : null}>
          <input value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Work email" required error={touched ? errors.email : null}>
          <input type="email" value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mobile">
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="NPN" help="National producer number, if you have it.">
          <input inputMode="numeric" value={npn} maxLength={12} onChange={(e) => setNpn(e.target.value)} />
        </Field>
        <Field label="Seat" full help="Billing contacts are kept on file for invoices and never hold leads.">
          <Select
            value={seatRole}
            onChange={(e) => setSeatRole(e.target.value as "producer" | "billing_contact")}
            options={[
              { value: "producer", label: "Producer — works leads handed out by you" },
              { value: "billing_contact", label: "Billing contact" },
            ]}
          />
        </Field>
      </FieldGrid>
      <Alert kind="i">Once they accept, ask them to add their state licences so our team can verify the seat.</Alert>
    </Modal>
  );
}
