"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { destinationFor, safeNext } from "@/hooks/usePostLoginRedirect";
import { errorMessage } from "@/lib/errors";

const groupSecret = (secret: string) => secret.replace(/\s+/g, "").match(/.{1,4}/g)?.join(" ") ?? secret;

function TwoFactor() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { signOut } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const status = useQuery(api.mfa.status, isAuthenticated ? {} : "skip");
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const beginEnrollment = useMutation(api.mfa.beginEnrollment);
  const confirmEnrollment = useAction(api.mfa.confirmEnrollment);
  const verify = useAction(api.mfa.verify);

  const [enrollment, setEnrollment] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (signingOut) return;
    if (!isLoading && !isAuthenticated) router.replace("/auth/login?next=/auth/two-factor");
  }, [isLoading, isAuthenticated, router, signingOut]);

  useEffect(() => {
    if (status?.verified && me) router.replace(destinationFor(me, next));
  }, [status?.verified, me, next, router]);

  const onSignOut = async () => {
    setSigningOut(true);
    await signOut();
    router.replace("/auth/login");
  };

  const footer = (
    <>
      Signed in as {me?.email ?? "…"} ·{" "}
      <button type="button" className="link" style={{ color: "#B9CBDD" }} onClick={onSignOut}>
        Sign out
      </button>
    </>
  );

  if (!status || !me || status.verified) {
    return (
      <AuthCard title="Two-factor authentication">
        <Skeleton height={140} />
      </AuthCard>
    );
  }

  const enrolled = status.enrolled;

  const start = async () => {
    setError(null);
    setPending(true);
    try {
      setEnrollment(await beginEnrollment({}));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      if (enrolled) await verify({ code });
      else await confirmEnrollment({ code });
    } catch (err) {
      setError(errorMessage(err));
      setCode("");
      setPending(false);
    }
  };

  const codeField = (
    <form onSubmit={onSubmit} noValidate>
      <Field label="6-digit code" required error={error}>
        <input
          name="code"
          className="otp-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
            if (error) setError(null);
          }}
        />
      </Field>
      <Button type="submit" variant="navy" full loading={pending} disabled={code.length !== 6}>
        {enrolled ? "Verify" : "Turn on two-factor authentication"}
      </Button>
    </form>
  );

  if (enrolled) {
    return (
      <AuthCard title="Enter your code" subtitle="Open your authenticator app and enter the current code for Legacy Builders." footer={footer}>
        {codeField}
      </AuthCard>
    );
  }

  const skip = !status.required ? (
    <p className="xs tc" style={{ marginTop: ".9rem" }}>
      <button type="button" className="link" onClick={() => router.replace(destinationFor(me, next))}>
        Skip for now
      </button>
    </p>
  ) : null;

  if (!enrollment) {
    return (
      <AuthCard
        title="Set up two-factor authentication"
        subtitle={status.required ? "Required for every Legacy Builders staff login." : "Add a second step to protect your login."}
        footer={footer}
      >
        {error && (
          <div style={{ marginBottom: "1rem" }}>
            <Alert kind="e">{error}</Alert>
          </div>
        )}
        <p className="sm" style={{ marginBottom: "1rem" }}>
          You will need an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password. Each time you sign in on a new device
          you will enter the 6-digit code it shows.
        </p>
        <Button variant="navy" full loading={pending} onClick={start}>
          Set up two-factor authentication
        </Button>
        {skip}
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set up two-factor authentication" subtitle="Two quick steps." footer={footer}>
      <h2 className="h4" style={{ marginBottom: ".35rem" }}>
        1. Add Legacy Builders to your authenticator app
      </h2>
      <p className="sm" style={{ marginBottom: ".7rem" }}>
        On this device,{" "}
        <a className="link" href={enrollment.otpauthUrl}>
          open it in your authenticator app
        </a>
        . Otherwise choose “enter a setup key” in the app and type this key:
      </p>
      <div className="otp-secret" aria-label="Setup key">
        {groupSecret(enrollment.secret)}
      </div>
      <p className="xs" style={{ margin: ".4rem 0 1.1rem" }}>
        Time-based, 6 digits. Keep this key private.
      </p>
      <h2 className="h4" style={{ marginBottom: ".6rem" }}>
        2. Enter the code the app shows
      </h2>
      {codeField}
      {skip}
    </AuthCard>
  );
}

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactor />
    </Suspense>
  );
}
