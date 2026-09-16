"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useAction as useConvexAction, useMutation, useQuery } from "convex/react";
import { type FormEvent, useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { formatMoney } from "@/domain/money";
import { errorMessage } from "@/lib/errors";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  stripePromise ??= loadStripe(key);
  return stripePromise;
}

const APPEARANCE = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#0B2440",
    colorText: "#16232F",
    colorDanger: "#B3453B",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "8px",
  },
};

export type PaymentOutcome = "paid" | "authorized" | "failed";

/**
 * Pays (or, for an opening order, authorises) an order that already exists on the server.
 * - Stripe mode: Payment Element → confirmPayment → server reconciliation (webhook is the primary path).
 * - Bypass mode: explicit "test payment" buttons, only available when the server allows mock payments.
 * Amounts shown come from the order record; the client never supplies a price.
 */
export function PaymentForm({
  orderId,
  amountCents,
  authorizeOnly,
  onComplete,
  submitLabel,
}: {
  orderId: Id<"orders">;
  amountCents: number;
  authorizeOnly?: boolean;
  onComplete: (outcome: PaymentOutcome) => void;
  submitLabel?: string;
}) {
  const config = useQuery(api.payments.config);
  if (config === undefined) return <Skeleton height={120} />;
  const label = submitLabel ?? (authorizeOnly ? `Authorise ${formatMoney(amountCents)}` : `Pay ${formatMoney(amountCents)}`);
  if (config.mode === "mock") {
    return config.bypassAllowed ? (
      <MockPayment orderId={orderId} label={label} authorizeOnly={authorizeOnly} onComplete={onComplete} />
    ) : (
      <Alert kind="e">Payments are not configured on this deployment yet. Please contact Legacy Builders.</Alert>
    );
  }
  return <StripePayment orderId={orderId} label={label} authorizeOnly={authorizeOnly} onComplete={onComplete} />;
}

function MockPayment({ orderId, label, authorizeOnly, onComplete }: { orderId: Id<"orders">; label: string; authorizeOnly?: boolean; onComplete: (o: PaymentOutcome) => void }) {
  const complete = useMutation(api.payments.completeMockPayment);
  const [pending, setPending] = useState<"succeed" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (outcome: "succeed" | "decline") => {
    setPending(outcome);
    setError(null);
    try {
      const result = await complete({ orderId, outcome });
      onComplete(result.status);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  };
  return (
    <div className="stack" style={{ gap: ".7rem" }}>
      <Alert kind="w">
        <b>Test payment (bypass mode).</b> Stripe keys are not configured, so no card is {authorizeOnly ? "authorised" : "charged"}. The order, ledger and
        receipts are still recorded exactly as they would be for a real payment.
      </Alert>
      {error && <Alert kind="e">{error}</Alert>}
      <div className="b-row">
        <Button variant="gold" onClick={() => run("succeed")} loading={pending === "succeed"} disabled={!!pending}>
          {label} (test)
        </Button>
        <Button variant="ghost" size="s" onClick={() => run("decline")} loading={pending === "decline"} disabled={!!pending}>
          Simulate a decline
        </Button>
      </div>
    </div>
  );
}

function StripePayment({ orderId, label, authorizeOnly, onComplete }: { orderId: Id<"orders">; label: string; authorizeOnly?: boolean; onComplete: (o: PaymentOutcome) => void }) {
  const createIntent = useConvexAction(api.stripeActions.createPaymentIntent);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stripe = getStripe();

  useEffect(() => {
    let cancelled = false;
    createIntent({ orderId })
      .then((r) => !cancelled && setClientSecret(r.clientSecret))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [createIntent, orderId]);

  if (!stripe) return <Alert kind="e">Stripe publishable key is missing (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).</Alert>;
  if (error) return <Alert kind="e">{error}</Alert>;
  if (!clientSecret) return <Skeleton height={160} />;
  return (
    <Elements stripe={stripe} options={{ clientSecret, appearance: APPEARANCE }}>
      <StripeConfirm orderId={orderId} label={label} authorizeOnly={authorizeOnly} onComplete={onComplete} />
    </Elements>
  );
}

function StripeConfirm({ orderId, label, authorizeOnly, onComplete }: { orderId: Id<"orders">; label: string; authorizeOnly?: boolean; onComplete: (o: PaymentOutcome) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const sync = useConvexAction(api.stripeActions.syncPaymentIntent);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPending(true);
    setError(null);
    const result = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (result.error) {
      setError(result.error.message ?? "The payment could not be completed.");
      setPending(false);
      return;
    }
    try {
      const synced = await sync({ orderId });
      const status = synced.status === "paid" || synced.status === "succeeded" ? "paid" : synced.status === "authorized" || synced.status === "requires_capture" ? "authorized" : synced.status === "failed" ? "failed" : authorizeOnly ? "authorized" : "paid";
      onComplete(status);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="stack" style={{ gap: ".9rem" }}>
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <Alert kind="e">{error}</Alert>}
      <Button type="submit" variant="gold" loading={pending} disabled={!stripe}>
        {label}
      </Button>
      <p className="xs">Card details are held by Stripe. They never touch Legacy Builders servers.</p>
    </form>
  );
}

/** Save / replace the card used for auto-reload (SetupIntent) — or a test card in bypass mode. */
export function CardSetupForm({ onDone }: { onDone: () => void }) {
  const config = useQuery(api.payments.config);
  const setMock = useMutation(api.payments.setMockPaymentMethod);
  const createSetup = useConvexAction(api.stripeActions.createSetupIntent);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const stripe = getStripe();

  useEffect(() => {
    if (config?.mode !== "stripe") return;
    createSetup({})
      .then((r) => setClientSecret(r.clientSecret))
      .catch((e) => setError(errorMessage(e)));
  }, [config?.mode, createSetup]);

  if (config === undefined) return <Skeleton height={100} />;
  if (config.mode === "mock") {
    return (
      <div className="stack" style={{ gap: ".7rem" }}>
        <Alert kind="w">Bypass mode — a test card ending 4242 will be saved.</Alert>
        {error && <Alert kind="e">{error}</Alert>}
        <Button
          variant="navy"
          loading={pending}
          onClick={async () => {
            setPending(true);
            try {
              await setMock({});
              onDone();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setPending(false);
            }
          }}
        >
          Save test card
        </Button>
      </div>
    );
  }
  if (!stripe) return <Alert kind="e">Stripe publishable key is missing.</Alert>;
  if (error) return <Alert kind="e">{error}</Alert>;
  if (!clientSecret) return <Skeleton height={140} />;
  return (
    <Elements stripe={stripe} options={{ clientSecret, appearance: APPEARANCE }}>
      <SetupConfirm onDone={onDone} />
    </Elements>
  );
}

function SetupConfirm({ onDone }: { onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="stack"
      style={{ gap: ".9rem" }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setPending(true);
        const result = await stripe.confirmSetup({ elements, redirect: "if_required" });
        setPending(false);
        if (result.error) setError(result.error.message ?? "The card could not be saved.");
        else onDone();
      }}
    >
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <Alert kind="e">{error}</Alert>}
      <Button type="submit" variant="navy" loading={pending}>
        Save card
      </Button>
    </form>
  );
}
