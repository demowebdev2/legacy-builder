"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { Checkbox, Field, FieldGrid, Select } from "@/components/ui/Form";
import { isIconName } from "@/components/ui/Icon";
import { OptionCard, StepProgress } from "@/components/ui/Wizard";
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from "@/domain/constants";
import { UNSURE_COVERAGE_KEY } from "@/domain/referenceDefaults";
import { aboutStepSchema, consentStepSchema, contactStepSchema, coverageStepSchema, reasonStepSchema } from "@/domain/schemas/consumerRequest";
import { focusFirstError, issuesToErrors, postJson } from "./postJson";

export type PublicReference = FunctionReturnType<typeof api.referenceData.publicData>;
export type PublishedLegalDoc = FunctionReturnType<typeof api.legalDocuments.published>;

const STORAGE_KEY = "lb.request.v1";
const TOTAL_STEPS = 5;

interface RequestData {
  coverageType: string;
  ageRange: string;
  state: string;
  zip: string;
  coverageAmount: string;
  protecting: string;
  budgetRange: string;
  reason: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  bestTimeToCall: string;
  preferredContactMethod: string;
  gclid: string;
}

const EMPTY: RequestData = {
  coverageType: "",
  ageRange: "",
  state: "",
  zip: "",
  coverageAmount: "",
  protecting: "",
  budgetRange: "",
  reason: "",
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  bestTimeToCall: "",
  preferredContactMethod: "",
  gclid: "",
};

interface Saved {
  step: number;
  data: RequestData;
  startedAt: number;
}

const subscribeNothing = () => () => {};

