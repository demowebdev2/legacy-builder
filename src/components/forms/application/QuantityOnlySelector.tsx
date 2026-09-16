"use client";

import { PURCHASE_INCREMENT, PURCHASE_MAXIMUM, PURCHASE_MINIMUM } from "@/domain/constants";
import { leadMixFor, snapPurchaseQuantity } from "@/domain/purchase";

/**
 * The prototype quantity picker without the bill, for AGENT-ONLY pricing mode before the applicant has a
 * login that may see rates. The order total is shown (from the server) before the card is authorised.
 */
export function QuantityOnlySelector({ quantity, onChange }: { quantity: number; onChange: (quantity: number) => void }) {
  const q = snapPurchaseQuantity(quantity);
  const mix = leadMixFor(q);
  return (
    <div>
      <div className="qty-l" id="qty-only-label">
        How many leads?
      </div>
      <div className="qty" role="group" aria-labelledby="qty-only-label">
        <button type="button" onClick={() => onChange(q - PURCHASE_INCREMENT)} disabled={q <= PURCHASE_MINIMUM} aria-label="Fewer leads">
          −
        </button>
        <span className="n" aria-live="polite">
          {q}
        </span>
        <button type="button" onClick={() => onChange(q + PURCHASE_INCREMENT)} disabled={q >= PURCHASE_MAXIMUM} aria-label="More leads">
          +
        </button>
      </div>
      <p className="xs tc">
        Minimum {PURCHASE_MINIMUM}, then in steps of {PURCHASE_INCREMENT}
      </p>
      <div className="split-bar" aria-hidden="true">
        <i className="exc" style={{ width: `${(mix.exclusive / q) * 100}%` }} />
        <i className="std" style={{ width: `${(mix.standard / q) * 100}%` }} />
      </div>
      <div className="split-k">
        <span>
          <span className="swatch exc" />
          <b>{mix.exclusive}</b> exclusive
        </span>
        <span>
          <span className="swatch std" />
          <b>{mix.standard}</b> standard
        </span>
      </div>
      <p className="xs tc" style={{ marginTop: ".8rem" }}>
        Rates are shown to signed-in agents. Your total is confirmed before your card is authorised · no subscription · nothing expires
      </p>
    </div>
  );
}
