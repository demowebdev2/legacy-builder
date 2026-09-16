import { describe, expect, it } from "vitest";
import { PURCHASE_INCREMENT, PURCHASE_MAXIMUM, PURCHASE_MINIMUM } from "../../src/domain/constants";
import {
  assertValidAutoReload,
  assertValidBundle,
  assertValidDiscount,
  assertValidPurchaseQuantity,
  assertValidRates,
  isValidPurchaseQuantity,
  leadMixFor,
  PurchaseRuleError,
  quoteBundle,
  quotePurchase,
  snapPurchaseQuantity,
  validPurchaseQuantities,
} from "../../src/domain/purchase";

/** Prototype placeholder rates: $20 standard, $50 exclusive (integer cents). */
const RATES = { standardRateCents: 2000, exclusiveRateCents: 5000 };

const VALID = validPurchaseQuantities();

describe("purchase quantity rules (min 10, steps of 5, max 100)", () => {
  it("fixes the commercial constants", () => {
    expect(PURCHASE_MINIMUM).toBe(10);
    expect(PURCHASE_INCREMENT).toBe(5);
    expect(PURCHASE_MAXIMUM).toBe(100);
  });

  it("lists every valid quantity from 10 to 100 in fives", () => {
    expect(VALID).toEqual([10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100]);
    expect(validPurchaseQuantities(30)).toEqual([10, 15, 20, 25, 30]);
    expect(validPurchaseQuantities(500)).toHaveLength(19);
  });

  it.each(VALID)("accepts %i", (q) => {
    expect(isValidPurchaseQuantity(q)).toBe(true);
    expect(assertValidPurchaseQuantity(q)).toBe(q);
  });

  it.each([0, 5, 9, 11, 12, 14, 16, 99, 101, 105, 110, 1000, -10, -5])("rejects %i", (q) => {
    expect(isValidPurchaseQuantity(q)).toBe(false);
    expect(() => assertValidPurchaseQuantity(q)).toThrow(PurchaseRuleError);
  });

  it.each([10.5, 12.5, 15.0000001, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-integer / non-finite %s",
    (q) => {
      expect(isValidPurchaseQuantity(q)).toBe(false);
      expect(() => assertValidPurchaseQuantity(q)).toThrow(PurchaseRuleError);
    },
  );

  it.each(["10", "15", null, undefined, {}, [10], true])("rejects non-number %j (no coercion)", (q) => {
    expect(isValidPurchaseQuantity(q)).toBe(false);
    expect(() => assertValidPurchaseQuantity(q)).toThrow(PurchaseRuleError);
  });

  it("explains the rule in the error message", () => {
    expect(() => assertValidPurchaseQuantity(12)).toThrow(/start at 10 and move in steps of 5 \(maximum 100\)/);
  });

  it("snapPurchaseQuantity rounds to the nearest step and clamps to 10–100 (UI stepper only)", () => {
    expect(snapPurchaseQuantity(10)).toBe(10);
    expect(snapPurchaseQuantity(12)).toBe(10);
    expect(snapPurchaseQuantity(12.5)).toBe(15);
    expect(snapPurchaseQuantity(13)).toBe(15);
    expect(snapPurchaseQuantity(17)).toBe(15);
    expect(snapPurchaseQuantity(18)).toBe(20);
    expect(snapPurchaseQuantity(7)).toBe(10);
    expect(snapPurchaseQuantity(0)).toBe(10);
    expect(snapPurchaseQuantity(-40)).toBe(10);
    expect(snapPurchaseQuantity(98)).toBe(100);
    expect(snapPurchaseQuantity(101)).toBe(100);
    expect(snapPurchaseQuantity(1000)).toBe(100);
    for (const q of [3, 11, 22, 37, 64, 88, 250]) expect(isValidPurchaseQuantity(snapPurchaseQuantity(q))).toBe(true);
  });
});

describe("lead mix (2 exclusive in every 10; +1 exclusive / +4 standard per extra 5)", () => {
  it.each([
    [10, 2, 8],
    [15, 3, 12],
    [20, 4, 16],
    [30, 6, 24],
    [60, 12, 48],
    [100, 20, 80],
  ])("%i leads → %i exclusive + %i standard", (quantity, exclusive, standard) => {
    expect(leadMixFor(quantity)).toEqual({ quantity, exclusive, standard });
  });

  it.each(VALID)("quantity %i: exclusive = q/5, standard = 4q/5, parts sum to q", (q) => {
    const mix = leadMixFor(q);
    expect(mix.exclusive).toBe(q / 5);
    expect(mix.standard).toBe((4 * q) / 5);
    expect(mix.exclusive + mix.standard).toBe(q);
    expect(Number.isInteger(mix.exclusive) && Number.isInteger(mix.standard)).toBe(true);
  });

  it("refuses to compute a mix for an invalid quantity", () => {
    expect(() => leadMixFor(12)).toThrow(PurchaseRuleError);
    expect(() => leadMixFor(5)).toThrow(PurchaseRuleError);
  });
});

describe("pricing", () => {
  it.each([
    [10, 26_000],
    [15, 39_000],
    [20, 52_000],
  ])("%i leads at $20 standard / $50 exclusive cost %i cents", (quantity, totalCents) => {
    const quote = quotePurchase(quantity, RATES);
    expect(quote.totalCents).toBe(totalCents);
    expect(quote.listCents).toBe(totalCents);
    expect(quote.discountCents).toBe(0);
    expect(quote.standardSubtotalCents + quote.exclusiveSubtotalCents).toBe(totalCents);
  });

  it("breaks a 10-lead quote into subtotals and a per-lead price", () => {
    expect(quotePurchase(10, RATES)).toEqual({
      quantity: 10,
      exclusive: 2,
      standard: 8,
      standardRateCents: 2000,
      exclusiveRateCents: 5000,
      standardSubtotalCents: 16_000,
      exclusiveSubtotalCents: 10_000,
      listCents: 26_000,
      discountPercent: 0,
      discountCents: 0,
      totalCents: 26_000,
      perLeadCents: 2600,
    });
  });

  it("Bundle 30 at 10% off: list $780 → $702", () => {
    const quote = quoteBundle({ name: "Bundle 30", quantity: 30, discountPercent: 10 }, RATES);
    expect(quote.exclusive).toBe(6);
    expect(quote.standard).toBe(24);
    expect(quote.listCents).toBe(78_000);
    expect(quote.discountCents).toBe(7_800);
    expect(quote.totalCents).toBe(70_200);
    expect(quote.perLeadCents).toBe(2340);
  });

  it("Bundle 60 at 15% off: list $1,560 → $1,326", () => {
    const quote = quoteBundle({ name: "Bundle 60", quantity: 60, discountPercent: 15 }, RATES);
    expect(quote.exclusive).toBe(12);
    expect(quote.standard).toBe(48);
    expect(quote.listCents).toBe(156_000);
    expect(quote.discountCents).toBe(23_400);
    expect(quote.totalCents).toBe(132_600);
  });

  it("keeps money in whole cents when a discount produces a fraction", () => {
    const quote = quotePurchase(15, { standardRateCents: 1999, exclusiveRateCents: 4999 }, 12.5);
    expect(Number.isInteger(quote.discountCents)).toBe(true);
    expect(Number.isInteger(quote.totalCents)).toBe(true);
    expect(quote.totalCents).toBe(quote.listCents - quote.discountCents);
  });

  it.each([-1, -0.01, 100, 150, Number.NaN, Number.POSITIVE_INFINITY])("rejects discount %s", (discount) => {
    expect(() => assertValidDiscount(discount)).toThrow(PurchaseRuleError);
    expect(() => quotePurchase(10, RATES, discount)).toThrow(PurchaseRuleError);
  });

  it.each([0, 10, 15, 99])("accepts discount %s", (discount) => {
    expect(() => assertValidDiscount(discount)).not.toThrow();
  });

  it.each([
    [{ standardRateCents: 0, exclusiveRateCents: 5000 }],
    [{ standardRateCents: -2000, exclusiveRateCents: 5000 }],
    [{ standardRateCents: 20.5, exclusiveRateCents: 5000 }],
    [{ standardRateCents: 2000, exclusiveRateCents: Number.NaN }],
    [{ standardRateCents: 2000, exclusiveRateCents: 1_000_001 }],
    [{ standardRateCents: 2000 } as unknown as { standardRateCents: number; exclusiveRateCents: number }],
  ])("rejects invalid rates %j", (rates) => {
    expect(() => assertValidRates(rates)).toThrow(PurchaseRuleError);
    expect(() => quotePurchase(10, rates)).toThrow(PurchaseRuleError);
  });

  it("ignores extra fields on the rates object (e.g. a full pricing-version document)", () => {
    const pricingVersion = {
      _id: "pricingVersions:abc",
      _creationTime: 1,
      standardRateCents: 2000,
      exclusiveRateCents: 5000,
      displayMode: "public",
      acquisitionCostStandardCents: 2287,
      acquisitionCostExclusiveCents: 4200,
      createdByName: "Seed",
    };
    expect(() => assertValidRates(pricingVersion)).not.toThrow();
    expect(quotePurchase(10, pricingVersion).totalCents).toBe(26_000);
  });

  it("validates bundles: name, quantity rule and discount", () => {
    expect(() => assertValidBundle({ name: "  ", quantity: 30, discountPercent: 10 })).toThrow(/name/);
    expect(() => assertValidBundle({ name: "Odd", quantity: 32, discountPercent: 10 })).toThrow(PurchaseRuleError);
    expect(() => assertValidBundle({ name: "Too big", quantity: 30, discountPercent: 100 })).toThrow(PurchaseRuleError);
    expect(() => assertValidBundle({ name: "Bundle 30", quantity: 30, discountPercent: 10 })).not.toThrow();
  });
});

describe("auto-reload settings", () => {
  it.each([0, 1, 3, 25, 50])("accepts threshold %i with a valid quantity", (threshold) => {
    expect(() => assertValidAutoReload(threshold, 20)).not.toThrow();
  });

  it.each([-1, 51, 100, 2.5, Number.NaN])("rejects threshold %s", (threshold) => {
    expect(() => assertValidAutoReload(threshold, 20)).toThrow(/threshold/);
  });

  it.each([5, 12, 105, 0, 22.5])("rejects reload quantity %s (same rules as any purchase)", (quantity) => {
    expect(() => assertValidAutoReload(3, quantity)).toThrow(PurchaseRuleError);
  });

  it.each([10, 15, 60, 100])("accepts reload quantity %i", (quantity) => {
    expect(() => assertValidAutoReload(3, quantity)).not.toThrow();
  });
});
