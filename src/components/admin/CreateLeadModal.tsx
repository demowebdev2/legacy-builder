"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Checkbox, Field, FieldGrid, Select } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from "@/domain/constants";

const FORM_ID = "create-lead-form";

function localDateTimeValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Prototype `newLeadModal` + mandatory reason and consent evidence. Runs the same intake and engine as a captured lead. */
export function CreateLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <CreateLeadDialog onClose={onClose} />;
}

type Errors = Partial<Record<string, string>>;

function CreateLeadDialog({ onClose }: { onClose: () => void }) {
  const reference = useQuery(api.referenceData.publicData);
  const createManual = useMutation(api.leads.createManual);
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    state: "",
    zip: "",
    city: "",
    coverageType: "",
    leadType: "standard" as "standard" | "exclusive",
    budgetRange: "",
    reason: "",
    consentEvidence: "",
    consentAgreedAt: localDateTimeValue(Date.now()),
    consentConfirmed: false,
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!form.firstName.trim()) e.firstName = "Required.";
    if (!form.lastName.trim()) e.lastName = "Required.";
    if (form.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a 10-digit US phone number.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = "Enter a valid email address.";
    if (!form.state) e.state = "Choose a state.";
    if (!/^\d{5}$/.test(form.zip.trim())) e.zip = "Enter a 5-digit ZIP.";
    if (!form.coverageType) e.coverageType = "Choose a product.";
    const reasonLength = form.reason.trim().length;
    if (reasonLength < REASON_MIN_LENGTH) e.reason = `At least ${REASON_MIN_LENGTH} characters, in the consumer's words.`;
    if (reasonLength > REASON_MAX_LENGTH) e.reason = `Keep it under ${REASON_MAX_LENGTH} characters.`;
    if (form.consentEvidence.trim().length < 20) e.consentEvidence = "Describe where, when and how consent was given (at least 20 characters).";
    const agreedAt = new Date(form.consentAgreedAt).getTime();
    if (!form.consentAgreedAt || Number.isNaN(agreedAt)) e.consentAgreedAt = "Enter when consent was given.";
    else if (agreedAt > Date.now()) e.consentAgreedAt = "Consent cannot be in the future.";
    if (!form.consentConfirmed) e.consentConfirmed = "A lead cannot be created without a consent record.";
    return e;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setPending(true);
    try {
      const result = await createManual({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email,
        state: form.state,
        zip: form.zip.trim(),
        city: form.city.trim() || undefined,
        coverageType: form.coverageType,
        leadType: form.leadType,
        budgetRange: form.budgetRange || undefined,
        reason: form.reason.trim(),
        consentEvidence: form.consentEvidence.trim(),
        consentAgreedAt: new Date(form.consentAgreedAt).getTime(),
      });
      if (result.status === "queued") {
        toast.success(`Lead ${result.reference} created`, "It is running through the distribution engine now.");
      } else {
        toast.warn(`Lead ${result.reference} created — ${result.status.replace(/_/g, " ")}`, "It was recorded but will not be distributed. See the processing note.");
      }
      onClose();
      router.push(`/admin/leads/${result.leadId}`);
    } catch (error) {
      toast.error(error, "Could not create the lead");
      setPending(false);
    }
  };

  const states = reference?.states ?? [];
  const budgets = reference?.formOptions.budget_range ?? [];

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Create a lead manually"
      subtitle="Runs through the same validation, deduplication, suppression check and engine as a captured lead"
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="navy" size="s" type="submit" form={FORM_ID} loading={pending}>
            Create and distribute
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate>
        <FieldGrid>
          <Field label="First name" required error={errors.firstName}>
            <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Last name" required error={errors.lastName}>
            <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Phone" required error={errors.phone}>
            <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(404) 555-0177" autoComplete="off" />
          </Field>
          <Field label="Email" required error={errors.email}>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="State" required error={errors.state} help="States we do not service are recorded as out of area, not distributed.">
            <Select
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              placeholder="Choose a state"
              options={states.map((s) => ({ value: s.code, label: s.serviced ? s.name : `${s.name} (not serviced)` }))}
            />
          </Field>
          <FieldGrid>
            <Field label="ZIP" required error={errors.zip}>
              <input inputMode="numeric" maxLength={5} value={form.zip} onChange={(e) => set("zip", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="City">
              <input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
          </FieldGrid>
          <Field label="Product" required error={errors.coverageType}>
            <Select
              value={form.coverageType}
              onChange={(e) => set("coverageType", e.target.value)}
              placeholder="Choose a product"
              options={(reference?.coverageTypes ?? []).map((c) => ({ value: c.key, label: c.name }))}
            />
          </Field>
          <Field label="Lead type" required help="Manual leads take the grade you choose here.">
            <Select
              value={form.leadType}
              onChange={(e) => set("leadType", e.target.value as "standard" | "exclusive")}
              options={[
                { value: "standard", label: "Standard" },
                { value: "exclusive", label: "Exclusive" },
              ]}
            />
          </Field>
          {budgets.length > 0 && (
            <Field label="Monthly budget">
              <Select value={form.budgetRange} onChange={(e) => set("budgetRange", e.target.value)} placeholder="Not given" options={budgets} />
            </Field>
          )}
          <Field
            label="What is bringing them to Legacy Builders?"
            required
            full
            error={errors.reason}
            help="Recorded as the consumer's reason and shown prominently to the agents who receive the lead."
          >
            <textarea value={form.reason} maxLength={REASON_MAX_LENGTH} onChange={(e) => set("reason", e.target.value)} />
          </Field>
        </FieldGrid>

        <div className="eyebrow" style={{ margin: ".4rem 0 .6rem" }}>
          Consent evidence
        </div>
        <FieldGrid>
          <Field
            label="How consent was given"
            required
            full
            error={errors.consentEvidence}
            help="For example: recorded inbound call on 16 Sep 2026 10:42, call ID 88213 — consumer agreed to the verbal TCPA script v4."
          >
            <textarea value={form.consentEvidence} onChange={(e) => set("consentEvidence", e.target.value)} />
          </Field>
          <Field label="Consent given at" required error={errors.consentAgreedAt}>
            <input type="datetime-local" value={form.consentAgreedAt} onChange={(e) => set("consentAgreedAt", e.target.value)} />
          </Field>
        </FieldGrid>
        <Checkbox checked={form.consentConfirmed} onChange={(v) => set("consentConfirmed", v)}>
          <b>Consent was captured.</b> Manual entry still requires a consent record — there is no admin override for a missing one.
        </Checkbox>
        {errors.consentConfirmed && (
          <div style={{ marginTop: ".4rem" }}>
            <Alert kind="e">{errors.consentConfirmed}</Alert>
          </div>
        )}
      </form>
    </Modal>
  );
}
