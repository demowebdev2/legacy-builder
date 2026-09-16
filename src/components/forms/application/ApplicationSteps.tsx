"use client";

import Link from "next/link";
import type { ReactNode, RefObject } from "react";
import { PurchaseQuantitySelector } from "@/components/balance/PurchaseQuantitySelector";
import { Button } from "@/components/ui/Button";
import { DefinitionList } from "@/components/ui/Display";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { Checkbox, Chips, Field, FieldGrid, FieldGroup, Select } from "@/components/ui/Form";
import { OptionCard } from "@/components/ui/Wizard";
import { PASSWORD_MIN_LENGTH, PURCHASE_INCREMENT, PURCHASE_MINIMUM } from "@/domain/constants";
import { formatMoney } from "@/domain/money";
import { leadMixFor, quotePurchase, snapPurchaseQuantity } from "@/domain/purchase";
import {
  type ApplicationData,
  formatDateInput,
  PACE_OPTIONS,
  type PublicReference,
  type PublishedLegalDoc,
  SEAT_OPTIONS,
  type SetField,
} from "./model";
import { QuantityOnlySelector } from "./QuantityOnlySelector";

export interface Rates {
  standardRateCents: number;
  exclusiveRateCents: number;
}

interface StepProps {
  data: ApplicationData;
  set: SetField;
  errors: Record<string, string>;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

function StepHeading({ headingRef, title, intro }: { headingRef: RefObject<HTMLHeadingElement | null>; title: string; intro?: ReactNode }) {
  return (
    <>
      <h2 className="h3" style={{ marginBottom: intro ? ".3rem" : "1rem" }} ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      {intro && (
        <p className="sm" style={{ marginBottom: "1.2rem" }}>
          {intro}
        </p>
      )}
    </>
  );
}

export function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="f err" style={{ margin: ".5rem 0 0" }}>
      <div className="msg" role="alert">
        {message}
      </div>
    </div>
  );
}

// ─────────────────────────── 1 · entity ───────────────────────────

export function EntityStep({ data, set, errors, headingRef }: StepProps) {
  const choose = (entityType: "individual" | "agency") => {
    set("entityType", entityType);
    set("seats", entityType === "agency" ? Math.max(SEAT_OPTIONS[0], data.seats) : 1);
  };
  return (
    <>
      <StepHeading headingRef={headingRef} title="Are you applying on your own, or for an agency?" intro="This changes what we verify and who hands out leads once they arrive." />
      <div className="opts" role="group" aria-label="Applicant type" data-field="entityType" tabIndex={-1}>
        <OptionCard
          selected={data.entityType === "individual"}
          onSelect={() => choose("individual")}
          icon="user"
          title="Individual producer"
          description="Solo licensed agent. One login, one lead balance."
          style={{ minHeight: 86 }}
        />
        <OptionCard
          selected={data.entityType === "agency"}
          onSelect={() => choose("agency")}
          icon="bank"
          title="Agency"
          description="Two or more producers. One pooled lead balance, seats you manage — free."
          style={{ minHeight: 86 }}
        />
      </div>
      <InlineError message={errors.entityType} />
    </>
  );
}

// ─────────────────────────── 2 · details + login ───────────────────────────

