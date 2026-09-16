"use client";

import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field, FieldGrid, Select } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { EXCLUSIVE_PER_INCREMENT, PURCHASE_INCREMENT, PURCHASE_MINIMUM, STANDARD_PER_INCREMENT } from "@/domain/constants";
import { formatMoney, formatRate } from "@/domain/money";
import { quotePurchase } from "@/domain/purchase";
import { useAction } from "@/hooks/useAction";
import { centsToInput, inputToCents } from "./shared";

export interface PricingValues {
  standardRateCents: number;
  exclusiveRateCents: number;
  displayMode: "public" | "agent_only";
  acquisitionCostStandardCents: number;
  acquisitionCostExclusiveCents: number;
}

/** Prototype `editPricingModal`, reduced to what is editable (D5): the two rates, visibility and a note. */
export function EditRatesModal({ pricing, outstandingLeads, onClose }: { pricing: PricingValues; outstandingLeads: number; onClose: () => void }) {
  const updatePricing = useMutation(api.pricing.updatePricing);
  const [exclusive, setExclusive] = useState(centsToInput(pricing.exclusiveRateCents));
  const [standard, setStandard] = useState(centsToInput(pricing.standardRateCents));
  const [displayMode, setDisplayMode] = useState<PricingValues["displayMode"]>(pricing.displayMode);
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const exclusiveCents = inputToCents(exclusive);
  const standardCents = inputToCents(standard);
  const unchanged = exclusiveCents === pricing.exclusiveRateCents && standardCents === pricing.standardRateCents && displayMode === pricing.displayMode;

  const [save, saving] = useAction(
    async (rates: { exclusiveRateCents: number; standardRateCents: number }) => {
      await updatePricing({
        ...rates,
        displayMode,
        acquisitionCostStandardCents: pricing.acquisitionCostStandardCents,
        acquisitionCostExclusiveCents: pricing.acquisitionCostExclusiveCents,
        note: note.trim() || undefined,
      });
      return true;
    },
    { success: "Rate card saved", successBody: "Applies to the next purchase. Existing balances are unaffected." },
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (exclusiveCents == null || standardCents == null || unchanged) return;
    if (await save({ exclusiveRateCents: exclusiveCents, standardRateCents: standardCents })) onClose();
  };

  let preview: string | null = null;
  if (exclusiveCents != null && standardCents != null) {
    const q = quotePurchase(PURCHASE_MINIMUM, { exclusiveRateCents: exclusiveCents, standardRateCents: standardCents });
    preview = `A minimum order of ${PURCHASE_MINIMUM} would cost ${formatMoney(q.totalCents)} (${formatRate(q.perLeadCents)} per lead).`;
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit the rate card"
      subtitle="Applies to the next purchase only — leads already bought are frozen at the rate paid"
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="navy" size="s" type="submit" form="edit-rates-form" loading={saving} disabled={unchanged}>
            Save rate card
          </Button>
        </>
      }
    >
      <form id="edit-rates-form" onSubmit={onSubmit} noValidate>
        <FieldGrid>
          <Field label="Exclusive rate (USD per lead)" required error={submitted && exclusiveCents == null ? "Enter an amount between $0.01 and $10,000." : null}>
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={exclusive} onChange={(e) => setExclusive(e.target.value)} />
          </Field>
          <Field label="Standard rate (USD per lead)" required error={submitted && standardCents == null ? "Enter an amount between $0.01 and $10,000." : null}>
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={standard} onChange={(e) => setStandard(e.target.value)} />
          </Field>
          <Field label="Minimum order" help="Fixed rule">
            <input value={`${PURCHASE_MINIMUM} leads`} disabled readOnly />
          </Field>
          <Field label="Increment" help="Fixed rule">
            <input value={`Steps of ${PURCHASE_INCREMENT}`} disabled readOnly />
          </Field>
          <Field
            label="Exclusive share of every order"
            full
            help={`Fixed at 2 in every 10 (+${EXCLUSIVE_PER_INCREMENT} exclusive and +${STANDARD_PER_INCREMENT} standard per step). Minimum, increment and mix are part of the published commercial model and are not editable here.`}
          >
            <input value="20% — 2 in every 10" disabled readOnly />
          </Field>
          <Field
            label="Pricing visibility"
            full
            help="Agent-only hides rates and bundles on the public pricing page; signed-in agents and staff still see them."
          >
            <Select
              value={displayMode}
              onChange={(e) => setDisplayMode(e.target.value as PricingValues["displayMode"])}
              options={[
                { value: "public", label: "Public — shown on the public pricing page" },
                { value: "agent_only", label: "Agent-only — signed-in agents only" },
              ]}
            />
          </Field>
          <Field label="Note for the rate history" full help="Optional. Why the rate changed — visible in the history below and in the audit log.">
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Validated against Q3 acquisition cost" />
          </Field>
        </FieldGrid>
        {preview && <p className="xs" style={{ marginBottom: ".9rem" }}>{preview}</p>}
        {submitted && unchanged && (
          <p className="xs" style={{ color: "var(--red)", marginBottom: ".9rem" }} role="alert">
            Nothing has changed yet.
          </p>
        )}
        <Alert kind="w">
          <b>
            {outstandingLeads} lead{outstandingLeads === 1 ? " is" : "s are"} already paid for and unworked.
          </b>{" "}
          Nothing here touches them — they stay at the rate their owner paid, and they still do not expire. A rate change only affects the next order placed.
        </Alert>
      </form>
    </Modal>
  );
}
