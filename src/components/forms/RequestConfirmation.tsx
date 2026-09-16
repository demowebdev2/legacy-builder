"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { ButtonLink } from "@/components/ui/Button";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";

/**
 * Prototype "You are all set" card (P.request step 5). Live query, so matched agents' business names appear
 * as soon as the lead is released (decision D22). No consumer PII is ever returned.
 */
export function RequestConfirmation({ reference, token }: { reference: string; token: string }) {
  const hasParams = !!reference && !!token;
  const result = useQuery(api.intake.confirmation, hasParams ? { reference, token } : "skip");

  if (hasParams && result === undefined) {
    return (
      <div className="pw pw-n">
        <div className="card card-p stack" style={{ padding: "2.5rem 1.5rem", alignItems: "center" }} aria-busy="true">
          <Skeleton height={52} width={52} />
          <Skeleton height={26} width="40%" />
          <Skeleton height={14} width="70%" />
        </div>
      </div>
    );
  }

  if (!hasParams || !result) {
    return (
      <div className="pw pw-n">
        <div className="card card-p tc" style={{ padding: "2.5rem 1.5rem" }}>
          <div className="empty" style={{ padding: 0 }}>
            <div className="ic">
              <Icon name="search" />
            </div>
          </div>
          <h1 className="h2" style={{ margin: ".9rem 0 .5rem" }}>
            We could not open that confirmation
          </h1>
          <p className="sm" style={{ maxWidth: "48ch", margin: "0 auto 1.2rem" }}>
            The link may be incomplete or out of date. If you submitted a request, your reference number is in the email we sent you — you can use it to withdraw
            your consent at any time.
          </p>
          <div className="b-row" style={{ justifyContent: "center" }}>
            <ButtonLink href="/" variant="out">
              Back to home
            </ButtonLink>
            <ButtonLink href="/request/withdraw" variant="navy">
              Withdraw consent
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pw pw-n">
      <div className="card card-p tc" style={{ padding: "2.5rem 1.5rem" }}>
        <div className="empty" style={{ padding: 0 }}>
          <div className="ic" style={{ background: result.withdrawn ? "var(--soft-2)" : "var(--green-wash)", color: result.withdrawn ? "var(--gray)" : "var(--green)" }}>
            <Icon name={result.withdrawn ? "ban" : "check"} />
          </div>
        </div>
        <h1 className="h2" style={{ margin: ".9rem 0 .5rem" }}>
          {result.withdrawn ? "Consent withdrawn" : "You are all set"}
        </h1>
        <p className="sm" style={{ maxWidth: "46ch", margin: "0 auto 1.2rem" }}>
          {result.withdrawn ? (
            <>Nobody will contact you about this request. </>
          ) : (
            <>A licensed agent will contact you, usually within one business day. We have emailed you a copy of your request. </>
          )}
          Reference <b className="mono">{result.reference}</b>.
        </p>
        <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "left" }} aria-live="polite">
          {result.withdrawn ? (
            <Alert kind="n">You withdrew your consent for this request. Any agent who received it has been told to stop contacting you.</Alert>
          ) : result.agents.length > 0 ? (
            <Alert kind="s">
              <b>You have been matched.</b> Your request has been passed to {formatNames(result.agents)}. Expect to hear from them soon, using the contact method you chose.
            </Alert>
          ) : (
            <Alert kind="i">
              <b>We are finding the right agent.</b> A licensed agent in your state who works the cover you asked about will contact you, usually within one business
              day.
            </Alert>
          )}
        </div>
        <div className="b-row" style={{ justifyContent: "center", marginTop: "1.4rem" }}>
          <ButtonLink href="/" variant="out">
            Back to home
          </ButtonLink>
          <ButtonLink href="/faq" variant="navy">
            Questions? Read the FAQ
          </ButtonLink>
        </div>
        {!result.withdrawn && (
          <p className="xs" style={{ marginTop: "1.1rem" }}>
            Changed your mind?{" "}
            <Link className="link" href={`/request/withdraw?ref=${encodeURIComponent(result.reference)}`}>
              Withdraw your consent
            </Link>{" "}
            and all contact stops.
          </p>
        )}
      </div>
    </div>
  );
}

function formatNames(names: string[]): string {
  const unique = Array.from(new Set(names));
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}
