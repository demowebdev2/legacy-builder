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
import { PASSWORD_MIN_LENGTH } from "@/domain/constants";
import { normalizeEmail } from "@/domain/normalize";
import { usePostLoginRedirect } from "@/hooks/usePostLoginRedirect";

function VerifyForm() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  usePostLoginRedirect(isAuthenticated && done, params.get("next"));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const found: Record<string, string> = {};
    const normalized = normalizeEmail(email);
    if (!normalized) found.email = "Enter a valid email address.";
    if (!/^\d{6,10}$/.test(code.trim())) found.code = "Enter the code from the email.";
    if (password.length < PASSWORD_MIN_LENGTH) found.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    else if (password.length > 128) found.password = "Password is too long.";
    if (confirm !== password) found.confirm = "Passwords do not match.";
    setErrors(found);
    if (Object.keys(found).length || !normalized) return;
    setPending(true);
    try {
      await signIn("password", { email: normalized, code: code.trim(), newPassword: password, flow: "reset-verification" });
      setDone(true);
    } catch {
      setFormError("That code is not valid or has expired. Check the latest email, or request a new code.");
      setPending(false);
    }
  };

  const clear = (key: string) => errors[key] && setErrors((x) => ({ ...x, [key]: "" }));

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Enter the code we emailed you and pick a new password."
      footer={
        <>
          No email? Check your spam folder, or <Link href={`/auth/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}>send a new code</Link>.
          <br />
          <Link href="/auth/login">Back to sign in</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {params.get("sent") && !formError && (
          <div style={{ marginBottom: "1rem" }}>
            <Alert kind="s">If an account exists for that email address, we have sent it a reset code. The code expires in 15 minutes.</Alert>
          </div>
        )}
        {formError && (
          <div style={{ marginBottom: "1rem" }}>
            <Alert kind="e">{formError}</Alert>
          </div>
        )}
        <Field label="Email" required error={errors.email}>
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clear("email");
            }}
          />
        </Field>
        <Field label="Reset code" required error={errors.code}>
          <input
            name="code"
            className="otp-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ""));
              clear("code");
            }}
          />
        </Field>
        <Field label="New password" required error={errors.password} help={`At least ${PASSWORD_MIN_LENGTH} characters.`}>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            maxLength={128}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clear("password");
            }}
          />
        </Field>
        <Field label="Confirm new password" required error={errors.confirm}>
          <input
            type="password"
            name="confirm"
            autoComplete="new-password"
            maxLength={128}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              clear("confirm");
            }}
          />
        </Field>
        <Button type="submit" variant="navy" full loading={pending}>
          Set new password and sign in
        </Button>
      </form>
    </AuthCard>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
