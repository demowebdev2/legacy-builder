"use client";

import { PageHeader } from "@/components/layouts/PortalShell";
import { ButtonLink } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";
import { errorMessage } from "@/lib/errors";

export default function AccountError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const message = errorMessage(error);
  const badId = /ArgumentValidationError|Value does not match validator|Invalid argument/i.test(error.message);
  return (
    <>
      <PageHeader title="Account" />
      <ButtonLink href="/admin/accounts" variant="ghost" size="s" icon="back" style={{ marginBottom: ".9rem" }}>
        Back to accounts
      </ButtonLink>
      <ErrorState
        title={badId ? "That is not a valid account link." : "This account could not be loaded."}
        message={badId ? undefined : message}
        onRetry={badId ? undefined : retry}
      />
    </>
  );
}
