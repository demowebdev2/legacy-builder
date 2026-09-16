"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import { PaymentForm } from "@/components/balance/PaymentForm";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert, LoadingBlock } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { formatDate } from "@/domain/format";
import { formatMoney } from "@/domain/money";
import { DEFAULT_STATES } from "@/domain/referenceDefaults";
import { destinationFor } from "@/hooks/usePostLoginRedirect";

const APPLICANT_STATUSES = new Set(["pending_verification", "action_required", "rejected"]);
const stateName = (code: string) => DEFAULT_STATES.find((s) => s.code === code)?.name ?? code;

/** (new) Landing page for signed-in applicants whose account is not active yet (SCREEN-INVENTORY A17). */
export default function ApplicationPendingPage() {
  const router = useRouter();
  const { signOut } = useAuthActions();
  const me = useQuery(api.users.me);
  const isApplicant = me?.kind === "account" && !!me.account && APPLICANT_STATUSES.has(me.account.status);
  const application = useQuery(api.applications.mine, isApplicant ? {} : "skip");
  const [paymentMessage, setPaymentMessage] = useState<{ kind: "s" | "e"; text: string } | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (me === undefined || signingOut) return;
    if (me === null) router.replace("/auth/login?next=/apply/pending");
    else if (!isApplicant) router.replace(destinationFor(me, null));
  }, [me, isApplicant, router, signingOut]);

  const onSignOut = async () => {
    setSigningOut(true);
    await signOut();
    router.replace("/");
  };

  if (!isApplicant || application === undefined) {
    return (
      <div className="pw pw-n">
        <LoadingBlock rows={5} label="Loading your application" />
      </div>
    );
  }

  const { account, openingOrder: order, licenses, eo, tpmo } = application;
  const needsPayment = !!order && (order.status === "requires_payment" || order.status === "failed") && account.status !== "rejected";

  return (
    <div className="pw pw-n">
      <div className="row-b" style={{ marginBottom: "1.2rem", alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: ".3rem" }}>
            Your application
          </div>
          <h1 className="h2" style={{ marginBottom: ".3rem" }}>
            {account.name}
          </h1>
          <p className="sm">
            {account.type === "agency" ? "Agency" : "Individual producer"} · applied {formatDate(account.appliedAt)}
          </p>
        </div>
        <div className="b-row">
          <StatusBadge status={account.status} />
          <Button variant="ghost" size="s" icon="out" onClick={onSignOut} loading={signingOut}>
            Sign out
          </Button>
        </div>
      </div>

      <div className="stack">
        {account.status === "pending_verification" && (
          <Alert kind="i">
            <b>We are checking your producer number and licences.</b> Most applications are decided within one business day. We will email you when a decision is made.
          </Alert>
        )}
        {account.status === "action_required" && (
          <Alert kind="w">
            <b>We need something from you.</b> {account.statusReason ?? "Our licensing team has asked for more information."} Reply to our email or{" "}
            <Link href="/contact">contact us</Link> and we will pick it up.
          </Alert>
        )}
        {account.status === "rejected" && (
          <Alert kind="e">
            <b>Your application was not approved.</b> {account.statusReason ?? ""} Any card authorisation has been released and nothing was charged. If you think this
            is wrong, <Link href="/contact">contact us</Link>.
          </Alert>
        )}
        {paymentMessage && <Alert kind={paymentMessage.kind}>{paymentMessage.text}</Alert>}

        {needsPayment && order && (
          <div className="card">
            <div className="card-hd">
              <div>
                <h2 className="h3">{order.status === "failed" ? "Your card was declined" : "Authorise your card"}</h2>
                <p className="sm">Your card is authorised now and only charged once your licence is verified.</p>
              </div>
              <StatusBadge status={order.status} />
            </div>
            <div className="card-bd">
              <div className="bill" style={{ borderTop: 0, marginTop: 0, paddingTop: 0, marginBottom: "1rem" }}>
                <div>
                  <span>
                    {order.exclusiveQty} exclusive · {order.standardQty} standard
                  </span>
                  <b>{order.exclusiveQty + order.standardQty} leads</b>
                </div>
                <div className="tot">
                  <span>Opening purchase</span>
                  <span>{formatMoney(order.totalCents)}</span>
                </div>
              </div>
              <PaymentForm
                orderId={order.id}
                amountCents={order.totalCents}
                authorizeOnly
                onComplete={(outcome) =>
                  setPaymentMessage(
                    outcome === "failed"
                      ? { kind: "e", text: "Your card was declined. Try again, or use a different card." }
                      : { kind: "s", text: "Your card has been authorised. It will only be charged once your licence is verified." },
                  )
                }
              />
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-hd">
            <h2 className="h3">Verification checklist</h2>
          </div>
          <div className="card-bd stack" style={{ gap: "1.1rem" }}>
            <section>
              <h3 className="eyebrow" style={{ marginBottom: ".5rem" }}>
                State licences
              </h3>
              {licenses.length === 0 ? (
                <p className="sm">No licences on file.</p>
              ) : (
                <ul className="stack" style={{ listStyle: "none", gap: ".5rem" }}>
                  {licenses.map((l) => (
                    <li key={l._id} className="row-b crd" style={{ padding: ".65rem .85rem" }}>
                      <span>
                        <span className="strong">{stateName(l.state)}</span>
                        <span className="tsub">
                          Licence <span className="mono">{l.licenseNumber}</span> · expires {formatDate(l.expiresAt)}
                        </span>
                      </span>
                      <StatusBadge status={l.verificationStatus} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="eyebrow" style={{ marginBottom: ".5rem" }}>
                Errors and omissions cover
              </h3>
              {eo ? (
                <div className="row-b crd" style={{ padding: ".65rem .85rem" }}>
                  <span>
                    <span className="strong">{eo.carrier}</span>
                    <span className="tsub">
                      {eo.policyNumber ? (
                        <>
                          Policy <span className="mono">{eo.policyNumber}</span> ·{" "}
                        </>
                      ) : null}
                      expires {formatDate(eo.expiresAt)}
                    </span>
                  </span>
                  <StatusBadge status={eo.verificationStatus} />
                </div>
              ) : (
                <p className="sm">No E&amp;O policy on file.</p>
              )}
            </section>

            <section>
              <h3 className="eyebrow" style={{ marginBottom: ".5rem" }}>
                Medicare TPMO
              </h3>
              <div className="row-b crd" style={{ padding: ".65rem .85rem" }}>
                <span>
                  <span className="strong">Third-Party Marketing Organization approval</span>
                  <span className="tsub">Needed only to receive Medicare leads.</span>
                </span>
                {tpmo.approved ? (
                  <StatusBadge status="approved" />
                ) : tpmo.pending ? (
                  <StatusBadge status="requested" />
                ) : tpmo.history.length ? (
                  <StatusBadge status={tpmo.history[0].status} />
                ) : (
                  <StatusBadge status="not_required" label="Not requested" />
                )}
              </div>
            </section>

            <section>
              <h3 className="eyebrow" style={{ marginBottom: ".5rem" }}>
                Opening purchase
              </h3>
              {order ? (
                <div className="row-b crd" style={{ padding: ".65rem .85rem" }}>
                  <span>
                    <span className="strong">
                      {order.exclusiveQty + order.standardQty} leads · {formatMoney(order.totalCents)}
                    </span>
                    <span className="tsub">
                      Order <span className="mono">{order.orderNumber}</span> ·{" "}
                      {order.status === "authorized"
                        ? "card authorised, charged only once you are approved"
                        : order.status === "paid"
                          ? "charged"
                          : order.status === "canceled"
                            ? "authorisation released, nothing charged"
                            : "waiting for card authorisation"}
                    </span>
                  </span>
                  <StatusBadge status={order.status} />
                </div>
              ) : (
                <p className="sm">No opening purchase on file.</p>
              )}
            </section>
          </div>
          <div className="card-ft">
            <span className="row xs" style={{ gap: ".4rem", flexWrap: "nowrap" }}>
              <Icon name="lock" /> Only you and the Legacy Builders licensing team can see this.
            </span>
            <Link className="link sm" href="/contact">
              Questions? Contact us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
