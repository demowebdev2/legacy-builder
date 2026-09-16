"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { withdrawalSchema } from "@/domain/schemas/consumerRequest";
import { focusFirstError, issuesToErrors, postJson } from "./postJson";

/** (new) Reference lookup + consent withdrawal. The contact detail must match the request, which stops enumeration (D12). */
export function WithdrawForm({ initialReference }: { initialReference?: string }) {
  const [reference, setReference] = useState(initialReference ?? "");
  const [contact, setContact] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ reference: string; alreadyWithdrawn: boolean } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServerError(null);
    const parsed = withdrawalSchema.safeParse({ reference, contact });
    if (!parsed.success) {
      const found = issuesToErrors(parsed.error.issues);
      setErrors(found);
      focusFirstError(formRef.current, found);
      return;
    }
    setErrors({});
    setPending(true);
    const result = await postJson<{ reference: string; alreadyWithdrawn: boolean }>("/api/withdraw", parsed.data);
    setPending(false);
    if (result.error !== undefined) {
      setServerError(result.error);
      return;
    }
    setDone(result.data);
  };

  if (done) {
    return (
      <div className="card card-p tc" style={{ padding: "2.5rem 1.5rem" }} role="status">
        <div className="empty" style={{ padding: 0 }}>
          <div className="ic" style={{ background: "var(--green-wash)", color: "var(--green)" }}>
            <Icon name="check" />
          </div>
        </div>
        <h2 className="h2" style={{ margin: ".9rem 0 .5rem" }}>
          {done.alreadyWithdrawn ? "Consent was already withdrawn" : "Your consent has been withdrawn"}
        </h2>
        <p className="sm" style={{ maxWidth: "48ch", margin: "0 auto 1.2rem" }}>
          Reference <b className="mono">{done.reference}</b>. All contact about this request will stop.
        </p>
        <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "left" }}>
          <Alert kind="s">
            Your phone number and email address have been added to our do-not-contact list, and any agent who already received your request has been told to stop
            contacting you. If you still hear from someone, reply STOP to any text or <Link href="/contact">contact us</Link>.
          </Alert>
        </div>
        <div className="b-row" style={{ justifyContent: "center", marginTop: "1.4rem" }}>
          <ButtonLink href="/" variant="out">
            Back to home
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} className="card card-p" onSubmit={onSubmit} noValidate>
      {serverError && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="e">{serverError}</Alert>
        </div>
      )}
      <Field label="Reference number" required error={errors.reference} help="It starts with LB- and is in the email we sent when you submitted your request.">
        <input
          name="reference"
          className="mono"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="LB-2609-XXXXX"
          maxLength={40}
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
            if (errors.reference) setErrors((x) => ({ ...x, reference: "" }));
          }}
        />
      </Field>
      <Field label="Email address or mobile number you used" required error={errors.contact} help="We only use this to confirm the request is yours.">
        <input
          name="contact"
          autoComplete="email"
          maxLength={200}
          value={contact}
          onChange={(e) => {
            setContact(e.target.value);
            if (errors.contact) setErrors((x) => ({ ...x, contact: "" }));
          }}
        />
      </Field>
      <div className="fnav">
        <ButtonLink href="/" variant="out">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="navy" loading={pending}>
          Withdraw consent
        </Button>
      </div>
    </form>
  );
}
