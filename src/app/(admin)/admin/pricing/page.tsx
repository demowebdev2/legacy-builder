"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { BundleModal, type BundleValues } from "@/components/admin/commerce/BundleModal";
import { EditRatesModal } from "@/components/admin/commerce/EditRatesModal";
import { useStaff } from "@/components/admin/commerce/hooks";
import { BundlesCard, RateCardCard, RateHistoryCard } from "@/components/admin/commerce/PricingSections";
import { NoAccess } from "@/components/admin/commerce/shared";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DefinitionList, StatCard } from "@/components/ui/Display";
import { Alert, PageLoading } from "@/components/ui/Feedback";
import { MAX_PRODUCER_SEATS, PURCHASE_INCREMENT, PURCHASE_MINIMUM } from "@/domain/constants";
import { formatDate } from "@/domain/format";
import { formatMoney } from "@/domain/money";

/** Prototype placeholder rates — the "before publishing" warning stays loud while these are live. */
const PLACEHOLDER = { standardRateCents: 2000, exclusiveRateCents: 5000 };

export default function AdminPricingPage() {
  const { loading, can } = useStaff();
  const allowed = can("pricing.manage");
  const data = useQuery(api.pricing.adminPricing, allowed ? {} : "skip");
  const [editRates, setEditRates] = useState(false);
  const [bundle, setBundle] = useState<BundleValues | "new" | null>(null);

  if (!loading && !allowed) {
    return (
      <>
        <PageHeader title="Lead pricing" />
        <NoAccess what="Lead pricing" />
      </>
    );
  }
  if (data === undefined) {
    return (
      <>
        <PageHeader title="Lead pricing" />
        <PageLoading />
      </>
    );
  }

  const { pricing, history, bundles, outstandingLeads } = data;
  const lastChange = history[0] ?? null;
  const placeholder = pricing.standardRateCents === PLACEHOLDER.standardRateCents && pricing.exclusiveRateCents === PLACEHOLDER.exclusiveRateCents;

  return (
    <>
      <PageHeader title="Lead pricing" />
      <Alert kind="n">
        <b>There is no plan catalogue.</b> One published rate card, one fixed mix, and a quantity the agent chooses. Changing a rate here affects the <b>next</b>{" "}
        purchase only — leads already bought are frozen at the rate paid, which is what makes &ldquo;my price went up&rdquo; an answerable question rather than an
        argument.
      </Alert>

      <div className="g g4" style={{ margin: "1.25rem 0" }}>
        <StatCard label="Exclusive rate" value={formatMoney(pricing.exclusiveRateCents)} icon="star" accent="gold" sub="One agent only" />
        <StatCard label="Standard rate" value={formatMoney(pricing.standardRateCents)} icon="coin" sub="Prospecting campaigns" />
        <StatCard label="Minimum order" value={PURCHASE_MINIMUM} unit="leads" icon="target" sub={`Then steps of ${PURCHASE_INCREMENT}`} />
        <StatCard label="Exclusive share" value="20%" icon="flow" sub="2 in every 10 — fixed" />
      </div>

      <div className="g g-2-1">
        <div className="stack">
          <RateCardCard pricing={pricing} canEdit onEdit={() => setEditRates(true)} />
          <BundlesCard bundles={bundles} canEdit onNew={() => setBundle("new")} onEdit={(b) => setBundle(b)} />
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Why the mix is fixed" />
            <CardBody>
              <p className="sm">
                Letting agents buy only exclusives would concentrate the scarce supply with whoever buys first, and leave standard leads unsellable. Two in ten
                spreads grade across the whole network and guarantees every agent has some.
              </p>
              <hr className="hr" />
              <DefinitionList
                items={[
                  ["10 leads", "2 exclusive · 8 standard"],
                  ["Each +5", "+1 exclusive · +4 standard"],
                  ["Expiry", <Badge key="e" tone="g">None</Badge>],
                  ["Renewal", <Badge key="r" tone="n">No cycle</Badge>],
                  ["Seats", `Free, up to ${MAX_PRODUCER_SEATS}`],
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Pricing visibility"
              actions={
                <Button variant="out" size="s" onClick={() => setEditRates(true)}>
                  Change
                </Button>
              }
            />
            <CardBody>
              <div className="row" style={{ marginBottom: ".55rem" }}>
                {pricing.displayMode === "public" ? <Badge tone="g" dot>Public</Badge> : <Badge tone="b" dot>Agent-only</Badge>}
              </div>
              <p className="sm">
                {pricing.displayMode === "public"
                  ? "Rates and bundles are shown on the public pricing page and in the join wizard."
                  : "The public pricing page hides rates and bundles. Signed-in agents and staff still see them."}
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Before publishing" />
            <CardBody>
              {placeholder ? (
                <Alert kind="w">
                  <b>These rates are placeholders.</b> They must be validated against the real cost of acquiring a consumer lead, per grade type, or leads get sold
                  at a loss. The{" "}
                  <Link className="link" href="/admin/finance?tab=economics">
                    lead economics screen
                  </Link>{" "}
                  is where that gets settled.
                </Alert>
              ) : (
                <Alert kind="i">
                  Rates last changed {lastChange ? `${formatDate(lastChange.createdAt)} by ${lastChange.createdByName}` : "recently"}. Check they still clear
                  acquisition cost on the{" "}
                  <Link className="link" href="/admin/finance?tab=economics">
                    lead economics screen
                  </Link>
                  .
                </Alert>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <RateHistoryCard history={history} currentId={pricing.versionId} />
      </div>

      {editRates && <EditRatesModal pricing={pricing} outstandingLeads={outstandingLeads} onClose={() => setEditRates(false)} />}
      {bundle && (
        <BundleModal
          bundle={bundle === "new" ? null : bundle}
          nextSortOrder={bundles.reduce((max, b) => Math.max(max, b.sortOrder + 1), 0)}
          rates={pricing}
          onClose={() => setBundle(null)}
        />
      )}
    </>
  );
}