export function DetailsStep({
  data,
  set,
  errors,
  headingRef,
  reference,
  signedInEmail,
  password,
  passwordConfirm,
  onPassword,
  onPasswordConfirm,
}: StepProps & {
  reference: PublicReference;
  signedInEmail: string | null;
  password: string;
  passwordConfirm: string;
  onPassword: (v: string) => void;
  onPasswordConfirm: (v: string) => void;
}) {
  const agency = data.entityType === "agency";
  const text = (key: keyof ApplicationData) => (e: { target: { value: string } }) => set(key, e.target.value as never);
  return (
    <>
      <StepHeading headingRef={headingRef} title={agency ? "Agency details" : "Your details"} />
      {agency ? (
        <FieldGrid>
          <Field label="Agency legal name" required error={errors.businessName} full>
            <input name="businessName" autoComplete="organization" placeholder="Whitfield Financial Group, LLC" maxLength={160} value={data.businessName} onChange={text("businessName")} />
          </Field>
          <Field label="EIN" required error={errors.ein}>
            <input name="ein" inputMode="numeric" placeholder="00-0000000" maxLength={10} value={data.ein} onChange={text("ein")} />
          </Field>
          <Field label="How many producers?" required error={errors.producerCount}>
            <Select name="producerCount" value={data.producerCount} onChange={text("producerCount")} options={reference.formOptions.producer_count ?? []} placeholder="Choose…" />
          </Field>
          <Field label="Principal first name" required error={errors.firstName}>
            <input name="firstName" autoComplete="given-name" placeholder="Dawn" maxLength={60} value={data.firstName} onChange={text("firstName")} />
          </Field>
          <Field label="Principal last name" required error={errors.lastName}>
            <input name="lastName" autoComplete="family-name" placeholder="Whitfield" maxLength={60} value={data.lastName} onChange={text("lastName")} />
          </Field>
          <Field label="Principal email" required error={errors.email} help={signedInEmail ? "The email of the login you are signed in with." : undefined}>
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="dawn@whitfieldfg.com"
              maxLength={200}
              value={signedInEmail ?? data.email}
              onChange={text("email")}
              disabled={!!signedInEmail}
            />
          </Field>
          <Field label="Principal mobile" required error={errors.phone}>
            <input name="phone" type="tel" autoComplete="tel-national" placeholder="(404) 000-0000" maxLength={20} value={data.phone} onChange={text("phone")} />
          </Field>
        </FieldGrid>
      ) : (
        <FieldGrid>
          <Field label="First name" required error={errors.firstName}>
            <input name="firstName" autoComplete="given-name" placeholder="Alicia" maxLength={60} value={data.firstName} onChange={text("firstName")} />
          </Field>
          <Field label="Last name" required error={errors.lastName}>
            <input name="lastName" autoComplete="family-name" placeholder="Reyes" maxLength={60} value={data.lastName} onChange={text("lastName")} />
          </Field>
          <Field label="Work email" required error={errors.email} help={signedInEmail ? "The email of the login you are signed in with." : undefined}>
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="alicia@reyesinsurance.com"
              maxLength={200}
              value={signedInEmail ?? data.email}
              onChange={text("email")}
              disabled={!!signedInEmail}
            />
          </Field>
          <Field label="Mobile" required error={errors.phone}>
            <input name="phone" type="tel" autoComplete="tel-national" placeholder="(404) 000-0000" maxLength={20} value={data.phone} onChange={text("phone")} />
          </Field>
          <Field label="Business name, if you trade under one" error={errors.businessName} full>
            <input name="businessName" autoComplete="organization" placeholder="Reyes Insurance Services" maxLength={160} value={data.businessName} onChange={text("businessName")} />
          </Field>
        </FieldGrid>
      )}

      <h3 className="h4" style={{ margin: "1.1rem 0 .3rem" }}>
        Your login
      </h3>
      {signedInEmail ? (
        <Alert kind="i">
          You are signed in as <b>{signedInEmail}</b>. This application will be linked to that login.
        </Alert>
      ) : (
        <>
          <p className="sm" style={{ marginBottom: ".9rem" }}>
            You will sign in with this email and password to check your application and, once approved, to use the agent portal.
          </p>
          <FieldGrid>
            <Field label="Create a password" required error={errors.password} help={`At least ${PASSWORD_MIN_LENGTH} characters.`}>
              <input name="password" type="password" autoComplete="new-password" maxLength={128} value={password} onChange={(e) => onPassword(e.target.value)} />
            </Field>
            <Field label="Confirm password" required error={errors.passwordConfirm}>
              <input name="passwordConfirm" type="password" autoComplete="new-password" maxLength={128} value={passwordConfirm} onChange={(e) => onPasswordConfirm(e.target.value)} />
            </Field>
          </FieldGrid>
          <p className="xs">
            Already have a login?{" "}
            <Link className="link" href="/auth/login?next=/apply">
              Sign in
            </Link>{" "}
            and your answers so far are kept.
          </p>
        </>
      )}
    </>
  );
}

