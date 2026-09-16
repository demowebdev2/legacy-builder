"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Feedback";
import { Field, FieldGrid, Switch } from "@/components/ui/Form";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/domain/money";
import { quotePurchase, validPurchaseQuantities } from "@/domain/purchase";

export interface AutoReloadPrefs {
  autoReloadEnabled: boolean;
  autoReloadThreshold: number;
  autoReloadQuantity: number;
}

interface Rates {
  standardRateCents: number;
  exclusiveRateCents: number;
}

function previewPrice(quantity: number, rates: Rates | null | undefined) {
  if (!rates) return null;
  try {
    return quotePurchase(quantity, rates).totalCents;
  } catch {
    return null;
  }
}

/**
 * Prototype auto-reload card (balance + billing). `controls` adds the threshold / quantity editor.
 * The server validates both values and triggers a reload immediately if the balance is already at the threshold.
 */
export function AutoReloadCard({
  prefs,
  rates,
  readOnly,
  controls,
  billing,
  totalBalance,
}: {
  prefs: AutoReloadPrefs;
  rates: Rates | null | undefined;
  readOnly: boolean;
  controls?: boolean;
  billing?: boolean;
  totalBalance?: number;
}) {
  const setAutoReload = useMutation(api.preferences.setAutoReload);
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const on = prefs.autoReloadEnabled;
  const price = previewPrice(prefs.autoReloadQuantity, rates);

  const toggle = async (enabled: boolean) => {
    setPending(true);
    try {
      await setAutoReload({ enabled });
      toast.success(
        enabled ? "Auto-reload on" : "Auto-reload off",
        enabled
          ? `${prefs.autoReloadQuantity} leads will be added at a balance of ${prefs.autoReloadThreshold}.`
          : "Your balance will run down and stop. Nothing expires.",
      );
    } catch (e) {
      toast.error(e, "Auto-reload was not changed");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Auto-reload"
        actions={
          on ? (
            <Badge tone="g" dot>
              On
            </Badge>
          ) : (
            <Badge tone="n">Off</Badge>
          )
        }
      />
      <CardBody>
        <p className="sm" style={{ marginBottom: ".9rem" }}>
          {on ? (
            billing ? (
              <>
                At a balance of {prefs.autoReloadThreshold}, we buy {prefs.autoReloadQuantity} more leads{price != null ? ` — ${formatMoney(price)}` : ""} — and
                charge the card on file.
              </>
            ) : (
              <>
                When your balance drops to <b>{prefs.autoReloadThreshold}</b>, we buy another <b>{prefs.autoReloadQuantity} leads</b> automatically at your
                current rate{price != null ? ` — ${formatMoney(price)}` : ""}. Turn it off to buy manually each time.
              </>
            )
          ) : billing ? (
            "Off. Buy manually whenever you want more."
          ) : (
            "Off. Your balance will simply run out and lead flow stops until you buy again. Nothing is lost — nothing expires."
          )}
        </p>
        {readOnly ? (
          <Alert kind="w">Auto-reload cannot be changed while your account is read-only.</Alert>
        ) : (
          <Switch checked={on} disabled={pending} onChange={(v) => void toggle(v)} label={on ? "Auto-reload is on" : "Turn auto-reload on"} />
        )}
        {!on && !readOnly && totalBalance != null && totalBalance <= prefs.autoReloadThreshold && (
          <p className="xs" style={{ marginTop: ".6rem" }}>
            Your balance is already at or below {prefs.autoReloadThreshold}, so turning this on buys {prefs.autoReloadQuantity} leads straight away.
          </p>
        )}
        {controls && !readOnly && (
          <AutoReloadSettings
            key={`${prefs.autoReloadThreshold}-${prefs.autoReloadQuantity}`}
            prefs={prefs}
            rates={rates}
            totalBalance={totalBalance}
          />
        )}
      </CardBody>
    </Card>
  );
}

function AutoReloadSettings({ prefs, rates, totalBalance }: { prefs: AutoReloadPrefs; rates: Rates | null | undefined; totalBalance?: number }) {
  const setAutoReload = useMutation(api.preferences.setAutoReload);
  const toast = useToast();
  const [threshold, setThreshold] = useState(String(prefs.autoReloadThreshold));
  const [quantity, setQuantity] = useState(prefs.autoReloadQuantity);
  const [pending, setPending] = useState(false);
  const t = Number(threshold);
  const validThreshold = threshold.trim() !== "" && Number.isInteger(t) && t >= 0 && t <= 50;
  const dirty = t !== prefs.autoReloadThreshold || quantity !== prefs.autoReloadQuantity;
  const price = previewPrice(quantity, rates);

  const save = async () => {
    setPending(true);
    try {
      await setAutoReload({ enabled: prefs.autoReloadEnabled, threshold: t, quantity });
      toast.success("Auto-reload settings saved", `${quantity} leads at a balance of ${t}.`);
    } catch (e) {
      toast.error(e, "Settings were not saved");
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={{ marginTop: "1.1rem", paddingTop: "1rem", borderTop: "1px solid var(--line)" }}>
      <FieldGrid>
        <Field label="Reload at a balance of" error={validThreshold ? null : "Enter a whole number from 0 to 50."}>
          <input type="number" inputMode="numeric" min={0} max={50} step={1} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
        <Field label="Leads to buy" help={price != null ? `${formatMoney(price)} at today's rates` : undefined}>
          <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
            {validPurchaseQuantities().map((q) => (
              <option key={q} value={q}>
                {q} leads
              </option>
            ))}
          </select>
        </Field>
      </FieldGrid>
      {prefs.autoReloadEnabled && validThreshold && totalBalance != null && totalBalance <= t && dirty && (
        <p className="xs" style={{ marginBottom: ".7rem" }}>
          Your balance is already at or below {t}, so the first reload happens as soon as you save.
        </p>
      )}
      <Button variant="out" size="s" full loading={pending} disabled={!dirty || !validThreshold} onClick={() => void save()}>
        Save auto-reload settings
      </Button>
    </div>
  );
}
