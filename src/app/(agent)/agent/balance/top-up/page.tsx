"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PayOrderForm } from "@/components/agent/OrderPayment";
import { useAgentAccount } from "@/components/agent/useAgentAccount";
import { PurchaseQuantitySelector } from "@/components/balance/PurchaseQuantitySelector";
import { PageHeader } from "@/components/layouts/PortalShell";
import { StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink, ButtonRow } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { CheckList, DefinitionList } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock, PageLoading } from "@/components/ui/Feedback";
import { cn } from "@/lib/cn";
import { PURCHASE_INCREMENT, PURCHASE_MINIMUM } from "@/domain/constants";
import { formatMoney, formatRate } from "@/domain/money";
import { quotePurchase, snapPurchaseQuantity } from "@/domain/purchase";
import { useAction } from "@/hooks/useAction";

export default function TopUpPage() {
  return (
    <>
      <PageHeader title="Buy leads" />
      <Suspense fallback={<PageLoading />}>
        <TopUp />
      </Suspense>
    </>
  );
}

function TopUp() {
  const params = useSearchParams();
  const agent = useAgentAccount();
  const orderId = params.get("order");

  if (agent === undefined) return <PageLoading />;
  if (!agent || agent.producer) {
    return (
      <div className="card">
        <EmptyState icon="coin" title="Managed by your agency">
          Leads are bought by your agency principal and shared through the agency pool.
        </EmptyState>
      </div>
    );
  }
  if (orderId) return <PayStep orderId={orderId as Id<"orders">} />;
  if (agent.readOnly || !agent.active) {
    return (
      <>
        <BackLink />
        <Alert kind="w">Purchases are disabled while your account is {agent.readOnly ? "read-only" : "not active"}. Your existing balance is untouched.</Alert>
      </>
    );
  }
  const qty = Number(params.get("qty"));
  return <ChooseStep initialBundle={params.get("bundle")} initialQuantity={Number.isFinite(qty) && qty > 0 ? snapPurchaseQuantity(qty) : PURCHASE_MINIMUM} />;
}

function BackLink() {
  return (
    <ButtonLink href="/agent/balance" variant="ghost" size="s" icon="back" style={{ marginBottom: ".9rem" }}>
      Back to lead balance
    </ButtonLink>
  );
}

