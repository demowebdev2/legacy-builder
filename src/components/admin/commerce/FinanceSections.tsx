"use client";

import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, StatCard, Timeline } from "@/components/ui/Display";
import { Alert, Avatar, EmptyState, LoadingBlock, Meter } from "@/components/ui/Feedback";
import { LoadMore } from "@/components/ui/Navigation";
import { formatDate, timeAgo } from "@/domain/format";
import { formatMoney } from "@/domain/money";
import { DismissDeclineModal, type OrderSummary, useRetryDeclined } from "./OrderActions";
import { ORDER_KIND_LABEL } from "./shared";

export type FinanceData = FunctionReturnType<typeof api.reports.finance>;

const KIND_PLURAL: Record<keyof typeof ORDER_KIND_LABEL, string> = {
  opening: "Opening purchases",
  top_up: "Top-ups",
  bundle: "Volume bundles",
  auto_reload: "Auto-reload",
};

export function FinanceOverview({ data }: { data: FinanceData }) {
  const o = data.overview;
  return (
    <>
      <div className="g g4" style={{ marginBottom: "1.25rem" }}>
        <StatCard label="Revenue, all time" value={formatMoney(o.revenueCents)} icon="trend" accent="green" sub={`${o.orderCount} orders · net of refunds`} />
        <StatCard label="Per active account" value={formatMoney(o.perActiveAccountCents)} icon="user" />
        <StatCard label="Active accounts" value={o.activeAccounts} icon="users" />
        <StatCard label="At risk" value={o.atRisk} icon="warn" accent="red" sub={`${o.frozenLeads} leads frozen in their balances`} href="/admin/finance?tab=declined" />
      </div>
      <Card>
        <CardHeader title="Revenue by order type" />
        <CardBody>
          {o.byKind.map((k) => (
            <div key={k.kind} style={{ marginBottom: ".85rem" }}>
              <div className="row-b">
                <span className="sm">
                  {KIND_PLURAL[k.kind]}{" "}
                  <span className="xs">
                    · {k.orders} order{k.orders === 1 ? "" : "s"} · {k.leads} leads
                  </span>
                </span>
                <span className="strong">{formatMoney(k.valueCents)}</span>
              </div>
              <Meter percent={o.revenueCents ? (k.valueCents / o.revenueCents) * 100 : 0} tone="gold" />
            </div>
          ))}
          <p className="xs">Paid and part-refunded orders, net of refunds. Authorised opening purchases count once captured on approval.</p>
        </CardBody>
      </Card>
    </>
  );
}

