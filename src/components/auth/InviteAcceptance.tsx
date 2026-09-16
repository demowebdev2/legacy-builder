"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { Field, FieldGrid } from "@/components/ui/Form";
import { PASSWORD_MIN_LENGTH } from "@/domain/constants";
import { destinationFor } from "@/hooks/usePostLoginRedirect";
import { errorMessage } from "@/lib/errors";
import { AuthCard } from "./AuthCard";

type InviteType = "seat" | "staff";

const ROLE_LABELS: Record<string, string> = { ADMIN: "Admin", SUPPORT: "Support", FINANCE: "Finance", CONTENT: "Content" };

/** (new) Accept a producer-seat or staff invitation: create (or sign in to) the invited login, then accept. */
export function InviteAcceptance({ token, type }: { token: string; type: string }) {
  if (type !== "seat" && type !== "staff") {
    return <InvalidInvite reason="This invitation link is incomplete. Open it again from the invitation email." />;
  }
  return <InviteFlow token={token} type={type} />;
}

function InvalidInvite({ reason }: { reason?: string }) {
  return (
    <AuthCard title="Invitation unavailable" footer={<Link href="/auth/login">Go to sign in</Link>}>
      <Alert kind="w">{reason ?? "This invitation is invalid, has already been used, or has expired. Ask whoever invited you to send a new one."}</Alert>
    </AuthCard>
  );
}

