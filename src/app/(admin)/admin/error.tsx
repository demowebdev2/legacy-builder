"use client";

import { useEffect } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Alert, ErrorState } from "@/components/ui/Feedback";
import { errorCode, errorMessage } from "@/lib/errors";

/** Admin route error boundary: permission and two-factor failures get a clear next step; anything else a retry. */
export default function AdminError({ error, retry, reset }: { error: Error & { digest?: string }; retry?: () => void; reset?: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const again = retry ?? reset;
  const code = errorCode(error);
  const message = errorMessage(error);
  const text = `${code ?? ""} ${message}`;

  if (code === "MFA_REQUIRED" || code === "MFA_SETUP_REQUIRED" || /two-factor/i.test(text)) {
    return (
      <div className="card card-bd" style={{ maxWidth: 560 }}>
        <Alert kind="w">
          <b>{code === "MFA_SETUP_REQUIRED" ? "Set up two-factor authentication to continue." : "Two-factor verification required."}</b> Staff access to the
          back office requires a verified second factor for this session.
        </Alert>
        <div className="b-row" style={{ marginTop: "1rem" }}>
          <ButtonLink href="/auth/two-factor" variant="navy" size="s" icon="lock">
            {code === "MFA_SETUP_REQUIRED" ? "Set up two-factor" : "Verify now"}
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (code === "FORBIDDEN" || code === "UNAUTHENTICATED" || /permission|not authori[sz]ed|forbidden/i.test(text)) {
    return (
      <div className="card card-bd" style={{ maxWidth: 560 }}>
        <Alert kind="e">
          <b>{code === "UNAUTHENTICATED" ? "Your session has ended." : "Your role cannot open this page."}</b>{" "}
          {code === "UNAUTHENTICATED" ? "Sign in again to continue." : message}
        </Alert>
        <div className="b-row" style={{ marginTop: "1rem" }}>
          {code === "UNAUTHENTICATED" ? (
            <ButtonLink href="/auth/login?next=/admin" variant="navy" size="s">
              Sign in
            </ButtonLink>
          ) : (
            <ButtonLink href="/admin" variant="out" size="s" icon="back">
              Back to the dashboard
            </ButtonLink>
          )}
        </div>
      </div>
    );
  }

  if (/ArgumentValidationError|Value does not match validator|Invalid ID/i.test(error.message)) {
    return <ErrorState title="That record link is not valid." message="Check the address — the id in the URL is malformed." onRetry={again} />;
  }

  return <ErrorState message={message} onRetry={again} />;
}