function ChooseStep({ initialBundle, initialQuantity }: { initialBundle: string | null; initialQuantity: number }) {
  const router = useRouter();
  const rateCard = useQuery(api.pricing.agentRateCard);
  const balance = useQuery(api.ledger.myBalance);
  const createTopUp = useMutation(api.orders.createTopUp);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [bundleId, setBundleId] = useState<string | null>(initialBundle);
  const bundle = bundleId && rateCard ? rateCard.bundles.find((b) => b.id === bundleId) : undefined;

  const [start, starting] = useAction(async () => {
    const result = bundle ? await createTopUp({ bundleId: bundle.id }) : await createTopUp({ quantity });
    router.replace(`/agent/balance/top-up?order=${result.orderId}`);
    return result;
  });

  if (rateCard === undefined || balance === undefined) return <LoadingBlock rows={8} />;
  if (rateCard === null) return <Alert kind="e">Pricing is not available right now. Please try again shortly.</Alert>;

  const quote = bundle ? bundle.quote : quotePurchase(quantity, rateCard);

  return (
    <>
      <BackLink />
      {bundleId && !bundle && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="w">That bundle is no longer on offer. Choose a quantity or another bundle below.</Alert>
        </div>
      )}
      <div className="g g-2-1">
        <Card>
          <CardHeader
            title={bundle ? `Buy ${bundle.name}` : "Buy leads"}
            description={
              bundle
                ? `${bundle.quantity} leads · ${formatMoney(bundle.quote.totalCents)}${bundle.discountPercent ? ` · saves ${bundle.discountPercent}%` : ""}`
                : `Minimum ${PURCHASE_MINIMUM}, then in steps of ${PURCHASE_INCREMENT}. Two exclusive in every ten.`
            }
          />
          <CardBody>
            {bundle ? (
              <DefinitionList
                items={[
                  ["Bundle", `${bundle.name}${bundle.blurb ? ` — ${bundle.blurb}` : ""}`],
                  [
                    "Split",
                    <>
                      {bundle.quote.exclusive} exclusive · {bundle.quote.standard} standard <span className="xs">(the same fixed 2-in-10 mix)</span>
                    </>,
                  ],
                  ["Per lead", `${formatRate(bundle.quote.perLeadCents)}${bundle.discountPercent ? ` — ${bundle.discountPercent}% below standard rates` : " — the same as standard rates"}`],
                  ["Total", <b key="t">{formatMoney(bundle.quote.totalCents)}</b>],
                ]}
              />
            ) : (
              <PurchaseQuantitySelector
                quantity={quantity}
                onChange={(q) => setQuantity(snapPurchaseQuantity(q))}
                standardRateCents={rateCard.standardRateCents}
                exclusiveRateCents={rateCard.exclusiveRateCents}
              />
            )}
            <DefinitionList
              style={{ marginTop: "1.1rem" }}
              items={[
                ["Balance now", `${balance.exclusive} exclusive · ${balance.standard} standard`],
                ["Balance after", `${balance.exclusive + quote.exclusive} exclusive · ${balance.standard + quote.standard} standard`],
              ]}
            />
            <div style={{ marginTop: "1rem" }}>
              <Alert kind="i">
                These leads join the same balance and are drawn down in the order the engine releases them. <b>Nothing expires</b> — there is no cycle to
                use them up before.
              </Alert>
            </div>
          </CardBody>
          <CardFooter>
            <span className="xs">The price is confirmed by the server when the order is created.</span>
            <ButtonRow>
              <ButtonLink href="/agent/balance" variant="out" size="s">
                Cancel
              </ButtonLink>
              <Button variant="gold" size="s" loading={starting} onClick={() => void start()}>
                Continue to payment — {formatMoney(quote.totalCents)}
              </Button>
            </ButtonRow>
          </CardFooter>
        </Card>

        <div className="stack">
          <Card>
            <CardHeader title="Volume bundles" description="Members-only prices on larger purchases." />
            <CardBody className="stack" style={{ gap: ".6rem" }}>
              <button type="button" className={cn("crd pick", !bundle && "sel")} aria-pressed={!bundle} onClick={() => setBundleId(null)}>
                <div className="t">Any quantity</div>
                <div className="xs">From {PURCHASE_MINIMUM} leads at standard rates</div>
              </button>
              {rateCard.bundles.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={cn("crd pick", bundle?.id === b.id && "sel")}
                  aria-pressed={bundle?.id === b.id}
                  style={b.featured && bundle?.id !== b.id ? { borderColor: "var(--gold)" } : undefined}
                  onClick={() => setBundleId(b.id)}
                >
                  <div className="row-b">
                    <div className="t">{b.name}</div>
                    <b>{formatMoney(b.quote.totalCents)}</b>
                  </div>
                  <div className="xs">
                    {b.quantity} leads · {formatRate(b.quote.perLeadCents)} each{b.discountPercent ? ` · saves ${b.discountPercent}%` : ""}
                  </div>
                </button>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="What you are buying" />
            <CardBody>
              <CheckList
                items={[
                  { text: "Two exclusive in every ten — fixed mix" },
                  { text: "A lead is charged now and drawn only at release" },
                  { text: "No monthly cycle, no renewal, nothing expires" },
                  { text: "72-hour dispute window — an upheld lead goes back into the balance" },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function PayStep({ orderId }: { orderId: Id<"orders"> }) {
  const router = useRouter();
  const data = useQuery(api.orders.myOrder, { orderId });
  const agent = useAgentAccount();
  const cancelUnpaid = useMutation(api.orders.cancelUnpaid);
  const [cancel, cancelling] = useAction(async () => {
    await cancelUnpaid({ orderId });
    router.replace("/agent/balance/top-up");
  });

  if (data === undefined) return <LoadingBlock rows={6} />;
  if (data === null) {
    return (
      <>
        <BackLink />
        <div className="card">
          <EmptyState icon="warn" title="Order not found" action={<ButtonLink href="/agent/balance/top-up" variant="out" size="s">Start a new purchase</ButtonLink>}>
            That order does not exist or belongs to another account.
          </EmptyState>
        </div>
      </>
    );
  }

  const { order } = data;
  const canPay = !!agent && !agent.readOnly && agent.active;
  const payable = order.kind === "top_up" || order.kind === "bundle";

  return (
    <>
      <BackLink />
      <div className="g g-2-1">
        <Card>
          <CardHeader title={`Pay for ${order.orderNumber}`} description={`${order.label} · ${order.quantity} leads`} actions={<StatusBadge status={order.status} />} />
          <CardBody>
            <DefinitionList
              items={[
                ["Leads", `${order.quantity} — ${order.exclusiveQty} exclusive · ${order.standardQty} standard`],
                ["Per lead", formatRate(Math.round(order.totalCents / order.quantity))],
                order.discountCents > 0 && ["Bundle discount", `${order.discountPercent}% · −${formatMoney(order.discountCents)}`],
                ["Total", <b key="t">{formatMoney(order.totalCents)}</b>],
              ]}
            />
            <div style={{ marginTop: "1.1rem" }}>
              {order.status === "paid" ? (
                <div className="stack" style={{ gap: ".9rem" }}>
                  <Alert kind="s">
                    <b>Leads added.</b> {order.exclusiveQty} exclusive and {order.standardQty} standard are in your balance now. A receipt has been emailed to
                    you.
                  </Alert>
                  <ButtonRow>
                    <ButtonLink href="/agent/balance" variant="navy" size="s">
                      Back to lead balance
                    </ButtonLink>
                    <ButtonLink href={`/agent/purchases/${order._id}`} variant="out" size="s">
                      View receipt
                    </ButtonLink>
                  </ButtonRow>
                </div>
              ) : order.status === "canceled" ? (
                <div className="stack" style={{ gap: ".9rem" }}>
                  <Alert kind="n">This order was cancelled. Nothing was charged.</Alert>
                  <ButtonLink href="/agent/balance/top-up" variant="out" size="s">
                    Start a new purchase
                  </ButtonLink>
                </div>
              ) : !payable ? (
                <Alert kind="n">This order is not paid from this page. Open it from Billing &amp; purchases.</Alert>
              ) : !canPay ? (
                <Alert kind="w">Purchases are disabled while your account is read-only.</Alert>
              ) : order.status === "failed" ? (
                <div className="stack" style={{ gap: ".9rem" }}>
                  <Alert kind="e">
                    <b>Payment declined.</b> {order.failureMessage ?? "The card was declined."} No leads were added and nothing was charged. Try again or use a
                    different card.
                  </Alert>
                  <PayOrderForm order={order} retry />
                </div>
              ) : order.status === "requires_payment" ? (
                <div className="stack" style={{ gap: ".9rem" }}>
                  <PayOrderForm order={order} />
                  <div>
                    <Button variant="ghost" size="xs" loading={cancelling} onClick={() => void cancel()}>
                      Cancel this order
                    </Button>
                  </div>
                </div>
              ) : (
                <Alert kind="i">This order is {order.status.replace(/_/g, " ")}.</Alert>
              )}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Before you pay" />
          <CardBody>
            <CheckList
              items={[
                { text: "One payment — no subscription and nothing to cancel later" },
                { text: "Leads are added to your balance the moment the payment succeeds" },
                { text: "A declined card adds nothing; you can retry straight away" },
              ]}
            />
            <p className="xs" style={{ marginTop: ".8rem" }}>
              Card details are held by the payment gateway. They never touch Legacy Builders servers.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