function InviteFlow({ token, type }: { token: string; type: InviteType }) {
  const router = useRouter();
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const seatInfo = useQuery(api.agencyMembers.invitationInfo, type === "seat" ? { token } : "skip");
  const staffInfo = useQuery(api.publicViews.staffInvitationInfo, type === "staff" ? { token } : "skip");
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const acceptSeat = useMutation(api.agencyMembers.acceptInvitation);
  const acceptStaff = useMutation(api.users.acceptStaffInvitation);

  const info = type === "seat" ? seatInfo : staffInfo;
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const authRef = useRef(isAuthenticated);

  useEffect(() => {
    authRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    if (accepted && me && me.kind !== "none") router.replace(destinationFor(me, null));
  }, [accepted, me, router]);

  // Seeded name for a producer seat comes from the invitation; staff enter their own.
  const title = type === "seat" ? `Join ${seatInfo?.agencyName ?? "your agency"}` : "Join the Legacy Builders team";

  if (!pending && (info === undefined || isLoading || (isAuthenticated && me === undefined))) {
    return (
      <AuthCard title="Checking your invitation">
        <Skeleton height={180} />
      </AuthCard>
    );
  }
  if (info === null && !accepted) return <InvalidInvite />;

  const invitedEmail = info?.email ?? "";

  const waitForAuth = async () => {
    const started = Date.now();
    while (!authRef.current) {
      if (Date.now() - started > 20_000) throw new Error("Signing you in is taking longer than expected. Please try again.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  const accept = async () => {
    if (type === "seat") await acceptSeat({ token });
    else await acceptStaff({ token, firstName: firstName.trim(), lastName: lastName.trim() });
    setAccepted(true);
  };

  const validate = (needsPassword: boolean) => {
    const found: Record<string, string> = {};
    if (type === "staff") {
      if (!firstName.trim()) found.firstName = "Enter your first name.";
      if (!lastName.trim()) found.lastName = "Enter your last name.";
    }
    if (needsPassword) {
      if (mode === "create" && password.length < PASSWORD_MIN_LENGTH) found.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
      if (mode === "signin" && !password) found.password = "Enter your password.";
      if (mode === "create" && confirm !== password) found.confirm = "Passwords do not match.";
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!validate(!isAuthenticated)) return;
    setPending(true);
    try {
      if (!isAuthenticated) {
        try {
          await signIn("password", { email: invitedEmail, password, flow: mode === "create" ? "signUp" : "signIn" });
        } catch {
          if (mode === "create") {
            setMode("signin");
            setFormError("A login already exists for this email address. Enter its password to accept the invitation.");
          } else {
            setFormError("That password is not right for this email address. Try again, or reset your password.");
          }
          return;
        }
        await waitForAuth();
      }
      await accept();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };

  const signedInElsewhere = isAuthenticated && me && me.email && invitedEmail && me.email.toLowerCase() !== invitedEmail.toLowerCase();
  const alreadyHasRole = isAuthenticated && me && me.kind !== "none" && !accepted;

  const footer = (
    <>
      Not expecting this? You can ignore the invitation.
      <br />
      <Link href="/">Legacy Builders home</Link>
    </>
  );

  if (accepted) {
    return (
      <AuthCard title="Invitation accepted" footer={footer}>
        <Alert kind="s">You are all set. Taking you in…</Alert>
      </AuthCard>
    );
  }

  if (!pending && (signedInElsewhere || alreadyHasRole)) {
    return (
      <AuthCard title={title} footer={footer}>
        <Alert kind="w">
          {signedInElsewhere ? (
            <>
              You are signed in as <b>{me?.email}</b>, but this invitation was sent to <b>{info?.maskedEmail}</b>. Sign out, then open the invitation link again.
            </>
          ) : (
            <>
              The login <b>{me?.email}</b> already belongs to an account, so it cannot accept this invitation. Ask for the invitation to be sent to a different
              email address.
            </>
          )}
        </Alert>
        <Button variant="navy" full className="mt-4" onClick={() => void signOut()}>
          Sign out
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={title}
      subtitle={
        type === "seat" ? (
          <>You have been invited to a producer seat. Leads your agency hands to you will appear in your portal.</>
        ) : (
          <>You have been invited to the back office as {ROLE_LABELS[staffInfo?.role ?? ""] ?? "staff"}. Create your login to get started.</>
        )
      }
      footer={footer}
    >
      <form onSubmit={onSubmit} noValidate>
        {formError && (
          <div style={{ marginBottom: "1rem" }}>
            <Alert kind="e">{formError}</Alert>
          </div>
        )}
        <Field label="Email" help="Invitations can only be accepted with the email address they were sent to.">
          <input type="email" value={invitedEmail} disabled readOnly autoComplete="username" />
        </Field>
        {type === "staff" && (
          <FieldGrid>
            <Field label="First name" required error={errors.firstName}>
              <input name="firstName" autoComplete="given-name" maxLength={60} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Last name" required error={errors.lastName}>
              <input name="lastName" autoComplete="family-name" maxLength={60} value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </FieldGrid>
        )}
        {isAuthenticated ? (
          <p className="sm" style={{ marginBottom: "1rem" }}>
            You are signed in as <b>{me?.email}</b>.
          </p>
        ) : (
          <>
            <Field
              label={mode === "create" ? "Create a password" : "Password"}
              required
              error={errors.password}
              help={mode === "create" ? `At least ${PASSWORD_MIN_LENGTH} characters.` : undefined}
            >
              <input
                type="password"
                name="password"
                autoComplete={mode === "create" ? "new-password" : "current-password"}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {mode === "create" && (
              <Field label="Confirm password" required error={errors.confirm}>
                <input type="password" name="confirm" autoComplete="new-password" maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
            )}
          </>
        )}
        <Button type="submit" variant="navy" full loading={pending}>
          {isAuthenticated ? "Accept invitation" : mode === "create" ? "Create login and accept" : "Sign in and accept"}
        </Button>
        {!isAuthenticated && (
          <p className="xs tc" style={{ marginTop: ".9rem" }}>
            {mode === "create" ? "Already have a login for this email? " : "New to Legacy Builders? "}
            <button
              type="button"
              className="link"
              onClick={() => {
                setMode(mode === "create" ? "signin" : "create");
                setErrors({});
                setFormError(null);
              }}
            >
              {mode === "create" ? "Sign in instead" : "Create a login"}
            </button>
            {mode === "signin" && (
              <>
                {" · "}
                <Link className="link" href={`/auth/forgot-password?email=${encodeURIComponent(invitedEmail)}`}>
                  Forgot password?
                </Link>
              </>
            )}
          </p>
        )}
      </form>
    </AuthCard>
  );
}
