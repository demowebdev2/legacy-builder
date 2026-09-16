import {
  EXCLUSIVE_PER_INCREMENT,
  PURCHASE_INCREMENT,
  PURCHASE_MAXIMUM,
  PURCHASE_MINIMUM,
  STANDARD_PER_INCREMENT,
} from "./constants";

/**
 * Purchase rules — the single source of truth for quantity validation, lead mix and price.
 *
 * Every 10 leads = 2 exclusive + 8 standard; every additional 5 = 1 exclusive + 4 standard.
 * Equivalently: exclusive = quantity / 5, standard = quantity × 4 / 5.
 */

export class PurchaseRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseRuleError";
  }
}

export function isValidPurchaseQuantity(quantity: unknown): quantity is number {
  return (
    typeof quantity === "number" &&
    Number.isInteger(quantity) &&
    quantity >= PURCHASE_MINIMUM &&
    quantity <= PURCHASE_MAXIMUM &&
    quantity % PURCHASE_INCREMENT === 0
  );
}

export function assertValidPurchaseQuantity(quantity: unknown): number {
  if (!isValidPurchaseQuantity(quantity)) {
    throw new PurchaseRuleError(
      `Lead purchases start at ${PURCHASE_MINIMUM} and move in steps of ${PURCHASE_INCREMENT} (maximum ${PURCHASE_MAXIMUM}).`,
    );
  }
  return quantity;
}

/** Nearest valid quantity — used only by UI steppers, never to "fix" a server-side value. */
export function snapPurchaseQuantity(quantity: number): number {
  const stepped = Math.round(quantity / PURCHASE_INCREMENT) * PURCHASE_INCREMENT;
  return Math.min(Math.max(stepped, PURCHASE_MINIMUM), PURCHASE_MAXIMUM);
}

export function validPurchaseQuantities(max: number = PURCHASE_MAXIMUM): number[] {
  const out: number[] = [];
  for (let q = PURCHASE_MINIMUM; q <= Math.min(max, PURCHASE_MAXIMUM); q += PURCHASE_INCREMENT) out.push(q);
  return out;
}

export interface LeadMix {
  quantity: number;
  exclusive: number;
  standard: number;
}

export function leadMixFor(quantity: number): LeadMix {
  assertValidPurchaseQuantity(quantity);
  const blocks = quantity / PURCHASE_INCREMENT;
  return {
    quantity,
    exclusive: blocks * EXCLUSIVE_PER_INCREMENT,
    standard: blocks * STANDARD_PER_INCREMENT,
  };
}

export interface LeadRates {
  standardRateCents: number;
  exclusiveRateCents: number;
}

export interface PriceQuote extends LeadMix {
  standardRateCents: number;
  exclusiveRateCents: number;
  standardSubtotalCents: number;
  exclusiveSubtotalCents: number;
  listCents: number;
  discountPercent: number;
  discountCents: number;
  totalCents: number;
  /** Effective price per lead, rounded to the cent. */
  perLeadCents: number;
}

export function assertValidRates(rates: LeadRates): void {
  for (const name of ["standardRateCents", "exclusiveRateCents"] as const) {
    const value = rates[name];
    if (!Number.isInteger(value) || value <= 0 || value > 1_000_000) {
      throw new PurchaseRuleError(`${name} must be a positive whole number of cents.`);
    }
  }
}

export function assertValidDiscount(discountPercent: number): void {
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent >= 100) {
    throw new PurchaseRuleError("Discount must be between 0 and 99 percent.");
  }
}

export function quotePurchase(quantity: number, rates: LeadRates, discountPercent = 0): PriceQuote {
  const mix = leadMixFor(quantity);
  assertValidRates(rates);
  assertValidDiscount(discountPercent);
  const standardSubtotalCents = mix.standard * rates.standardRateCents;
  const exclusiveSubtotalCents = mix.exclusive * rates.exclusiveRateCents;
  const listCents = standardSubtotalCents + exclusiveSubtotalCents;
  const discountCents = Math.round((listCents * discountPercent) / 100);
  const totalCents = listCents - discountCents;
  return {
    ...mix,
    standardRateCents: rates.standardRateCents,
    exclusiveRateCents: rates.exclusiveRateCents,
    standardSubtotalCents,
    exclusiveSubtotalCents,
    listCents,
    discountPercent,
    discountCents,
    totalCents,
    perLeadCents: Math.round(totalCents / mix.quantity),
  };
}

export interface BundleDefinition {
  name: string;
  quantity: number;
  discountPercent: number;
}

export function assertValidBundle(bundle: BundleDefinition): void {
  if (!bundle.name.trim()) throw new PurchaseRuleError("Bundle name is required.");
  assertValidPurchaseQuantity(bundle.quantity);
  assertValidDiscount(bundle.discountPercent);
}

export function quoteBundle(bundle: BundleDefinition, rates: LeadRates): PriceQuote {
  assertValidBundle(bundle);
  return quotePurchase(bundle.quantity, rates, bundle.discountPercent);
}

/** Auto-reload uses the same quantity rules as any purchase; threshold is a non-negative lead count. */
export function assertValidAutoReload(threshold: number, quantity: number): void {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 50) {
    throw new PurchaseRuleError("Auto-reload threshold must be a whole number between 0 and 50.");
  }
  assertValidPurchaseQuantity(quantity);
}
