"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { AutoReloadCard } from "@/components/agent/AutoReloadCard";
import { ClosureChecklist, CloseAccountModal } from "@/components/agent/CloseAccountModal";
import { RetryDeclinedButton } from "@/components/agent/OrderPayment";
import { PaymentMethodCard } from "@/components/agent/PaymentMethodCard";
import { useAgentAccount } from "@/components/agent/useAgentAccount";
import { PageHeader } from "@/components/layouts/PortalShell";
import { StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink, ButtonRow } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { CheckList, DataTable } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock, PageLoading } from "@/components/ui/Feedback";
import { LoadMore } from "@/components/ui/Navigation";
import { PURCHASE_INCREMENT, PURCHASE_MINIMUM } from "@/domain/constants";
import { formatDate } from "@/domain/format";
import { formatMoney, formatRate } from "@/domain/money";

const PAYMENT_KIND: Record<string, string> = { authorization: "Card authorisation", capture: "Payment captured", charge: "Card payment", refund: "Refund" };
const ORDER_KIND: Record<string, string> = { opening: "Opening purchase", top_up: "Lead purchase", bundle: "Volume bundle", auto_reload: "Auto-reload" };
const bigNumber = { fontFamily: "var(--fh)", fontSize: "1.5rem", fontWeight: 700 } as const;

export default function PurchasesPage() {
  const agent = useAgentAccount();
  if (agent === undefined) {
    return (
      <>
        <PageHeader title="Billing & purchases" />
        <PageLoading />
      </>
    );
  }
  if (!agent || agent.producer) {
    return (
      <>
        <PageHeader title="Billing & purchases" />
        <div className="card">
          <EmptyState icon="card" title="Managed by your agency">
            Billing and purchases are handled by your agency principal.
          </EmptyState>
        </div>
      </>
    );
  }
  return <PurchasesView readOnly={agent.readOnly} canBuy={agent.active && !agent.readOnly} status={agent.account.status} />;
}

