"use client";

import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import type { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { type TimelineItem, Timeline } from "@/components/ui/Display";
import { Alert } from "@/components/ui/Feedback";
import { formatDate } from "@/domain/format";
import { formatMoney, formatRate } from "@/domain/money";

type RateCard = NonNullable<FunctionReturnType<typeof api.pricing.agentRateCard>>;

/** Prototype "Volume bundles" (members only) — each links to the top-up page with the bundle preselected. */
export function BundlesCard({ rateCard, readOnly }: { rateCard: RateCard | null | undefined; readOnly: boolean }) {
  const bundles = rateCard?.bundles ?? [];
  return (
    <Card>
      <CardHeader title="Volume bundles" actions={<Badge tone="a">Members only</Badge>} />
      <CardBody>
        <p className="sm" style={{ marginBottom: "1rem" }}>
          Buy more leads at a lower rate per lead. Same fixed two-in-ten mix, added to the same balance immediately, and nothing expires.
        </p>
        {readOnly ? (
          <Alert kind="w">Purchases are disabled while your account is read-only.</Alert>
        ) : rateCard === undefined ? null : bundles.length === 0 ? (
          <p className="sm">No bundles are on offer right now. You can still buy any quantity from 10 up.</p>
        ) : (
          <div className="g g3">
            {bundles.map((b) => (
              <div key={b.id} className="crd" style={b.featured ? { borderColor: "var(--gold)" } : undefined}>
                <div className="t">{b.name}</div>
                <div className="v">{formatMoney(b.quote.totalCents)}</div>
                <div className="xs" style={{ marginBottom: ".5rem" }}>
                  {b.quote.exclusive} exclusive · {b.quote.standard} standard
                  <br />
                  {formatRate(b.quote.perLeadCents)} per lead{b.discountPercent ? ` · saves ${b.discountPercent}%` : " · same as signup rate"}
                </div>
                <ButtonLink href={`/agent/balance/top-up?bundle=${b.id}`} variant={b.featured ? "navy" : "out"} size="s" full>
                  Add {b.quantity} leads
                </ButtonLink>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Prototype "Purchase history" timeline — every order with its outcome, linking to the receipt. */
export function PurchaseHistoryCard({ orders, loading }: { orders: Array<Doc<"orders">>; loading?: boolean }) {
  const items: TimelineItem[] = orders
    .filter((o) => o.status !== "canceled")
    .map((o) => ({
      key: o._id,
      tone: o.status === "failed" ? "bad" : o.status === "requires_payment" || o.status === "authorized" ? "warn" : "ok",
      time: `${formatDate(o.createdAt)} · ${o.orderNumber}`,
      title: (
        <Link href={`/agent/purchases/${o._id}`} className="link" style={{ textDecoration: "none" }}>
          {o.quantity} leads — {formatMoney(o.totalCents)}
        </Link>
      ),
      body: (
        <>
          {o.label} · {o.exclusiveQty} exclusive, {o.standardQty} standard
          {o.status !== "paid" && (
            <>
              {" "}
              <StatusBadge status={o.status} />
            </>
          )}
        </>
      ),
    }));
  return (
    <Card>
      <CardHeader title="Purchase history" actions={<ButtonLink href="/agent/purchases" variant="ghost" size="xs">All purchases</ButtonLink>} />
      <CardBody>{loading ? <p className="sm">Loading…</p> : items.length ? <Timeline items={items} /> : <p className="sm">No purchases yet.</p>}</CardBody>
    </Card>
  );
}
