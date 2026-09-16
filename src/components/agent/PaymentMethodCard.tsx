"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { CardSetupForm } from "@/components/balance/PaymentForm";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/** Prototype "Payment method" card; "Update card" opens a SetupIntent (or bypass test card) form. */
export function PaymentMethodCard({ readOnly }: { readOnly: boolean }) {
  const method = useQuery(api.payments.myPaymentMethod);
  const toast = useToast();
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader title="Payment method" />
      <CardBody>
        {method === undefined ? (
          <Skeleton height={58} />
        ) : (
          <div className="row" style={{ border: "1px solid var(--line)", borderRadius: "var(--r-s)", padding: ".8rem", marginBottom: ".9rem" }}>
            <Icon name="card" />
            {method.hasCard ? (
              <div>
                <div className="strong">
                  {method.cardBrand ? capitalise(method.cardBrand) : "Card"} ending {method.cardLast4 ?? "••••"}
                </div>
                {method.cardExpMonth && method.cardExpYear && (
                  <div className="xs">
                    Expires {String(method.cardExpMonth).padStart(2, "0")} / {method.cardExpYear}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="strong">No card on file</div>
                <div className="xs">Add one to use auto-reload and one-click retries</div>
              </div>
            )}
            <div className="spacer" />
            {method.hasCard && <Badge tone="g">Default</Badge>}
          </div>
        )}
        {readOnly ? (
          <Alert kind="w">The card cannot be changed while your account is read-only.</Alert>
        ) : (
          <Button variant="out" size="s" full onClick={() => setOpen(true)} disabled={method === undefined}>
            {method?.hasCard ? "Update card" : "Add a card"}
          </Button>
        )}
        <p className="xs" style={{ marginTop: ".7rem" }}>
          Card details are held by the payment gateway. They never touch Legacy Builders servers.
        </p>
      </CardBody>
      <Modal open={open} onClose={() => setOpen(false)} title={method?.hasCard ? "Update card" : "Add a card"} subtitle="Used for auto-reload and retries of declined purchases.">
        {open && (
          <CardSetupForm
            onDone={() => {
              setOpen(false);
              toast.success("Card saved", "It will be used for your next auto-reload.");
            }}
          />
        )}
      </Modal>
    </Card>
  );
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
