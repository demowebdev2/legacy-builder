"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AutoReloadCard } from "@/components/agent/AutoReloadCard";
import { BundlesCard, PurchaseHistoryCard } from "@/components/agent/PurchaseCards";
import { useAgentAccount } from "@/components/agent/useAgentAccount";
import { BalanceCard } from "@/components/balance/BalanceCard";
import { LedgerTable } from "@/components/balance/LedgerTable";
import { PageHeader } from "@/components/layouts/PortalShell";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock, PageLoading } from "@/components/ui/Feedback";
import { LoadMore } from "@/components/ui/Navigation";
import { PURCHASE_INCREMENT, PURCHASE_MINIMUM } from "@/domain/constants";

export default function BalancePage() {
  const agent = useAgentAccount();
  if (agent === undefined) {
    return (
      <>
        <PageHeader title="Lead balance" />
        <PageLoading />
      </>
    );
  }
  if (!agent || agent.producer) {
    return (
      <>
        <PageHeader title="Lead balance" />
        <div className="card">
          <EmptyState icon="coin" title="Managed by your agency">
            Your agency holds one pooled lead balance. Your principal buys leads and hands them to you.
          </EmptyState>
        </div>
      </>
    );
  }
  return <BalanceView readOnly={agent.readOnly} canBuy={agent.active && !agent.readOnly} />;
}

function BalanceView({ readOnly, canBuy }: { readOnly: boolean; canBuy: boolean }) {
  const balance = useQuery(api.ledger.myBalance);
  const rateCard = useQuery(api.pricing.agentRateCard);
  const prefs = useQuery(api.preferences.mine);
  const ledger = usePaginatedQuery(api.ledger.myLedger, {}, { initialNumItems: 20 });
  const orders = usePaginatedQuery(api.orders.myOrders, {}, { initialNumItems: 10 });

  if (balance === undefined) {
    return (
      <>
        <PageHeader title="Lead balance" />
        <PageLoading />
      </>
    );
  }

  const leftPct = balance.issued ? Math.round((balance.total / balance.issued) * 100) : 0;
  const ledgerCount = `${ledger.results.length}${ledger.status === "Exhausted" ? "" : "+"} entr${ledger.results.length === 1 && ledger.status === "Exhausted" ? "y" : "ies"} · append-only`;

  return (
    <>
      <PageHeader title="Lead balance" />
      <div className="g g3" style={{ marginBottom: "1.25rem" }}>
        <StatCard
          label="Leads remaining"
          value={balance.total}
          unit={`of ${balance.issued} received`}
          icon="coin"
          accent="gold"
          meter={leftPct}
          meterTone={leftPct < 25 ? "red" : "gold"}
          sub={`${balance.delivered} delivered · nothing expired`}
        />
        <BalanceCard type="exclusive" remaining={balance.exclusive} issued={balance.exclusiveIssued} />
        <BalanceCard type="standard" remaining={balance.standard} issued={balance.standardIssued} />
      </div>

      <Alert kind="i">
        <b>How the balance works.</b> You buy leads outright — minimum {PURCHASE_MINIMUM}, then in steps of {PURCHASE_INCREMENT}. Every 10 is{" "}
        <b>2 exclusive and 8 standard</b>, so every step of 5 adds 1 exclusive and 4 standard. One lead comes off the balance the moment it is released to
        you, never before. <b>There is no monthly cycle and no expiry date</b> — the balance runs until it is used, and the engine assigns against it
        automatically as matching consumers come in.
      </Alert>

      <div className="g g-2-1" style={{ marginTop: "1.25rem" }}>
        <div className="stack">
          <Card>
            <CardHeader title="Ledger" actions={<span className="xs">{ledgerCount}</span>} />
            {ledger.status === "LoadingFirstPage" ? (
              <CardBody>
                <LoadingBlock rows={5} />
              </CardBody>
            ) : (
              <>
                <LedgerTable
                  rows={ledger.results}
                  empty={
                    <EmptyState icon="coin" title="No ledger entries yet">
                      Purchases, releases and dispute returns are recorded here as they happen.
                    </EmptyState>
                  }
                />
                {(ledger.status !== "Exhausted" || ledger.results.length > 20) && (
                  <LoadMore status={ledger.status} count={ledger.results.length} onLoadMore={() => ledger.loadMore(20)} />
                )}
              </>
            )}
            <CardFooter>
              <span className="xs">
                The balance always equals the sum of this ledger. No row is ever edited or deleted, and no row ever expires.
              </span>
            </CardFooter>
          </Card>
          <BundlesCard rateCard={rateCard} readOnly={!canBuy} />
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Buy leads" />
            <CardBody>
              {canBuy ? (
                <>
                  <p className="sm" style={{ marginBottom: ".9rem" }}>
                    Pick any number from {PURCHASE_MINIMUM} up, in steps of {PURCHASE_INCREMENT}. The exclusive-to-standard mix is fixed at two in ten.
                  </p>
                  <ButtonLink href="/agent/balance/top-up" variant="gold" full icon="plus">
                    Choose a quantity
                  </ButtonLink>
                </>
              ) : (
                <Alert kind="w">Purchases are disabled while your account is {readOnly ? "read-only" : "not active"}.</Alert>
              )}
            </CardBody>
          </Card>
          {prefs === undefined ? (
            <LoadingBlock rows={3} />
          ) : prefs.preferences ? (
            <AutoReloadCard prefs={prefs.preferences} rates={rateCard} readOnly={readOnly} controls totalBalance={balance.total} />
          ) : null}
          <PurchaseHistoryCard orders={orders.results} loading={orders.status === "LoadingFirstPage"} />
        </div>
      </div>
    </>
  );
}
