"use client";

import { PURCHASE_INCREMENT, PURCHASE_MAXIMUM, PURCHASE_MINIMUM } from "@/domain/constants";
import { formatMoney, formatRate } from "@/domain/money";
import { quotePurchase, snapPurchaseQuantity } from "@/domain/purchase";

/**
 * Prototype `qtyPicker(qty)`: ±5 stepper (min 10, max 100), split bar, bill and per-lead price.
 * The quote shown here is a preview; the server recomputes price and mix when the order is created.
 */
export function PurchaseQuantitySelector({
  quantity,
  onChange,
  standardRateCents,
  exclusiveRateCents,
  discountPercent = 0,
  showSeats = true,
  totalLabel = "Total, one payment",
}: {
  quantity: number;
  onChange: (quantity: number) => void;
  standardRateCents: number;
  exclusiveRateCents: number;
  discountPercent?: number;
  showSeats?: boolean;
  totalLabel?: string;
}) {
  const q = snapPurchaseQuantity(quantity);
  const quote = quotePurchase(q, { standardRateCents, exclusiveRateCents }, discountPercent);
  return (
    <div>
      <div className="qty-l" id="qty-label">
        How many leads?
      </div>
      <div className="qty" role="group" aria-labelledby="qty-label">
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
        <i className="exc" style={{ width: `${(quote.exclusive / q) * 100}%` }} />
        <i className="std" style={{ width: `${(quote.standard / q) * 100}%` }} />
      </div>
      <div className="split-k">
        <span>
          <span className="swatch exc" />
          <b>{quote.exclusive}</b> exclusive
        </span>
        <span>
          <span className="swatch std" />
          <b>{quote.standard}</b> standard
        </span>
      </div>
      <div className="bill">
        <div>
          <span>
            {quote.standard} standard at {formatMoney(standardRateCents)}
          </span>
          <b>{formatMoney(quote.standardSubtotalCents)}</b>
        </div>
        <div>
          <span>
            {quote.exclusive} exclusive at {formatMoney(exclusiveRateCents)}
          </span>
          <b>{formatMoney(quote.exclusiveSubtotalCents)}</b>
        </div>
        {quote.discountCents > 0 && (
          <div>
            <span>Bundle discount {quote.discountPercent}%</span>
            <b>−{formatMoney(quote.discountCents)}</b>
          </div>
        )}
        {showSeats && (
          <div>
            <span>Producer seats</span>
            <b>Included</b>
          </div>
        )}
        <div className="tot">
          <span>{totalLabel}</span>
          <span>{formatMoney(quote.totalCents)}</span>
        </div>
      </div>
      <p className="xs tc" style={{ marginTop: ".5rem" }}>
        {formatRate(quote.perLeadCents)} per lead · no subscription · nothing expires
      </p>
    </div>
  );
}