// ─────────────────────────── 3 · licensing ───────────────────────────

export function LicensingStep({ data, set, errors, headingRef, reference, today }: StepProps & { reference: PublicReference; today: string }) {
  const states = reference.servicedStates;
  const toggleState = (code: string) => {
    const on = data.licensedStates.includes(code);
    const next = on ? data.licensedStates.filter((s) => s !== code) : states.map((s) => s.code).filter((s) => s === code || data.licensedStates.includes(s));
    set("licensedStates", next);
  };
  const setLicence = (code: string, field: "licenseNumber" | "expiresOn", value: string) => {
    const row = data.licences[code] ?? { licenseNumber: "", expiresOn: "" };
    set("licences", { ...data.licences, [code]: { ...row, [field]: value } });
  };
  return (
    <>
      <StepHeading
        headingRef={headingRef}
        title="Licence details"
        intro="Reviewed by our licensing team before your account activates. Nothing is released and no card is charged until that passes."
      />
      <FieldGrid>
        <Field label="Producer number (NPN)" required error={errors.npn}>
          <input name="npn" inputMode="numeric" placeholder="8841203" maxLength={10} value={data.npn} onChange={(e) => set("npn", e.target.value.replace(/\s/g, ""))} />
        </Field>
        <Field label="Resident state" required error={errors.residentState}>
          <Select
            name="residentState"
            value={data.residentState}
            onChange={(e) => set("residentState", e.target.value)}
            options={states.map((s) => ({ value: s.code, label: s.name }))}
            placeholder="Choose…"
          />
        </Field>
      </FieldGrid>

      <div data-field="licensedStates" tabIndex={-1}>
        <FieldGroup label="All states you are licensed in" required error={errors.licensedStates} help="Add the licence number and expiry date for each state you select.">
          <Chips options={states.map((s) => ({ value: s.code, label: s.name }))} selected={data.licensedStates} onToggle={toggleState} />
        </FieldGroup>
      </div>

      {data.licensedStates.length > 0 && (
        <div className="consent-box" style={{ marginBottom: ".9rem", paddingBottom: 0 }}>
          {data.licensedStates.map((code) => {
            const name = states.find((s) => s.code === code)?.name ?? code;
            const row = data.licences[code] ?? { licenseNumber: "", expiresOn: "" };
            return (
              <FieldGrid key={code}>
                <Field label={`${name} licence number`} required error={errors[`licences.${code}.licenseNumber`]}>
                  <input name={`licences.${code}.licenseNumber`} maxLength={40} value={row.licenseNumber} onChange={(e) => setLicence(code, "licenseNumber", e.target.value)} />
                </Field>
                <Field label={`${name} licence expiry`} required error={errors[`licences.${code}.expiresOn`]}>
                  <input name={`licences.${code}.expiresOn`} type="date" min={today} value={row.expiresOn} onChange={(e) => setLicence(code, "expiresOn", e.target.value)} />
                </Field>
              </FieldGrid>
            );
          })}
        </div>
      )}

      <h3 className="h4" style={{ margin: "1.1rem 0 .6rem" }}>
        Errors and omissions cover
      </h3>
      <FieldGrid>
        <Field label="E&O carrier" required error={errors.eoCarrier}>
          <input name="eoCarrier" placeholder="Carrier name" maxLength={120} value={data.eoCarrier} onChange={(e) => set("eoCarrier", e.target.value)} />
        </Field>
        <Field label="E&O policy number" error={errors.eoPolicyNumber}>
          <input name="eoPolicyNumber" maxLength={60} value={data.eoPolicyNumber} onChange={(e) => set("eoPolicyNumber", e.target.value)} />
        </Field>
        <Field label="E&O expiry" required error={errors.eoExpiresOn}>
          <input name="eoExpiresOn" type="date" min={today} value={data.eoExpiresOn} onChange={(e) => set("eoExpiresOn", e.target.value)} />
        </Field>
      </FieldGrid>
    </>
  );
}

