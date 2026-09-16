"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Form";
import { normalizeEmail } from "@/domain/normalize";

function ForgotPasswordForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await signIn("password", { email: normalized, flow: "reset" });
    } catch {
      // Deliberately ignored: the next screen reads the same whether or not the account exists.
    }
    router.push(`/auth/verify?email=${encodeURIComponent(normalized)}&sent=1`);
  };

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter the email you sign in with and we will send you a code."
      footer={
        <>
          Remembered it? <Link href="/auth/login">Back to sign in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <Field label="Email" required error={error}>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError(null);
            }}
          />
        </Field>
        <Button type="submit" variant="navy" full loading={pending} disabled={!email}>
          Send reset code
        </Button>
        <p className="xs tc" style={{ marginTop: ".9rem" }}>
          Already have a code?{" "}
          <Link className="link" href={`/auth/verify${email ? `?email=${encodeURIComponent(email)}` : ""}`}>
            Enter it here
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
