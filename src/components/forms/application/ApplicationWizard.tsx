"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PaymentForm } from "@/components/balance/PaymentForm";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { StepProgress } from "@/components/ui/Wizard";
import { formatMoney } from "@/domain/money";
import { quotePurchase, snapPurchaseQuantity } from "@/domain/purchase";
import {
  detailsStepSchema,
  entityStepSchema,
  licensingStepSchema,
  paymentStepSchema,
  preferencesStepSchema,
} from "@/domain/schemas/agentApplication";
import { destinationFor } from "@/hooks/usePostLoginRedirect";
import { errorMessage } from "@/lib/errors";
import { focusFirstError, issuesToErrors } from "../postJson";
import { DetailsStep, EntityStep, LicensingStep, PreferencesStep, PurchaseStep, type Rates, ReviewStep } from "./ApplicationSteps";
import { type ApplicationData, EMPTY_APPLICATION, endOfDay, localDateString, type PublicReference, type SetField, TOTAL_STEPS } from "./model";

const STORAGE_KEY = "lb.apply.v1";
const subscribeNothing = () => () => {};

interface Saved {
  step: number;
  data: ApplicationData;
  orderId?: string;
}

function loadSaved(initialQty: number | undefined): Saved {
  let saved: Saved | null = null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      if (parsed && typeof parsed.step === "number" && parsed.data) {
        saved = {
          step: Math.min(Math.max(1, Math.trunc(parsed.step)), TOTAL_STEPS),
          data: { ...EMPTY_APPLICATION, ...parsed.data },
          orderId: typeof parsed.orderId === "string" ? parsed.orderId : undefined,
        };
      }
    }
  } catch {
    saved = null;
  }
  const result: Saved = saved ?? { step: 1, data: { ...EMPTY_APPLICATION } };
  if (initialQty && !result.orderId && (!saved || saved.step < 5)) {
    result.data = { ...result.data, quantity: snapPurchaseQuantity(initialQty) };
  }
  return result;
}

/** Prototype `P.apply`, adapted per SCREEN-INVENTORY §3 (login creation, per-state licences, TPMO, review, Stripe authorisation). */
export function ApplicationWizard({ initialQty, initialReference }: { initialQty?: number; initialReference: PublicReference | null }) {
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const liveReference = useQuery(api.referenceData.publicData);
  const reference = liveReference ?? initialReference;

  return (
    <div className="pw pw-n">
      <h1 className="h2" style={{ marginBottom: ".3rem" }}>
        Apply to join
      </h1>
      <p className="sm" style={{ marginBottom: "1.3rem" }}>
        No card is charged and no lead is released until your licence is verified.
      </p>
      {mounted && reference ? (
        <Wizard reference={reference} initialQty={initialQty} />
      ) : (
        <div className="card card-p" aria-busy="true">
          <StepProgress step={1} total={TOTAL_STEPS} />
          <Skeleton height={22} width="60%" />
          <Skeleton height={14} width="75%" className="mt-3" />
          <div className="opts" style={{ marginTop: "1.2rem" }}>
            <Skeleton height={86} />
            <Skeleton height={86} />
          </div>
        </div>
      )}
    </div>
  );
}