// ─────────────────────────── 4 · preferences ───────────────────────────

export function PreferencesStep({ data, set, errors, headingRef, reference, needsTpmo }: StepProps & { reference: PublicReference; needsTpmo: boolean }) {
  const coverage = reference.coverageTypes;
  const toggle = (key: string) =>
    set(
      "coverageTypes",
      data.coverageTypes.includes(key) ? data.coverageTypes.filter((k) => k !== key) : coverage.map((c) => c.key).filter((k) => k === key || data.coverageTypes.includes(k)),
    );
  const agency = data.entityType === "agency";
  return (
    <>
      <StepHeading
        headingRef={headingRef}
        title="What leads should we send you?"
        intro="These are hard limits. Nothing outside them will reach you — and because the engine assigns automatically, this is how you shape what lands."
      />
      <div data-field="coverageTypes" tabIndex={-1}>
        <FieldGroup
          label="Products"
          required
          error={errors.coverageTypes}
          help={`${data.coverageTypes.length} of ${coverage.length} selected. All products are available on every account — narrowing this just slows delivery.`}
        >
          <Chips options={coverage.map((c) => ({ value: c.key, label: c.name }))} selected={data.coverageTypes} onToggle={toggle} />
        </FieldGroup>
      </div>

      {needsTpmo && (
        <div className="consent-box" style={{ marginBottom: ".9rem" }}>
          <div className="h4" style={{ marginBottom: ".2rem" }}>
            Medicare needs TPMO approval
          </div>
          <p className="xs" style={{ marginBottom: ".2rem" }}>
            Medicare leads are only released to agents approved to market Medicare through Legacy Builders as a Third-Party Marketing Organization partner.
          </p>
          <Checkbox name="requestTpmo" checked={data.requestTpmo} onChange={(v) => set("requestTpmo", v)}>
            <b>Request Medicare TPMO approval</b> for this account.
          </Checkbox>
          <InlineError message={errors.requestTpmo} />
          {data.requestTpmo && (
            <>
              <Checkbox name="tpmoAttested" checked={data.tpmoAttested} onChange={(v) => set("tpmoAttested", v)}>
                I will market Medicare products only in line with CMS rules for Third-Party Marketing Organizations, and I accept the{" "}
                <Link className="link" href="/legal/medicare-tpmo-addendum" target="_blank" rel="noopener">
                  Medicare TPMO addendum
                </Link>
                .
              </Checkbox>
              <InlineError message={errors.tpmoAttested} />
            </>
          )}
        </div>
      )}

      <FieldGrid className="mt-3">
        <Field label="Daily pace" required error={errors.dailyPace} help="There is no delivery schedule, so your whole balance could arrive in a day. This caps how many reach you at once.">
          <Select name="dailyPace" value={data.dailyPace} onChange={(e) => set("dailyPace", Number(e.target.value))} options={PACE_OPTIONS.map((n) => ({ value: n, label: `${n} a day` }))} />
        </Field>
        {agency ? (
          <Field label="Producer seats" error={errors.seats} help="Included at no charge. Every seat is verified individually.">
            <Select name="seats" value={data.seats} onChange={(e) => set("seats", Number(e.target.value))} options={SEAT_OPTIONS.map((n) => ({ value: n, label: `${n} seats` }))} />
          </Field>
        ) : (
          <Field label="Producer seats" help="Individual accounts are a single verified producer.">
            <input value="1 — included free" disabled readOnly />
          </Field>
        )}
      </FieldGrid>
    </>
  );
}

