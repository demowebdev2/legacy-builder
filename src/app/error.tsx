"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui/Feedback";

/** Root error boundary. Shows the prototype `.fatal` box; details only in development. */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[app] render error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="pw pw-n">
      <ErrorState
        title="Something went wrong while loading this page."
        message={process.env.NODE_ENV === "development" ? error.message : error.digest ? `Reference: ${error.digest}` : undefined}
        onRetry={retry}
      />
      <p className="sm tc" style={{ marginTop: ".5rem" }}>
        <Link className="link" href="/">
          Back to home
        </Link>
      </p>
    </div>
  );
}