export function FinanceTransactions({ canRefund }: { canRefund: boolean }) {
  const { results, status, loadMore } = usePaginatedQuery(api.orders.adminList, {}, { initialNumItems: 25 });
  if (status === "LoadingFirstPage") return <LoadingBlock rows={6} label="Loading transactions" />;
  return (
    <DataTable
      caption="Transactions"
      isEmpty={results.length === 0}
      empty={
        <EmptyState icon="money" title="No transactions yet">
          Orders and their payments appear here as soon as an agent buys leads.
        </EmptyState>
      }
      columns={[
        { label: "Date" },
        { label: "Account" },
        { label: "Invoice" },
        { label: "Description" },
        { label: "Amount", align: "right" },
        { label: "Status" },
        { label: "Actions", align: "right", srOnly: true },
      ]}
      footer={<LoadMore status={status} onLoadMore={() => loadMore(25)} count={results.length} />}
    >
      {results.map((o) => {
        const refundable = (o.status === "paid" || o.status === "partially_refunded") && o.totalCents > o.refundedCents;
        return (
          <tr key={o._id}>
            <td className="sm nowrap">
              <Link href={`/admin/purchases/${o._id}`} className="rowlink">
                {formatDate(o.createdAt)}
                <span className="sr-only"> — open order {o.orderNumber}</span>
              </Link>
            </td>
            <td className="nm">
              <Link href={`/admin/accounts/${o.accountId}`} className="rowlink">
                {o.accountName}
              </Link>
            </td>
            <td className="mono nowrap">{o.orderNumber}</td>
            <td className="sm">
              {o.label} · {o.quantity} leads
              {o.status === "failed" && o.failureMessage && (
                <span className="tsub" style={{ color: "var(--red)" }}>
                  {o.failureMessage}
                </span>
              )}
              {o.refundedCents > 0 && <span className="tsub">{formatMoney(o.refundedCents)} refunded</span>}
            </td>
            <td className="tr strong">{formatMoney(o.totalCents)}</td>
            <td>
              <StatusBadge status={o.status} label={o.status === "failed" ? "Declined" : undefined} />
            </td>
            <td className="tr">
              {refundable && canRefund ? (
                <ButtonLink href={`/admin/purchases/${o._id}`} variant="ghost" size="xs">
                  Refund
                </ButtonLink>
              ) : (
                <ButtonLink href={`/admin/purchases/${o._id}`} variant="ghost" size="xs">
                  Open
                </ButtonLink>
              )}
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}

export function FinanceDeclined({ data, canRetry, holdOnDecline }: { data: FinanceData; canRetry: boolean; holdOnDecline: boolean | null }) {
  const { retry, retrying, mode } = useRetryDeclined();
  const [dismiss, setDismiss] = useState<OrderSummary | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  return (
    <>
      <Alert kind="e">
        <b>No dunning ladder.</b> A declined purchase is recorded, the agent is notified and nothing is added to their balance. There is no automatic retry
        schedule and no automatic suspension. While an auto-reload decline is unresolved the account&apos;s lead flow is{" "}
        {holdOnDecline === false ? "not held (the hold setting is off)" : "held"} — its balance is frozen, never forfeited, and nothing expires. Retry the charge or
        dismiss the decline with a note.
      </Alert>
      <div style={{ height: "1.25rem" }} />
      {data.declined.length === 0 ? (
        <div className="card">
          <EmptyState icon="check" title="No declined purchases">
            Every purchase and auto-reload has settled.
          </EmptyState>
        </div>
      ) : (
        <div className="stack">
          {data.declined.map((o) => {
            const held = o.kind === "auto_reload" && holdOnDecline !== false;
            return (
              <Card key={o._id}>
                <CardHeader>
                  <div className="row" style={{ flexWrap: "nowrap", minWidth: 0 }}>
                    <Avatar name={o.accountName} large />
                    <div style={{ minWidth: 0 }}>
                      <h3 className="h3">
                        <Link href={`/admin/accounts/${o.accountId}`}>{o.accountName}</Link>
                      </h3>
                      <p className="sm">
                        {ORDER_KIND_LABEL[o.kind]} of {o.quantity} leads · {formatMoney(o.totalCents)} declined · <span className="mono">{o.orderNumber}</span> ·{" "}
                        {o.attemptCount} attempt{o.attemptCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <div className="b-row">
                    <ButtonLink href={`/admin/purchases/${o._id}`} variant="out" size="s">
                      Open order
                    </ButtonLink>
                    {canRetry && (
                      <>
                        <Button variant="ghost" size="s" onClick={() => setDismiss(o)}>
                          Dismiss
                        </Button>
                        <Button
                          variant="navy"
                          size="s"
                          loading={retrying && retryingId === o._id}
                          disabled={retrying}
                          onClick={async () => {
                            setRetryingId(o._id);
                            await retry(o._id);
                            setRetryingId(null);
                          }}
                        >
                          Retry charge{mode === "mock" ? " (test)" : ""}
                        </Button>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardBody>
                  <Timeline
                    items={[
                      {
                        key: "declined",
                        tone: "bad",
                        time: o.failedAt ? `${formatDate(o.failedAt, true)} · ${timeAgo(o.failedAt)}` : undefined,
                        title: "Charge declined — no leads added",
                        body: o.failureMessage ?? undefined,
                      },
                      { key: "notified", tone: "ok", title: "Agent notified in the portal and by email", body: "They can retry or update their card themselves." },
                      held
                        ? { key: "hold", tone: "warn", title: "Lead flow held while the decline is unresolved", body: "Balance frozen, not forfeited — nothing expires." }
                        : { key: "hold", title: "No lead-flow hold", body: o.kind === "auto_reload" ? "The hold setting is off." : "Holds apply only to auto-reload declines." },
                      { key: "now", tone: "now", title: "Awaiting retry or dismissal" },
                    ]}
                  />
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
      {!canRetry && data.declined.length > 0 && <p className="xs" style={{ marginTop: ".9rem" }}>Retrying or dismissing needs the purchases retry permission.</p>}
      {dismiss && <DismissDeclineModal order={dismiss} onClose={() => setDismiss(null)} />}
    </>
  );
}

export function FinanceEconomics({
  data,
  canEditCost,
  onEditCost,
  standardRecipientCount,
}: {
  data: FinanceData;
  canEditCost: boolean;
  onEditCost: () => void;
  standardRecipientCount: number | null;
}) {
  const { pricing, economics: e, overview } = data;
  const cost = { exclusive: pricing.acquisitionCostExclusiveCents, standard: pricing.acquisitionCostStandardCents };
  const rate = { exclusive: pricing.exclusiveRateCents, standard: pricing.standardRateCents };
  const sharing = standardRecipientCount && standardRecipientCount > 1 ? `up to ${standardRecipientCount} agents` : "several agents";

  return (
    <>
      <Alert kind="w">
        <b>This is the number that decides pricing.</b> The rate card ({formatMoney(rate.standard)} standard, {formatMoney(rate.exclusive)} exclusive) has to be
        validated against the real cost of acquiring a consumer lead — per grade, not blended — or leads get sold at a loss. This screen is where that gets
        settled.
      </Alert>

      <Card style={{ marginTop: "1.25rem" }}>
        <CardHeader
          title="What a lead costs to acquire"
          description="Set here, not derived — it is the figure the rate card has to clear"
          actions={
            canEditCost && (
              <Button variant="out" size="s" icon="edit" onClick={onEditCost}>
                Edit
              </Button>
            )
          }
        />
        <CardBody>
          <div className="g g3">
            {(["exclusive", "standard"] as const).map((t) => (
              <div key={t} className="crd">
                <div className="t">{t === "exclusive" ? "Exclusive" : "Standard"}</div>
                <div className="v">{formatMoney(cost[t])}</div>
                <div className="xs">sold at {formatMoney(rate[t])}</div>
              </div>
            ))}
            <div className="crd">
              <div className="t">Blended</div>
              <div className="v">{formatMoney(e.blendedCplCents)}</div>
              <div className="xs">across {e.leadsAcquired} leads captured</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="g g4" style={{ margin: "1.25rem 0" }}>
        <StatCard label="Total acquisition cost" value={formatMoney(e.acquisitionSpendCents)} icon="money" accent="red" />
        <StatCard label="Leads acquired" value={e.leadsAcquired} icon="inbox" sub={`Avg ${formatMoney(e.blendedCplCents)} each`} />
        <StatCard label="Leads sold" value={e.leadsSold} icon="coin" accent="gold" sub={`${e.released} released to agents · ${e.outstanding} unworked in balances`} />
        <StatCard label="Revenue" value={formatMoney(overview.revenueCents)} icon="trend" accent="green" sub={`${formatMoney(overview.perActiveAccountCents)} per active account`} />
      </div>

      <Card>
        <CardHeader title="Margin per lead, by type" />
        <DataTable
          flush
          caption="Margin per lead by type"
          columns={[
            { label: "Type" },
            { label: "Sold at", align: "right" },
            { label: "Sold", align: "right" },
            { label: "Revenue", align: "right" },
            { label: "Avg cost to acquire", align: "right" },
            { label: "Gross per lead", align: "right" },
            { label: "Margin" },
          ]}
          footer={
            <CardFooter>
              <span className="xs">
                <b>Exclusive leads are sold exactly once</b>, to one agent, so each has to clear its own acquisition cost. <b>Standard leads may be released to{" "}
                {sharing}</b> (BD-2), and each release draws one lead from that agent&apos;s balance — so the per-lead figures above compare the rate to the cost of
                one acquired lead, and the real standard margin per acquired consumer lead is higher when a lead is shared.
              </span>
            </CardFooter>
          }
        >
          {e.byType.map((row) => {
            const tone = row.marginPercent > 50 ? "green" : row.marginPercent > 25 ? "gold" : "red";
            return (
              <tr key={row.type}>
                <td>
                  <span className="nm">{row.type === "exclusive" ? "Exclusive" : "Standard"}</span>
                  <span className="tsub">{row.type === "exclusive" ? "High-intent sources" : "Prospecting campaigns"}</span>
                </td>
                <td className="tr strong">{formatMoney(row.rateCents)}</td>
                <td className="tr">{row.sold}</td>
                <td className="tr sm">{formatMoney(row.revenueCents)}</td>
                <td className="tr sm">{formatMoney(row.costCents)}</td>
                <td className="tr strong" style={{ color: row.grossCents < 0 ? "var(--red)" : undefined }}>
                  {formatMoney(row.grossCents)}
                </td>
                <td>
                  <div className="row" style={{ gap: ".5rem", flexWrap: "nowrap" }}>
                    <div className="meter" style={{ minWidth: 70, flex: 1, margin: 0 }} role="presentation">
                      <i className={tone} style={{ width: `${Math.min(100, Math.max(0, row.marginPercent))}%` }} />
                    </div>
                    <span className="strong" style={{ color: row.marginPercent < 25 ? "var(--red)" : undefined }}>
                      {row.marginPercent}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Card>

      <div style={{ height: "1.25rem" }} />
      <Card>
        <CardHeader title="Unworked balance — the deferred obligation" />
        <CardBody>
          <p className="sm" style={{ marginBottom: ".9rem" }}>
            {e.outstanding} lead{e.outstanding === 1 ? " has" : "s have"} been paid for and not yet released. Because nothing expires, every one of them is a
            release the business still owes. At the current blended cost of {formatMoney(e.blendedCplCents)} that is up to{" "}
            <b>{formatMoney(e.outstanding * e.blendedCplCents)}</b> of acquisition cost still to commit — less where standard leads are shared across agents.
          </p>
          <Alert kind="i">
            A model with monthly expiry would quietly write this obligation off every cycle. This one does not, by design — so the figure has to be watched, and it is
            the strongest argument for keeping lead supply ahead of sales. The{" "}
            <Link className="link" href="/admin/reports">
              balance liability report
            </Link>{" "}
            breaks it down per account.
          </Alert>
          {pricing.updatedAt && (
            <p className="xs" style={{ marginTop: ".8rem" }}>
              Costs and rates from the pricing version saved {formatDate(pricing.updatedAt)}. <Badge tone="n">Versioned</Badge>
            </p>
          )}
        </CardBody>
      </Card>
    </>
  );
}