// ─────────────────────────── 5 · purchase & agreement ───────────────────────────

export function PurchaseStep({
  data,
  set,
  errors,
  headingRef,
  rates,
  agreement,
}: StepProps & { rates: Rates | null | undefined; agreement: PublishedLegalDoc | undefined }) {
  const q = snapPurchaseQuantity(data.quantity);
  const mix = leadMixFor(q);
  const total = rates ? quotePurchase(q, rates).totalCents : null;
  return (
    <>
      <StepHeading
        headingRef={headingRef}
        title="How many leads to start with?"
        intro={`Minimum ${PURCHASE_MINIMUM}, then in steps of ${PURCHASE_INCREMENT}. The mix is fixed at two exclusive in every ten, and nothing expires — you buy again when you are ready.`}
      />
      <div className="consent-box" style={{ padding: "1.1rem" }} data-field="quantity" tabIndex={-1}>
        {rates === undefined ? (
          <Skeleton height={260} />
        ) : rates ? (
          <PurchaseQuantitySelector quantity={q} onChange={(n) => set("quantity", snapPurchaseQuantity(n))} standardRateCents={rates.standardRateCents} exclusiveRateCents={rates.exclusiveRateCents} />
        ) : (
          <QuantityOnlySelector quantity={q} onChange={(n) => set("quantity", snapPurchaseQuantity(n))} />
        )}
      </div>
      <InlineError message={errors.quantity} />
      <Checkbox name="autoReload" checked={data.autoReload} onChange={(v) => set("autoReload", v)}>
        <b>Turn on auto-reload.</b> When the balance drops to 3, buy another {q} automatically at the same rate. You can change or switch this off at any time.
      </Checkbox>

      <h3 className="h4" style={{ margin: "1.3rem 0 .5rem" }}>
        Payment and agreement
      </h3>
      <p className="sm" style={{ marginBottom: ".9rem" }}>
        Your card is authorised now and only charged once your licence is verified. If we cannot verify you, the authorisation is released and nothing is taken. You
        add your card after reviewing your application.
      </p>
      {agreement === undefined ? (
        <Skeleton height={140} />
      ) : agreement === null ? (
        <Alert kind="e">Applications are paused because the agent agreement is unavailable. Please try again later.</Alert>
      ) : (
        <div className="consent-box">
          <Checkbox name="agreeLicensed" checked={data.agreeLicensed} onChange={(v) => set("agreeLicensed", v)}>
            I hold an active insurance producer licence in every state I selected, and I will tell Legacy Builders immediately if any licence lapses.
          </Checkbox>
          <Checkbox name="agreeContactLaw" checked={data.agreeContactLaw} onChange={(v) => set("agreeContactLaw", v)}>
            I will contact consumers in line with federal and state telemarketing law, honour any opt-out immediately, and stop contact once consent is withdrawn.
          </Checkbox>
          <Checkbox name="agreeTerms" checked={data.agreeTerms} onChange={(v) => set("agreeTerms", v)}>
            I will not resell, transfer or share any consumer details I receive, and I accept the purchase terms — {q} leads
            {total != null ? ` for ${formatMoney(total)}, ` : ", "}
            {mix.exclusive} exclusive and {mix.standard} standard{total == null ? ", at the published agent rates" : ""} — and the 72-hour dispute window.
          </Checkbox>
          <p className="xs" style={{ padding: ".3rem 0 .2rem" }}>
            By continuing you accept the{" "}
            <Link className="link" href="/legal/agent-agreement" target="_blank" rel="noopener">
              agent agreement
            </Link>{" "}
            (version {agreement.version}).
          </p>
        </div>
      )}
      <InlineError message={errors.agreeLicensed || errors.agreeContactLaw || errors.agreeTerms || errors.agreementDocumentId} />
    </>
  );
}

