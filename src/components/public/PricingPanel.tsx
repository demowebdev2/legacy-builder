"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { PurchaseQuantitySelector } from "@/components/balance/PurchaseQuantitySelector";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { PURCHASE_MINIMUM } from "@/domain/constants";
import { formatMoney, formatRate } from "@/domain/money";
import { leadMixFor, snapPurchaseQuantity } from "@/domain/purchase";
import { AGENT_STEPS, BuyingTerms, EXCLUSIVE_BLURB, NumberedSteps, STANDARD_BLURB } from "./AgentExplainer";
import { Reveal } from "./Reveal";

export type PublicRateCard = FunctionReturnType<typeof api.pricing.publicRateCard>;

/**
 * Interactive part of the public pricing page (prototype `P.pricing`). The server passes the anonymous rate
 * card for first paint; the live query re-runs with the visitor's session so signed-in agents see rates even
 * when pricing is in AGENT-ONLY mode.
 */
export function PricingPanel({ initial }: { initial: PublicRateCard | null }) {
  const live = useQuery(api.pricing.publicRateCard);
  const card = live ?? initial;
  const [quantity, setQuantity] = useState(PURCHASE_MINIMUM);
  const qty = snapPurchaseQuantity(quantity);
  const mix = leadMixFor(qty);

  if (!card) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <Alert kind="w">Rates are not available right now. Please try again shortly, or apply and your total will be confirmed before your card is authorised.</Alert>
      </div>
    );
  }

  const visible = card.visible;

  return (
    <div className="g g-1-2" style={{ alignItems: "start" }}>
      <Reveal className="card card-p pricing-sticky">
        {visible ? (
          <>
            <PurchaseQuantitySelector
              quantity={qty}
              onChange={(q) => setQuantity(snapPurchaseQuantity(q))}
              standardRateCents={card.standardRateCents}
              exclusiveRateCents={card.exclusiveRateCents}
            />
            <ButtonLink href={`/apply?qty=${qty}`} variant="gold" size="lg" full style={{ marginTop: "1rem" }}>
              Continue with {qty} leads
            </ButtonLink>
            <p className="xs tc" style={{ marginTop: ".6rem" }}>
              Your card is authorised now and only charged once your licence is verified.
            </p>
          </>
        ) : (
          <div className="tc">
            <div className="empty" style={{ padding: "0 0 .2rem" }}>
              <div className="ic">
                <Icon name="lock" />
              </div>
            </div>
            <h2 className="h3" style={{ marginBottom: ".35rem" }}>
              Rates are shown to signed-in agents
            </h2>
            <p className="sm" style={{ marginBottom: "1.1rem" }}>
              Sign in to see current per-lead rates and members-only bundles. New to Legacy Builders? Apply to join — your total is shown before your card is
              authorised.
            </p>
            <div className="stack" style={{ gap: ".5rem" }}>
              <ButtonLink href="/auth/login?next=/pricing" variant="navy" full>
                Agent sign in
              </ButtonLink>
              <ButtonLink href="/apply" variant="gold" full>
                Apply to join
              </ButtonLink>
            </div>
          </div>
        )}
      </Reveal>

      <div className="stack">
        <Reveal className="card card-p">
          <h2 className="h3" style={{ marginBottom: ".8rem" }}>
            What you are buying
          </h2>
          <div className="g g2">
            <div className="crd">
              <div className="t">Exclusive{visible ? ` · ${formatMoney(card.exclusiveRateCents)}` : ""}</div>
              <div className="v">{visible ? mix.exclusive : "2 in 10"}</div>
              <div className="xs">{EXCLUSIVE_BLURB}</div>
            </div>
            <div className="crd">
              <div className="t">Standard{visible ? ` · ${formatMoney(card.standardRateCents)}` : ""}</div>
              <div className="v">{visible ? mix.standard : "8 in 10"}</div>
              <div className="xs">{STANDARD_BLURB}</div>
            </div>
          </div>
          <hr className="hr" />
          <BuyingTerms />
        </Reveal>

        <NumberedSteps steps={AGENT_STEPS} />

        {visible && card.bundles.length > 0 && (
          <div className="card">
            <div className="card-hd">
              <h2 className="h3">Volume bundles, once you are in</h2>
              <Badge tone="a">Members only</Badge>
            </div>
            <div className="card-bd">
              <p className="sm" style={{ marginBottom: "1rem" }}>
                Buy more at a lower rate per lead than you paid at signup. Same fixed mix, same balance, still no expiry.
              </p>
              <div className="g g3">
                {card.bundles.map((b) => (
                  <div key={b.id} className="crd" style={b.featured ? { borderColor: "var(--gold)" } : undefined}>
                    <div className="t">{b.name}</div>
                    <div className="v">{formatMoney(b.quote.totalCents)}</div>
                    <div className="xs">
                      {b.quote.exclusive} exclusive · {b.quote.standard} standard
                      <br />
                      {formatRate(b.quote.perLeadCents)} per lead · {b.discountPercent > 0 ? `saves ${b.discountPercent}%` : "same as signup rate"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
