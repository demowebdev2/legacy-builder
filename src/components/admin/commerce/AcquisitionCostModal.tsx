"use client";

import { useMutation } from "convex/react";
import { type FormEvent, useState } from "react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field, FieldGrid } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/domain/money";
import { useAction } from "@/hooks/useAction";
import type { PricingValues } from "./EditRatesModal";
import { centsToInput, inputToCents } from "./shared";

/** Prototype `editCostModal`. Saves a new pricing version with the rates and visibility unchanged. */
export function AcquisitionCostModal({ pricing, onClose }: { pricing: PricingValues; onClose: () => void }) {
  const updatePricing = useMutation(api.pricing.updatePricing);
  const [exclusive, setExclusive] = useState(centsToInput(pricing.acquisitionCostExclusiveCents));
  const [standard, setStandard] = useState(centsToInput(pricing.acquisitionCostStandardCents));
  const [submitted, setSubmitted] = useState(false);
  const exclusiveCents = inputToCents(exclusive);
  const standardCents = inputToCents(standard);

  const [save, saving] = useAction(
    async (costs: { acquisitionCostExclusiveCents: number; acquisitionCostStandardCents: number }) => {
      await updatePricing({
        standardRateCents: pricing.standardRateCents,
        exclusiveRateCents: pricing.exclusiveRateCents,
        displayMode: pricing.displayMode,
        ...costs,
        note: "Acquisition cost updated",
      });
      return true;
    },
    { success: "Acquisition cost updated", successBody: "Margins recalculated. No price or balance was touched." },
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (exclusiveCents == null || standardCents == null) return;
    if (await save({ acquisitionCostExclusiveCents: exclusiveCents, acquisitionCostStandardCents: standardCents })) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="What a lead costs to acquire"
      subtitle="Used only to work out margin — it changes no price and no balance"
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="navy" size="s" type="submit" form="acq-cost-form" loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id="acq-cost-form" onSubmit={onSubmit} noValidate>
        <FieldGrid>
          <Field
            label="Exclusive lead (USD)"
            required
            help={`Currently sold at ${formatMoney(pricing.exclusiveRateCents)}`}
            error={submitted && exclusiveCents == null ? "Enter an amount between $0.01 and $10,000." : null}
          >
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={exclusive} onChange={(e) => setExclusive(e.target.value)} />
          </Field>
          <Field
            label="Standard lead (USD)"
            required
            help={`Currently sold at ${formatMoney(pricing.standardRateCents)}`}
            error={submitted && standardCents == null ? "Enter an amount between $0.01 and $10,000." : null}
          >
            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={standard} onChange={(e) => setStandard(e.target.value)} />
          </Field>
        </FieldGrid>
        <Alert kind="i">
          Exclusive leads are sold once, to one agent, so each has to clear its own cost. A standard lead can be released to several agents, so its acquisition
          cost is shared across those releases. Put your real per-grade cost in here and the margin table tells you whether the rate card works. Saving records a
          new pricing version in the rate history.
        </Alert>
      </form>
    </Modal>
  );
}
