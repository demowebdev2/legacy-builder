"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";
import { focusFirstError, postJson } from "@/components/forms/postJson";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field, FieldGrid, Select } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { normalizeEmail, normalizeUsPhone } from "@/domain/normalize";

type Audience = "consumer" | "agent" | "other";

const AUDIENCES: Array<{ value: Audience; label: string }> = [
  { value: "consumer", label: "I am looking for insurance cover" },
  { value: "agent", label: "I am a licensed agent or agency" },
  { value: "other", label: "Something else" },
];

const EMPTY = { audience: "" as Audience | "", name: "", email: "", phone: "", message: "", company: "" };

function validate(v: typeof EMPTY): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.audience) e.audience = "Tell us who you are.";
  if (!v.name.trim()) e.name = "Enter your name.";
  if (!normalizeEmail(v.email)) e.email = "Enter a valid email address.";
  if (v.phone.trim() && !normalizeUsPhone(v.phone)) e.phone = "Enter a valid US phone number, or leave it blank.";
  if (v.message.trim().length < 10) e.message = "Tell us a little more (at least 10 characters).";
  return e;
}

/** Public contact form (prototype CMS page `contact`). Posts to /api/contact, which forwards to Convex. */
export function ContactForm() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServerError(null);
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length) {
      focusFirstError(formRef.current, found);
      return;
    }
    setPending(true);
    const result = await postJson<{ ok: true }>("/api/contact", values);
    setPending(false);
    if (result.error !== undefined) {
      setServerError(result.error);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="card card-p tc" style={{ padding: "2.5rem 1.5rem" }} role="status">
        <div className="empty" style={{ padding: 0 }}>
          <div className="ic" style={{ background: "var(--green-wash)", color: "var(--green)" }}>
            <Icon name="check" />
          </div>
        </div>
        <h2 className="h2" style={{ margin: ".9rem 0 .5rem" }}>
          Message sent
        </h2>
        <p className="sm" style={{ maxWidth: "46ch", margin: "0 auto 1.2rem" }}>
          Thank you, {values.name.trim().split(/\s+/)[0]}. Your message has gone to the right person and we will reply to {values.email.trim()}.
        </p>
        <div className="b-row" style={{ justifyContent: "center" }}>
          <Link className="b b-out" href="/">
            Back to home
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              setValues(EMPTY);
              setSent(false);
            }}
          >
            Send another message
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} className="card card-p" onSubmit={onSubmit} noValidate>
      <h2 className="h3" style={{ marginBottom: ".3rem" }}>
        Send us a message
      </h2>
      <p className="sm" style={{ marginBottom: "1.2rem" }}>
        We reply by email, usually within one business day.
      </p>
      {serverError && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="e">{serverError}</Alert>
        </div>
      )}
      <FieldGrid>
        <Field label="Which best describes you?" required error={errors.audience} full>
          <Select name="audience" value={values.audience} onChange={set("audience")} options={AUDIENCES} placeholder="Choose one" />
        </Field>
        <Field label="Your name" required error={errors.name}>
          <input name="name" autoComplete="name" value={values.name} onChange={set("name")} maxLength={120} />
        </Field>
        <Field label="Email" required error={errors.email}>
          <input name="email" type="email" autoComplete="email" value={values.email} onChange={set("email")} maxLength={200} />
        </Field>
        <Field label="Phone" help="Optional" error={errors.phone} full>
          <input name="phone" type="tel" autoComplete="tel" value={values.phone} onChange={set("phone")} maxLength={40} />
        </Field>
        <Field label="Message" required error={errors.message} help={`${values.message.trim().length} / 4000`} full>
          <textarea name="message" rows={6} value={values.message} onChange={set("message")} maxLength={4000} />
        </Field>
      </FieldGrid>
      <div className="hp-field" aria-hidden="true">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" value={values.company} onChange={set("company")} />
        </label>
      </div>
      <div className="row-b" style={{ marginTop: ".4rem" }}>
        <p className="xs" style={{ maxWidth: "44ch" }}>
          Want to stop contact about an insurance request? Use{" "}
          <Link className="link" href="/request/withdraw">
            withdraw consent
          </Link>{" "}
          — it is faster.
        </p>
        <Button type="submit" variant="navy" loading={pending}>
          Send message
        </Button>
      </div>
    </form>
  );
}