/** Prototype `P.request`, extended to the five steps of decision D6. */
export function RequestWizard({
  initialCoverage,
  initialReference,
  initialConsent,
}: {
  initialCoverage?: string;
  initialReference: PublicReference | null;
  initialConsent: PublishedLegalDoc | null;
}) {
  // Wizard state lives in sessionStorage, so the form only renders once we are in the browser.
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const liveReference = useQuery(api.referenceData.publicData);
  const liveConsent = useQuery(api.legalDocuments.published, { docType: "consumer_consent" });
  const reference = liveReference ?? initialReference;
  const consent = liveConsent !== undefined ? liveConsent : (initialConsent ?? undefined);

  return (
    <div className="pw pw-n">
      <h1 className="h2" style={{ marginBottom: ".3rem" }}>
        Get matched with a licensed agent
      </h1>
      <p className="sm" style={{ marginBottom: "1.3rem" }}>
        Free, about two minutes, and you are never charged.
      </p>
      {mounted && reference ? (
        <WizardCard reference={reference} consent={consent} initialCoverage={initialCoverage} />
      ) : (
        <div className="card card-p" aria-busy="true">
          <StepProgress step={1} total={TOTAL_STEPS} />
          <Skeleton height={22} width="55%" />
          <Skeleton height={14} width="80%" className="mt-3" />
          <div className="opts" style={{ marginTop: "1.2rem" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} height={64} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function loadSaved(initialCoverage: string | undefined, coverageKeys: string[]): Saved {
  let saved: Saved | null = null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      if (parsed && typeof parsed.step === "number" && parsed.data && typeof parsed.startedAt === "number") {
        saved = { step: Math.min(Math.max(1, Math.trunc(parsed.step)), TOTAL_STEPS), data: { ...EMPTY, ...parsed.data }, startedAt: parsed.startedAt };
      }
    }
  } catch {
    saved = null;
  }
  const result: Saved = saved ?? { step: 1, data: { ...EMPTY }, startedAt: Date.now() };
  const validCoverage = initialCoverage && (initialCoverage === UNSURE_COVERAGE_KEY || coverageKeys.includes(initialCoverage));
  if (validCoverage && (!saved || saved.step === 1 || !saved.data.coverageType)) {
    result.data = { ...result.data, coverageType: initialCoverage };
  }
  try {
    const gclid = new URLSearchParams(window.location.search).get("gclid");
    if (gclid) result.data = { ...result.data, gclid: gclid.slice(0, 200) };
  } catch {
    // ignore malformed URLs
  }
  return result;
}

function WizardCard({ reference, consent, initialCoverage }: { reference: PublicReference; consent: PublishedLegalDoc | undefined; initialCoverage?: string }) {
  const router = useRouter();
  const coverageKeys = reference.coverageTypes.map((c) => c.key);
  const [initial] = useState(() => loadSaved(initialCoverage, coverageKeys));
  const [step, setStep] = useState(initial.step);
  const [data, setData] = useState<RequestData>(initial.data);
  const [startedAt] = useState(initial.startedAt);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [company, setCompany] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, data, startedAt } satisfies Saved));
    } catch {
      // storage unavailable (private mode) — the wizard still works for this page view
    }
  }, [step, data, startedAt]);

  useEffect(() => {
    if (!navigated.current) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  const update = <K extends keyof RequestData>(key: K, value: RequestData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  const validateStep = (): Record<string, string> => {
    const result =
      step === 1
        ? coverageStepSchema.safeParse(data)
        : step === 2
          ? aboutStepSchema.safeParse(data)
          : step === 3
            ? reasonStepSchema.safeParse(data)
            : step === 4
              ? contactStepSchema.safeParse(data)
              : consentStepSchema.safeParse({ consentDocumentId: consent?.id ?? "", consentAccepted, termsAccepted });
    return result.success ? {} : issuesToErrors(result.error.issues);
  };

  const go = (next: number) => {
    navigated.current = true;
    setErrors({});
    setSubmitError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onContinue = async () => {
    const found = validateStep();
    setErrors(found);
    if (Object.keys(found).length) {
      requestAnimationFrame(() => focusFirstError(cardRef.current, found));
      return;
    }
    if (step < TOTAL_STEPS) {
      go(step + 1);
      return;
    }
    setPending(true);
    setSubmitError(null);
    const result = await postJson<{ reference: string; token: string }>("/api/request", {
      ...data,
      gclid: data.gclid || undefined,
      consentDocumentId: consent?.id ?? "",
      consentAccepted,
      termsAccepted,
      pageUrl: window.location.href.slice(0, 500),
      company,
      startedAt,
    });
    if (result.error !== undefined) {
      setPending(false);
      setSubmitError(result.error);
      return;
    }
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    router.push(`/request/confirmation?ref=${encodeURIComponent(result.data.reference)}&t=${encodeURIComponent(result.data.token)}`);
  };

  const options = reference.formOptions;
  const coverageOptions = [
    ...reference.coverageTypes,
    { key: UNSURE_COVERAGE_KEY, name: "I am not sure", icon: "arrow", wizardDescription: "Help me work it out" },
  ];

  return (
    <div className="card card-p" ref={cardRef}>
      <StepProgress step={step} total={TOTAL_STEPS} />

      {submitError && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="e">{submitError}</Alert>
        </div>
      )}

      {step === 1 && (
        <>
          <h2 className="h3" style={{ marginBottom: ".3rem" }} ref={headingRef} tabIndex={-1}>
            What do you need help with?
          </h2>
          <p className="sm" style={{ marginBottom: "1.2rem" }}>
            Pick the closest match. You can change direction when you speak to the agent.
          </p>
          <div className="opts" role="group" aria-label="Type of cover" data-field="coverageType" tabIndex={-1}>
            {coverageOptions.map((p) => (
              <OptionCard
                key={p.key}
                selected={data.coverageType === p.key}
                onSelect={() => update("coverageType", p.key)}
                icon={isIconName(p.icon) ? p.icon : "shield"}
                title={p.name}
                description={p.wizardDescription}
              />
            ))}
          </div>
          <StepError message={errors.coverageType} />
        </>
      )}

      {step === 2 && (
        <>
          <h2 className="h3" style={{ marginBottom: ".3rem" }} ref={headingRef} tabIndex={-1}>
            A little about you
          </h2>
          <p className="sm" style={{ marginBottom: "1.2rem" }}>
            Just enough to match you with an agent licensed where you live. No medical questions.
          </p>
          <FieldGrid>
            <Field label="Age range" required error={errors.ageRange}>
              <Select name="ageRange" value={data.ageRange} onChange={(e) => update("ageRange", e.target.value)} options={options.age_range ?? []} placeholder="Choose…" />
            </Field>
            <Field label="State" required error={errors.state}>
              <Select
                name="state"
                value={data.state}
                onChange={(e) => update("state", e.target.value)}
                options={reference.servicedStates.map((s) => ({ value: s.code, label: s.name }))}
                placeholder="Choose…"
                autoComplete="address-level1"
              />
            </Field>
            <Field label="ZIP code" required error={errors.zip}>
              <input name="zip" inputMode="numeric" autoComplete="postal-code" placeholder="31401" maxLength={10} value={data.zip} onChange={(e) => update("zip", e.target.value)} />
            </Field>
            <Field label="Cover amount in mind" error={errors.coverageAmount}>
              <Select
                name="coverageAmount"
                value={data.coverageAmount}
                onChange={(e) => update("coverageAmount", e.target.value)}
                options={options.coverage_amount ?? []}
                placeholder="Choose…"
              />
            </Field>
            <Field label="Monthly budget" required error={errors.budgetRange}>
              <Select name="budgetRange" value={data.budgetRange} onChange={(e) => update("budgetRange", e.target.value)} options={options.budget_range ?? []} placeholder="Choose…" />
            </Field>
            <Field label="Who are you looking to protect?" error={errors.protecting}>
              <Select name="protecting" value={data.protecting} onChange={(e) => update("protecting", e.target.value)} options={options.protecting ?? []} placeholder="Choose…" />
            </Field>
          </FieldGrid>
        </>
      )}

      {step === 3 && (
        <>
          <h2 className="h3" style={{ marginBottom: ".3rem" }} ref={headingRef} tabIndex={-1}>
            What is bringing you to Legacy Builders?
          </h2>
          <p className="sm" style={{ marginBottom: "1.2rem" }}>
            In your own words. A sentence or two helps the agent understand what you need before they call.
          </p>
          <Field
            label="Tell us a little about what you are looking for"
            required
            error={errors.reason}
            help={
              <span className="row-b" style={{ gap: ".5rem" }}>
                <span>At least {REASON_MIN_LENGTH} characters.</span>
                <span aria-hidden="true">
                  {data.reason.length} / {REASON_MAX_LENGTH}
                </span>
              </span>
            }
          >
            <textarea
              name="reason"
              rows={6}
              maxLength={REASON_MAX_LENGTH}
              placeholder="For example: we just had our second child and I want to make sure the mortgage would be covered."
              value={data.reason}
              onChange={(e) => update("reason", e.target.value)}
            />
          </Field>
        </>
      )}

      {step === 4 && (
        <>
          <h2 className="h3" style={{ marginBottom: ".3rem" }} ref={headingRef} tabIndex={-1}>
            How should the agent reach you?
          </h2>
          <p className="sm" style={{ marginBottom: "1.2rem" }}>
            A licensed agent in your state, working the product you picked.
          </p>
          <FieldGrid>
            <Field label="First name" required error={errors.firstName}>
              <input name="firstName" autoComplete="given-name" placeholder="Marcus" maxLength={60} value={data.firstName} onChange={(e) => update("firstName", e.target.value)} />
            </Field>
            <Field label="Last name" required error={errors.lastName}>
              <input name="lastName" autoComplete="family-name" placeholder="Whitfield" maxLength={60} value={data.lastName} onChange={(e) => update("lastName", e.target.value)} />
            </Field>
            <Field label="Mobile" required error={errors.phone}>
              <input name="phone" type="tel" autoComplete="tel-national" placeholder="(912) 000-0000" maxLength={20} value={data.phone} onChange={(e) => update("phone", e.target.value)} />
            </Field>
            <Field label="Email" required error={errors.email}>
              <input name="email" type="email" autoComplete="email" placeholder="marcus@example.com" maxLength={200} value={data.email} onChange={(e) => update("email", e.target.value)} />
            </Field>
            <Field label="Best time to call" error={errors.bestTimeToCall}>
              <Select name="bestTimeToCall" value={data.bestTimeToCall} onChange={(e) => update("bestTimeToCall", e.target.value)} options={options.call_time ?? []} placeholder="Choose…" />
            </Field>
            <Field label="Preferred contact method" required error={errors.preferredContactMethod}>
              <Select
                name="preferredContactMethod"
                value={data.preferredContactMethod}
                onChange={(e) => update("preferredContactMethod", e.target.value)}
                options={options.contact_method ?? []}
                placeholder="Choose…"
              />
            </Field>
          </FieldGrid>
        </>
      )}

      {step === 5 && (
        <>
          <h2 className="h3" style={{ marginBottom: ".3rem" }} ref={headingRef} tabIndex={-1}>
            One last thing
          </h2>
          <p className="sm" style={{ marginBottom: "1.2rem" }}>
            Please read this before you submit. It is not hidden behind a link.
          </p>
          {consent === undefined ? (
            <Skeleton height={160} />
          ) : consent === null ? (
            <Alert kind="e">We cannot take requests right now because the consent wording is unavailable. Please try again later.</Alert>
          ) : (
            <div className="consent-box">
              <Checkbox name="consentAccepted" checked={consentAccepted} onChange={(v) => {
                setConsentAccepted(v);
                if (errors.consentAccepted) setErrors((e) => ({ ...e, consentAccepted: "" }));
              }}>
                {consent.content}
              </Checkbox>
              <Checkbox name="termsAccepted" checked={termsAccepted} onChange={(v) => {
                setTermsAccepted(v);
                if (errors.termsAccepted) setErrors((e) => ({ ...e, termsAccepted: "" }));
              }}>
                I have read and accept the{" "}
                <Link href="/legal/privacy-policy" target="_blank" rel="noopener" className="link">
                  Privacy Policy
                </Link>{" "}
                and{" "}
                <Link href="/legal/terms-of-use" target="_blank" rel="noopener" className="link">
                  Terms of Use
                </Link>
                , and I understand my details will be shared with the licensed insurance agent or agents Legacy Builders matches me with so they can contact me.
              </Checkbox>
            </div>
          )}
          <StepError message={errors.consentAccepted || errors.termsAccepted || errors.consentDocumentId} />
          {errors.consentAccepted && errors.termsAccepted && <StepError message={errors.termsAccepted} />}
          <div style={{ marginTop: "1rem" }}>
            <Alert kind="i">
              <b>Recorded on submission:</b> consent text version, hash, timestamp, IP address, user agent and page URL.
            </Alert>
          </div>
        </>
      )}

      <div className="hp-field" aria-hidden="true">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
      </div>

      <div className="fnav">
        <Button variant="out" onClick={() => go(step - 1)} disabled={step === 1 || pending}>
          Back
        </Button>
        <Button variant="navy" onClick={onContinue} loading={pending} disabled={step === TOTAL_STEPS && !consent}>
          {step === TOTAL_STEPS ? "Submit enquiry" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function StepError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="f err" style={{ margin: ".6rem 0 0" }}>
      <div className="msg" role="alert">
        {message}
      </div>
    </div>
  );
}