// ─────────────────────────── 6 · review ───────────────────────────

export function ReviewStep({
  data,
  headingRef,
  reference,
  rates,
  needsTpmo,
  signedInEmail,
  onEdit,
}: Omit<StepProps, "set" | "errors"> & { reference: PublicReference; rates: Rates | null | undefined; needsTpmo: boolean; signedInEmail: string | null; onEdit: (step: number) => void }) {
  const agency = data.entityType === "agency";
  const stateName = (code: string) => reference.servicedStates.find((s) => s.code === code)?.name ?? code;
  const coverageName = (key: string) => reference.coverageTypes.find((c) => c.key === key)?.name ?? key;
  const q = snapPurchaseQuantity(data.quantity);
  const mix = leadMixFor(q);
  const total = rates ? quotePurchase(q, rates).totalCents : null;

  return (
    <>
      <StepHeading headingRef={headingRef} title="Check your application" intro="Make sure everything is right. You authorise your card on the next screen." />
      <ReviewSection title={agency ? "Agency" : "You"} onEdit={() => onEdit(2)}>
        <DefinitionList
          items={[
            ["Type", agency ? "Agency" : "Individual producer"],
            agency && ["Legal name", data.businessName],
            agency && ["EIN", data.ein],
            agency && ["Producers", data.producerCount],
            [agency ? "Principal" : "Name", `${data.firstName} ${data.lastName}`.trim()],
            ["Email", signedInEmail ?? data.email],
            ["Mobile", data.phone],
            !agency && !!data.businessName && ["Trades as", data.businessName],
          ]}
        />
      </ReviewSection>
      <ReviewSection title="Licensing" onEdit={() => onEdit(3)}>
        <DefinitionList
          items={[
            ["NPN", <span key="npn" className="mono">{data.npn}</span>],
            ["Resident state", stateName(data.residentState)],
            [
              "Licences",
              <ul key="lic" style={{ listStyle: "none", display: "grid", gap: ".15rem" }}>
                {data.licensedStates.map((code) => (
                  <li key={code}>
                    {stateName(code)} · <span className="mono">{data.licences[code]?.licenseNumber}</span> · expires {formatDateInput(data.licences[code]?.expiresOn ?? "")}
                  </li>
                ))}
              </ul>,
            ],
            ["E&O", `${data.eoCarrier}${data.eoPolicyNumber ? ` · ${data.eoPolicyNumber}` : ""} · expires ${formatDateInput(data.eoExpiresOn)}`],
          ]}
        />
      </ReviewSection>
      <ReviewSection title="Preferences" onEdit={() => onEdit(4)}>
        <DefinitionList
          items={[
            ["Products", data.coverageTypes.map(coverageName).join(", ")],
            needsTpmo && ["Medicare TPMO", data.requestTpmo ? "Approval requested" : "Not requested"],
            ["Daily pace", `${data.dailyPace} a day`],
            ["Producer seats", agency ? `${data.seats} seats, included free` : "1 — included free"],
          ]}
        />
      </ReviewSection>
      <ReviewSection title="Purchase" onEdit={() => onEdit(5)}>
        <DefinitionList
          items={[
            ["Leads", `${q} — ${mix.exclusive} exclusive, ${mix.standard} standard`],
            ["Total", total != null ? `${formatMoney(total)}, one payment` : "Shown before you authorise your card"],
            ["Auto-reload", data.autoReload ? `On — buy ${q} more when the balance drops to 3` : "Off"],
            ["Agreements", "Licensing, telemarketing law and purchase terms accepted"],
          ]}
        />
      </ReviewSection>
    </>
  );
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="review-sec">
      <div className="row-b" style={{ marginBottom: ".6rem" }}>
        <h3 className="h4">{title}</h3>
        <Button variant="ghost" size="xs" icon="edit" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}>
          Edit
        </Button>
      </div>
      {children}
    </section>
  );
}
