"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { usePostLoginRedirect } from "@/hooks/usePostLoginRedirect";

function LoginForm() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  usePostLoginRedirect(isAuthenticated, params.get("next"));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await signIn("password", { email, password, flow: "signIn" });
    } catch {
      // Never reveal whether the email exists.
      setError("That email and password do not match. Check them and try again.");
      setPending(false);
    }
  };

  return (
    <AuthCard
      title="Sign in"
      subtitle="Agents, agencies and Legacy Builders staff."
      footer={
        <>
          New to Legacy Builders? <Link href="/apply">Apply to join as an agent</Link>
          <br />
          Looking for cover? <Link href="/request">Get matched free</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {error && (
          <div style={{ marginBottom: "1rem" }}>
            <Alert kind="e">{error}</Alert>
          </div>
        )}
        <Field label="Email" required>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" required>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="navy" full loading={pending || isAuthenticated} disabled={!email || !password}>
          Sign in
        </Button>
        <p className="xs tc" style={{ marginTop: ".9rem" }}>
          <Link className="link" href="/auth/forgot-password">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
