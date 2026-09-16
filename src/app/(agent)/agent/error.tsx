"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/Feedback";
import { errorCode, errorMessage } from "@/lib/errors";

/** Agent portal error boundary — the sidebar and top bar stay usable (prototype `.fatal`). */
export default function AgentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const code = errorCode(error);
  const badLink = /ArgumentValidationError|Value does not match validator/i.test(error.message);

  if (badLink) {
    return (
      <ErrorState
        title="That link is not valid."
        message="The address does not point to a record. Check the link, or open the record from its list."
      />
    );
  }

  const title =
    code === "FORBIDDEN" ? "You do not have access to this screen." : code === "NOT_FOUND" ? "That record could not be found." : "Something failed while drawing this screen.";

  return <ErrorState title={title} message={errorMessage(error, "An unexpected error occurred.")} onRetry={reset} />;
}