function PurchasesView({ readOnly, canBuy, status }: { readOnly: boolean; canBuy: boolean; status: string }) {
  const router = useRouter();
  const summary = useQuery(api.orders.myPurchaseSummary);
  const balance = useQuery(api.ledger.myBalance);
  const rateCard = useQuery(api.pricing.agentRateCard);
  const prefs = useQuery(api.preferences.mine);
  const tickets = useQuery(api.support.myTickets);
  const orders = usePaginatedQuery(api.orders.myOrders, {}, { initialNumItems: 15 });
  const payments = usePaginatedQuery(api.agentViews.myPayments, {}, { initialNumItems: 15 });
  const [closing, setClosing] = useState(false);

  if (summary === undefined || balance === undefined) {
    return (
      <>
        <PageHeader title="Billing & purchases" />
        <PageLoading />
      </>
    );
  }

  const declined = orders.results.find((o) => o.status === "failed" && !o.declineResolvedAt);
  const closureOpen = (tickets ?? []).some((t) => t.kind === "closure_request" && t.status !== "closed");
  const visibleOrders = orders.results.filter((o) => o.status !== "canceled");

  return (
    <>
      <PageHeader title="Billing & purchases" />
      {summary.declined > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <Alert kind="e">
            <b>A purchase was declined.</b>{" "}
            {declined ? `${declined.orderNumber} for ${formatMoney(declined.totalCents)} — no leads were added. ` : "No leads were added for it. "}
            Your existing balance is untouched and nothing expires. Retry the purchase, or update your card first.
            {declined && !readOnly && (
              <span className="b-row" style={{ marginTop: ".6rem" }}>
                <RetryDeclinedButton order={declined} />
                <ButtonLink href={`/agent/purchases/${declined._id}`} variant="out" size="s">
                  View the order
                </ButtonLink>
              </span>
            )}
          </Alert>
        </div>
      )}

      <div className="g g-2-1">
        <div className="stack">
          <Card>
            <CardHeader
              title="No subscription"
              description="You buy leads outright. There is no monthly fee, no renewal date and nothing to cancel."
              actions={<StatusBadge status={status} />}
            />
            <CardBody>
              <div className="g g3" style={{ marginBottom: "1.1rem" }}>
                <div>
                  <div className="eyebrow">Lifetime spend</div>
                  <div style={bigNumber}>{formatMoney(summary.spendCents)}</div>
                  <div className="xs">
                    {summary.paidOrders} purchase{summary.paidOrders === 1 ? "" : "s"}
                  </div>
                </div>
                <div>
                  <div className="eyebrow">Leads bought</div>
                  <div style={bigNumber}>{summary.leadsBought}</div>
                  <div className="xs">{balance.total} still in your balance</div>
                </div>
                <div>
                  <div className="eyebrow">Effective rate</div>
                  <div style={bigNumber}>{summary.effectiveRateCents != null ? formatMoney(summary.effectiveRateCents) : "—"}</div>
                  <div className="xs">per lead, blended</div>
                </div>
              </div>
              <hr className="hr" />
              <div className="eyebrow" style={{ marginBottom: ".5rem" }}>
                Current published rates
              </div>
              <div className="g g3">
                <div className="crd">
                  <div className="t">Exclusive</div>
                  <div className="v">{rateCard ? formatMoney(rateCard.exclusiveRateCents) : "—"}</div>
                  <div className="xs">One agent only</div>
                </div>
                <div className="crd">
                  <div className="t">Standard</div>
                  <div className="v">{rateCard ? formatMoney(rateCard.standardRateCents) : "—"}</div>
                  <div className="xs">Prospecting campaigns</div>
                </div>
                <div className="crd">
                  <div className="t">Producer seats</div>
                  <div className="v">Free</div>
                  <div className="xs">Included on every account</div>
                </div>
              </div>
              <hr className="hr" />
              <CheckList
                items={[
                  { text: `Minimum ${PURCHASE_MINIMUM} leads, then steps of ${PURCHASE_INCREMENT}` },
                  { text: "Two exclusive in every ten — fixed mix" },
                  { text: "No monthly cycle, no renewal, nothing expires" },
                  { text: "A lead is charged at purchase and drawn at release" },
                  { text: "72-hour dispute window — an upheld lead goes back into the balance" },
                  { text: "Producer seats included at no charge" },
                ]}
              />
            </CardBody>
            <CardFooter>
              <span className="xs">Rates are frozen on the leads you have already bought. A later rate change applies only to your next purchase.</span>
              <ButtonRow>
                {canBuy && (
                  <ButtonLink href="/agent/balance/top-up" variant="navy" size="s">
                    Buy more leads
                  </ButtonLink>
                )}
                <Button variant="ghost" size="s" onClick={() => setClosing(true)} disabled={closureOpen}>
                  {closureOpen ? "Closure requested" : "Close account"}
                </Button>
              </ButtonRow>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader
              title="Purchases"
              actions={
                <span className="xs">
                  {summary.paidOrders} paid order{summary.paidOrders === 1 ? "" : "s"} · {summary.leadsBought} leads
                </span>
              }
            />
            {orders.status === "LoadingFirstPage" ? (
              <CardBody>
                <LoadingBlock rows={4} />
              </CardBody>
            ) : (
              <>
                <DataTable
                  flush
                  caption="Purchases"
                  isEmpty={visibleOrders.length === 0}
                  empty={<EmptyState icon="card" title="No purchases yet">Every order you place appears here with its receipt.</EmptyState>}
                  columns={[
                    { label: "Date" },
                    { label: "Invoice" },
                    { label: "Order" },
                    { label: "Exclusive", align: "right" },
                    { label: "Standard", align: "right" },
                    { label: "Status" },
                    { label: "Total", align: "right" },
                  ]}
                >
                  {visibleOrders.map((o) => {
                    const href = `/agent/purchases/${o._id}`;
                    return (
                      <tr key={o._id} className="clk" onClick={() => router.push(href)}>
                        <td className="sm nowrap">{formatDate(o.createdAt)}</td>
                        <td className="mono">
                          <Link href={href}>{o.orderNumber}</Link>
                        </td>
                        <td>
                          <span className="nm">{o.label || ORDER_KIND[o.kind]}</span>
                          <span className="tsub">
                            {o.quantity} leads · {formatRate(Math.round(o.totalCents / o.quantity))} each
                          </span>
                        </td>
                        <td className="tr">{o.exclusiveQty}</td>
                        <td className="tr">{o.standardQty}</td>
                        <td>
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="tr strong">{formatMoney(o.totalCents)}</td>
                      </tr>
                    );
                  })}
                </DataTable>
                {(orders.status !== "Exhausted" || orders.results.length > 15) && (
                  <LoadMore status={orders.status} count={orders.results.length} onLoadMore={() => orders.loadMore(15)} />
                )}
              </>
            )}
          </Card>

          <Card>
            <CardHeader title="Payments & receipts" description="Every charge, authorisation and refund on your card." />
            {payments.status === "LoadingFirstPage" ? (
              <CardBody>
                <LoadingBlock rows={4} />
              </CardBody>
            ) : (
              <>
                <DataTable
                  flush
                  caption="Payments"
                  isEmpty={payments.results.length === 0}
                  empty={<EmptyState icon="doc" title="No payments yet">Receipts appear here once a payment is taken.</EmptyState>}
                  columns={[{ label: "Date" }, { label: "Document" }, { label: "Description" }, { label: "Amount", align: "right" }, { label: "Status" }, { label: "Receipt", srOnly: true }]}
                >
                  {payments.results.map((p) => (
                    <tr key={p.id}>
                      <td className="sm nowrap">{formatDate(p.createdAt)}</td>
                      <td className="mono">{p.documentNumber ?? p.orderNumber}</td>
                      <td className="sm">
                        {PAYMENT_KIND[p.kind] ?? p.kind} · {p.orderLabel}
                        {p.cardLast4 ? ` · card ending ${p.cardLast4}` : ""}
                        {p.failureMessage && (
                          <span className="tsub" style={{ color: "var(--red)" }}>
                            {p.failureMessage}
                          </span>
                        )}
                        {p.reason && <span className="tsub">{p.reason}</span>}
                      </td>
                      <td className="tr strong">
                        {p.kind === "refund" ? "−" : ""}
                        {formatMoney(p.amountCents)}
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="tr">
                        <ButtonLink href={`/agent/purchases/${p.orderId}`} variant="ghost" size="xs">
                          View
                        </ButtonLink>
                      </td>
                    </tr>
                  ))}
                </DataTable>
                {(payments.status !== "Exhausted" || payments.results.length > 15) && (
                  <LoadMore status={payments.status} count={payments.results.length} onLoadMore={() => payments.loadMore(15)} />
                )}
              </>
            )}
          </Card>
        </div>

        <div className="stack">
          <PaymentMethodCard readOnly={readOnly} />
          {prefs?.preferences ? (
            <AutoReloadCard prefs={prefs.preferences} rates={rateCard} readOnly={readOnly} billing totalBalance={balance.total} />
          ) : (
            <LoadingBlock rows={2} />
          )}
          <Card>
            <CardHeader title="What closing the account does" />
            <CardBody>
              <ClosureChecklist unused={balance.total} />
              <p className="xs">
                Nothing expires while the account is open, so there is no deadline to work against. Any refund for unused leads is reviewed separately
                by our finance team — it is never automatic.
              </p>
              {closureOpen && (
                <div style={{ marginTop: ".9rem" }}>
                  <Alert kind="i">Your closure request is with our team. We will confirm with you before anything changes.</Alert>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
      <CloseAccountModal open={closing} onClose={() => setClosing(false)} unused={balance.total} />
    </>
  );
}
