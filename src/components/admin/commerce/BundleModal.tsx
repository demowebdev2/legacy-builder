"use client";

import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Field, FieldGrid, Select, Switch } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { formatMoney, formatRate } from "@/domain/money";
import { quoteBundle, validPurchaseQuantities } from "@/domain/purchase";
import { useAction } from "@/hooks/useAction";

export interface BundleValues {
  _id: Id<"bundles">;
  name: string;
  quantity: number;
  discountPercent: number;
  blurb: string;
  featured: boolean;
  active: boolean;
  sortOrder: number;
}

const MAX_DISCOUNT = 50;

/** Create or edit a volume bundle. The price preview uses the domain quote; the server recomputes on purchase. */
export function BundleModal({
  bundle,
  nextSortOrder,
  rates,
  onClose,
}: {
  bundle: BundleValues | null;
  nextSortOrder: number;
  rates: { standardRateCents: number; exclusiveRateCents: number };
  onClose: () => void;
}) {
  const upsertBundle = useMutation(api.pricing.upsertBundle);
  const [name, setName] = useState(bundle?.name ?? "");
  const [quantity, setQuantity] = useState(bundle?.quantity ?? 30);
  const [discount, setDiscount] = useState(String(bundle?.discountPercent ?? 0));
  const [blurb, setBlurb] = useState(bundle?.blurb ?? "");
  const [featured, setFeatured] = useState(bundle?.featured ?? false);
  const [active, setActive] = useState(bundle?.active ?? true);
  const [sortOrder, setSortOrder] = useState(String(bundle?.sortOrder ?? nextSortOrder));
  const [submitted, setSubmitted] = useState(false);

  const discountValue = Number(discount);
  const discountError =
    discount.trim() === "" || !Number.isInteger(discountValue) || discountValue < 0 || discountValue > MAX_DISCOUNT
      ? `Whole percent between 0 and ${MAX_DISCOUNT}.`
      : null;
  const nameError = name.trim() ? null : "Give the bundle a name.";
  const sortValue = Number(sortOrder);
  const sortError = sortOrder.trim() === "" || !Number.isInteger(sortValue) || sortValue < 0 ? "Whole number, 0 or more." : null;

  let quote = null;
  try {
    quote = quoteBundle({ name: name || "Preview", quantity, discountPercent: discountError ? 0 : discountValue }, rates);
  } catch {
    quote = null;
  }

  const [save, saving] = useAction(
    async () => {
      await upsertBundle({
        id: bundle?._id,
        name: name.trim(),
        quantity,
        discountPercent: discountValue,
        blurb: blurb.trim(),
        featured,
        active,
        sortOrder: sortValue,
      });
      return true;
    },
    { success: bundle ? "Bundle updated" : "Bundle created", successBody: "Agents see the change on their next purchase." },
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (nameError || discountError || sortError) return;
    if (await save()) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={bundle ? `Edit ${bundle.name}` : "New bundle"}
      subtitle="Same fixed mix as every purchase. Lands in the same balance and never expires."
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="navy" size="s" type="submit" form="bundle-form" loading={saving}>
            {bundle ? "Save bundle" : "Create bundle"}
          </Button>
        </>
      }
    >
      <form id="bundle-form" onSubmit={onSubmit} noValidate>
        <FieldGrid>
          <Field label="Name" required full error={submitted ? nameError : null}>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Bundle 30" />
          </Field>
          <Field label="Leads" required help="Minimum 10, then steps of 5">
            <Select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} options={validPurchaseQuantities().map((q) => ({ value: q, label: `${q} leads` }))} />
          </Field>
          <Field label="Discount (%)" required error={submitted ? discountError : null} help={`Up to ${MAX_DISCOUNT}% — larger discounts need finance sign-off`}>
            <input type="number" inputMode="numeric" min={0} max={MAX_DISCOUNT} step={1} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </Field>
          <Field label="Blurb" full help="One line shown under the bundle name">
            <input value={blurb} maxLength={120} onChange={(e) => setBlurb(e.target.value)} placeholder="A month of extra volume" />
          </Field>
          <Field label="Sort order" error={submitted ? sortError : null} help="Lower numbers show first">
            <input type="number" inputMode="numeric" min={0} step={1} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
          <div style={{ display: "flex", flexDirection: "column", gap: ".55rem", justifyContent: "center", marginBottom: ".9rem" }}>
            <Switch checked={featured} onChange={setFeatured} label="Featured" />
            <Switch checked={active} onChange={setActive} label={active ? "Active — on sale" : "Inactive — hidden from agents"} />
          </div>
        </FieldGrid>

        {quote && (
          <div className="bill" aria-live="polite">
            <div>
              <span>
                {quote.exclusive} exclusive at {formatMoney(quote.exclusiveRateCents)}
              </span>
              <b>{formatMoney(quote.exclusiveSubtotalCents)}</b>
            </div>
            <div>
              <span>
                {quote.standard} standard at {formatMoney(quote.standardRateCents)}
              </span>
              <b>{formatMoney(quote.standardSubtotalCents)}</b>
            </div>
            {quote.discountCents > 0 && (
              <div>
                <span>Bundle discount {quote.discountPercent}%</span>
                <b>−{formatMoney(quote.discountCents)}</b>
              </div>
            )}
            <div className="tot">
              <span>Bundle price at today&apos;s rates</span>
              <span>{formatMoney(quote.totalCents)}</span>
            </div>
            <p className="xs" style={{ marginTop: ".35rem" }}>
              {formatRate(quote.perLeadCents)} per lead · recomputed from the live rate card at purchase
            </p>
          </div>
        )}
      </form>
    </Modal>
  );
}