function Wizard({ reference, initialQty }: { reference: PublicReference; initialQty?: number }) {
  const router = useRouter();
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const publicCard = useQuery(api.pricing.publicRateCard);
  const agentCard = useQuery(api.pricing.agentRateCard, isAuthenticated && publicCard && !publicCard.visible ? {} : "skip");
  const agreement = useQuery(api.legalDocuments.published, { docType: "agent_agreement" });
  const submitApplication = useMutation(api.applications.submit);

  const [initial] = useState(() => loadSaved(initialQty));
  const [today] = useState(() => localDateString(Date.now()));
  const [step, setStep] = useState(initial.step);
  const [data, setData] = useState<ApplicationData>(initial.data);
  const [orderId, setOrderId] = useState<string | undefined>(initial.orderId);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<{ message: string; signIn?: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigated = useRef(false);
  const submitting = useRef(false);
  const authRef = useRef(isAuthenticated);

  useEffect(() => {
    authRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, data, orderId } satisfies Saved));
    } catch {
      // storage unavailable — the wizard still works for this page view
    }
  }, [step, data, orderId]);

  useEffect(() => {
    if (!navigated.current) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Somebody who already has an account belongs on their status page or in the portal, not here.
  useEffect(() => {
    if (!me || submitting.current || orderId) return;
    if (me.kind === "account") router.replace(destinationFor(me, null));
  }, [me, orderId, router]);

  const signedInEmail = isAuthenticated && me?.kind === "none" ? me.email : null;
  const coverageNeedsTpmo = new Set(reference.coverageTypes.filter((c) => c.requiresTpmo).map((c) => c.key));
  const needsTpmo = data.coverageTypes.some((k) => coverageNeedsTpmo.has(k));
  const rates: Rates | null | undefined = publicCard === undefined ? undefined : publicCard.visible ? publicCard : isAuthenticated ? (agentCard === undefined ? undefined : agentCard) : null;

  const set: SetField = useCallback((key, value) => {
    setData((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      if (!Object.keys(e).some((k) => k === key || k.startsWith(`${String(key)}.`))) return e;
      const next = { ...e };
      for (const k of Object.keys(next)) if (k === key || k.startsWith(`${String(key)}.`)) delete next[k];
      return next;
    });
  }, []);

  const validateStep = (n: number): Record<string, string> => {
    const now = Date.now();
    if (n === 1) {
      const r = entityStepSchema.safeParse({ entityType: data.entityType || undefined });
      return r.success ? {} : issuesToErrors(r.error.issues);
    }
    if (n === 2) {
      const r = detailsStepSchema.safeParse({
        ...data,
        email: signedInEmail ?? data.email,
        password: signedInEmail ? "signed-in-placeholder" : password,
        passwordConfirm: signedInEmail ? "signed-in-placeholder" : passwordConfirm,
      });
      return r.success ? {} : issuesToErrors(r.error.issues);
    }
    if (n === 3) {
      const licenses = data.licensedStates.map((state) => ({ state, ...(data.licences[state] ?? { licenseNumber: "", expiresOn: "" }) }));
      const r = licensingStepSchema.safeParse({ ...data, licenses });
      const found: Record<string, string> = {};
      if (!r.success) {
        for (const issue of r.error.issues) {
          const [head, index, field] = issue.path;
          const key =
            head === "licenses" && typeof index === "number"
              ? `licences.${licenses[index]?.state}.${String(field ?? "licenseNumber")}`
              : head === "licenses"
                ? "licensedStates"
                : issue.path.map(String).join(".");
          if (!found[key]) found[key] = issue.message;
        }
      }
      for (const lic of licenses) {
        const key = `licences.${lic.state}.expiresOn`;
        if (!found[key] && lic.expiresOn && endOfDay(lic.expiresOn) <= now) found[key] = "This licence has expired.";
      }
      if (!found.eoExpiresOn && data.eoExpiresOn && endOfDay(data.eoExpiresOn) <= now) found.eoExpiresOn = "Your E&O cover has expired.";
      return found;
    }
    if (n === 4) {
      const r = preferencesStepSchema.safeParse({
        coverageTypes: data.coverageTypes,
        dailyPace: data.dailyPace,
        seats: data.entityType === "agency" ? data.seats : 1,
        requestTpmo: needsTpmo && data.requestTpmo,
        tpmoAttested: needsTpmo && data.requestTpmo && data.tpmoAttested,
      });
      const found = r.success ? {} : issuesToErrors(r.error.issues);
      // The shared schema keys the TPMO rule on "medicare"; reference data may flag other products too.
      if (needsTpmo && !data.requestTpmo && !found.requestTpmo) found.requestTpmo = "Medicare leads need TPMO approval — request it or remove Medicare.";
      return found;
    }
    if (n === 5) {
      const r = paymentStepSchema.safeParse({ ...data, agreementDocumentId: agreement?.id ?? "" });
      return r.success ? {} : issuesToErrors(r.error.issues);
    }
    return {};
  };

  const go = (next: number) => {
    navigated.current = true;
    setErrors({});
    setSubmitError(null);
    setStep(Math.min(Math.max(1, next), TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const waitForAuth = async () => {
    const started = Date.now();
    while (!authRef.current) {
      if (Date.now() - started > 20_000) throw new Error("Signing you in is taking longer than expected. Please try again.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  const onSubmit = async () => {
    setSubmitError(null);
    if (!agreement) return;
    // Re-validate every step before anything is created (answers may have been restored from an earlier visit).
    for (let n = 1; n < TOTAL_STEPS; n++) {
      const found = validateStep(n);
      if (Object.keys(found).length) {
        go(n);
        setErrors(found);
        requestAnimationFrame(() => focusFirstError(cardRef.current, found));
        return;
      }
    }
    setPending(true);
    submitting.current = true;
    try {
      if (!isAuthenticated) {
        try {
          await signIn("password", { email: data.email.trim(), password, flow: "signUp" });
        } catch (error) {
          const message = errorMessage(error, "");
          if (/already exists|exists/i.test(message) || /InvalidAccountId|InvalidSecret/i.test(message)) {
            setSubmitError({ message: "An account with this email address already exists. Sign in with that email to continue your application.", signIn: true });
          } else {
            setSubmitError({ message: message ? `We could not create your login: ${message}` : "We could not create your login. Please try again." });
          }
          return;
        }
        await waitForAuth();
      }
      const licenses = data.licensedStates.map((state) => ({
        state,
        licenseNumber: (data.licences[state]?.licenseNumber ?? "").trim(),
        expiresAt: endOfDay(data.licences[state]?.expiresOn ?? ""),
      }));
      const agency = data.entityType === "agency";
      const result = await submitApplication({
        entityType: agency ? "agency" : "individual",
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        phone: data.phone.trim(),
        businessName: data.businessName.trim() || undefined,
        ein: agency ? data.ein.trim() : undefined,
        producerCount: agency ? data.producerCount : undefined,
        npn: data.npn.trim(),
        residentState: data.residentState,
        licenses,
        eoCarrier: data.eoCarrier.trim(),
        eoPolicyNumber: data.eoPolicyNumber.trim() || undefined,
        eoExpiresAt: endOfDay(data.eoExpiresOn),
        coverageTypes: data.coverageTypes,
        dailyPace: data.dailyPace,
        seats: agency ? data.seats : 1,
        requestTpmo: needsTpmo && data.requestTpmo,
        tpmoAttested: needsTpmo && data.requestTpmo && data.tpmoAttested,
        quantity: snapPurchaseQuantity(data.quantity),
        autoReload: data.autoReload,
        agreementDocumentId: agreement.id,
        agreements: { licensed: data.agreeLicensed, contactLaw: data.agreeContactLaw, terms: data.agreeTerms },
      });
      setPassword("");
      setPasswordConfirm("");
      setOrderId(result.orderId);
      navigated.current = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setSubmitError({ message: errorMessage(error) });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  const onContinue = async () => {
    const found = validateStep(step);
    setErrors(found);
    if (Object.keys(found).length) {
      requestAnimationFrame(() => focusFirstError(cardRef.current, found));
      return;
    }
    if (step < TOTAL_STEPS) go(step + 1);
    else await onSubmit();
  };

  if (!pending && (authLoading || (isAuthenticated && me === undefined))) {
    return <Skeleton height={320} />;
  }

  if (me?.kind === "staff") {
    return (
      <div className="card card-p">
        <Alert kind="w">
          You are signed in as Legacy Builders staff ({me.email}). Sign out first to apply as an agent with a different email address.
        </Alert>
        <div className="b-row" style={{ marginTop: "1rem" }}>
          <ButtonLink href="/admin" variant="out">
            Go to the back office
          </ButtonLink>
          <Button variant="navy" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (orderId) {
    return <AuthorisePayment orderId={orderId as Id<"orders">} error={paymentError} onError={setPaymentError} onAuthorised={() => {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      router.push("/apply/success");
    }} />;
  }

  const q = snapPurchaseQuantity(data.quantity);
  const reviewTotal = rates ? quotePurchase(q, rates).totalCents : null;

  return (
    <div className="card card-p" ref={cardRef}>
      <StepProgress step={step} total={TOTAL_STEPS} />
      {submitError && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="e">
            {submitError.message}
            {submitError.signIn && (
              <>
                {" "}
                <Link href="/auth/login?next=/apply">Sign in</Link> or{" "}
                <Link href="/auth/forgot-password">reset your password</Link>.
              </>
            )}
          </Alert>
        </div>
      )}

      {step === 1 && <EntityStep data={data} set={set} errors={errors} headingRef={headingRef} />}
      {step === 2 && (
        <DetailsStep
          data={data}
          set={set}
          errors={errors}
          headingRef={headingRef}
          reference={reference}
          signedInEmail={signedInEmail}
          password={password}
          passwordConfirm={passwordConfirm}
          onPassword={(v) => {
            setPassword(v);
            if (errors.password) setErrors((e) => ({ ...e, password: "" }));
          }}
          onPasswordConfirm={(v) => {
            setPasswordConfirm(v);
            if (errors.passwordConfirm) setErrors((e) => ({ ...e, passwordConfirm: "" }));
          }}
        />
      )}
      {step === 3 && <LicensingStep data={data} set={set} errors={errors} headingRef={headingRef} reference={reference} today={today} />}
      {step === 4 && <PreferencesStep data={data} set={set} errors={errors} headingRef={headingRef} reference={reference} needsTpmo={needsTpmo} />}
      {step === 5 && <PurchaseStep data={data} set={set} errors={errors} headingRef={headingRef} rates={rates} agreement={agreement} />}
      {step === 6 && (
        <ReviewStep data={data} headingRef={headingRef} reference={reference} rates={rates} needsTpmo={needsTpmo} signedInEmail={signedInEmail} onEdit={go} />
      )}

      {step === 6 && !signedInEmail && !password && (
        <div style={{ marginTop: "1rem" }}>
          <Alert kind="w">
            For your security the password is not kept if you reload the page. <button type="button" className="link" onClick={() => go(2)}>Enter it again</button> before
            submitting.
          </Alert>
        </div>
      )}

      <div className="fnav">
        <Button variant="out" onClick={() => go(step - 1)} disabled={step === 1 || pending}>
          Back
        </Button>
        <Button
          variant="navy"
          onClick={onContinue}
          loading={pending}
          disabled={(step >= 5 && !agreement) || (step === 6 && !signedInEmail && !password)}
        >
          {step === TOTAL_STEPS ? `Submit application${reviewTotal != null ? ` — ${formatMoney(reviewTotal)}` : ""}` : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function AuthorisePayment({
  orderId,
  error,
  onError,
  onAuthorised,
}: {
  orderId: Id<"orders">;
  error: string | null;
  onError: (message: string | null) => void;
  onAuthorised: () => void;
}) {
  const application = useQuery(api.applications.mine);
  const order = application?.openingOrder && application.openingOrder.id === orderId ? application.openingOrder : null;

  return (
    <div className="card card-p">
      <StepProgress step={TOTAL_STEPS} total={TOTAL_STEPS} />
      <h2 className="h3" style={{ marginBottom: ".3rem" }}>
        Authorise your card
      </h2>
      <p className="sm" style={{ marginBottom: "1.2rem" }}>
        Your application has been saved. Your card is authorised now and only charged once your licence is verified. If we cannot verify you, the authorisation is
        released and nothing is taken.
      </p>
      {application === undefined ? (
        <Skeleton height={180} />
      ) : !order ? (
        <Alert kind="w">
          We could not find the opening purchase for this application. <Link href="/apply/pending">Open your application status</Link> to finish.
        </Alert>
      ) : order.status === "authorized" || order.status === "paid" ? (
        <Alert kind="s">
          Your card has already been authorised. <Link href="/apply/success">Continue</Link>
        </Alert>
      ) : (
        <>
          <div className="consent-box" style={{ marginBottom: "1rem" }}>
            <div className="bill" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
              <div>
                <span>Opening purchase</span>
                <span className="mono">{order.orderNumber}</span>
              </div>
              <div>
                <span>
                  {order.exclusiveQty} exclusive · {order.standardQty} standard
                </span>
                <b>{order.exclusiveQty + order.standardQty} leads</b>
              </div>
              <div className="tot">
                <span>Total, authorised now</span>
                <span>{formatMoney(order.totalCents)}</span>
              </div>
            </div>
          </div>
          {(error || order.status === "failed") && (
            <div style={{ marginBottom: "1rem" }}>
              <Alert kind="e">{error ?? "Your card was declined. Try again, or use a different card."}</Alert>
            </div>
          )}
          <PaymentForm
            orderId={order.id}
            amountCents={order.totalCents}
            authorizeOnly
            onComplete={(outcome) => {
              if (outcome === "authorized" || outcome === "paid") {
                onError(null);
                onAuthorised();
              } else {
                onError("Your card was declined. Try again, or use a different card.");
              }
            }}
          />
        </>
      )}
      <p className="xs" style={{ marginTop: "1rem" }}>
        You can also finish this later from your <Link className="link" href="/apply/pending">application status page</Link>.
      </p>
    </div>
  );
}
