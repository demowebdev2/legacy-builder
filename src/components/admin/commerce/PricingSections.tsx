"use client";

import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/Display";
import { EmptyState } from "@/components/ui/Feedback";
import { EXCLUSIVE_PER_INCREMENT, PURCHASE_INCREMENT, PURCHASE_MINIMUM, STANDARD_PER_INCREMENT } from "@/domain/constants";
import { formatDate } from "@/domain/format";
import { formatMoney, formatRate } from "@/domain/money";
import { quotePurchase } from "@/domain/purchase";
import type { BundleValues } from "./BundleModal";

export type AdminPricing = FunctionReturnType<typeof api.pricing.adminPricing>;

const SAMPLE_QUANTITIES = [10, 15, 20, 25, 30, 50, 100];

export function RateCardCard({ pricing, canEdit, onEdit }: { pricing: AdminPricing["pricing"]; canEdit: boolean; onEdit: () => void }) {
  return (
    <Card>
      <CardHeader
        title="The published rate card"
        description="What an agent sees on the pricing page and in the join wizard"
        actions={
          canEdit && (
            <Button variant="out" size="s" icon="edit" onClick={onEdit}>
              Edit rates
            </Button>
          )
        }
      />
      <DataTable
        flush
        caption="Published rate card by quantity"
        columns={[
          { label: "Quantity" },
          { label: "Exclusive", align: "right" },
          { label: "Standard", align: "right" },
          { label: "Exclusive value", align: "right" },
          { label: "Standard value", align: "right" },
          { label: "Total", align: "right" },
          { label: "Per lead", align: "right" },
        ]}
        footer={
          <CardFooter>
            <span className="xs">
              Every step of {PURCHASE_INCREMENT} adds exactly {EXCLUSIVE_PER_INCREMENT} exclusive and {STANDARD_PER_INCREMENT} standard. Producer seats are included at no
              charge on every account, individual or agency.
            </span>
          </CardFooter>
        }
      >
        {SAMPLE_QUANTITIES.map((q) => {
          const quote = quotePurchase(q, pricing);
          const min = q === PURCHASE_MINIMUM;
          return (
            <tr key={q} style={min ? { background: "var(--gold-wash)" } : undefined}>
              <td>
                <span className="nm nowrap">{q} leads</span>
                {min && (
                  <span className="tsub">
                    <Badge tone="gold">Minimum</Badge>
                  </span>
                )}
              </td>
              <td className="tr strong">{quote.exclusive}</td>
              <td className="tr strong">{quote.standard}</td>
              <td className="tr sm">{formatMoney(quote.exclusiveSubtotalCents)}</td>
              <td className="tr sm">{formatMoney(quote.standardSubtotalCents)}</td>
              <td className="tr strong">{formatMoney(quote.totalCents)}</td>
              <td className="tr sm">{formatRate(quote.perLeadCents)}</td>
            </tr>
          );
        })}
      </DataTable>
    </Card>
  );
}

export function BundlesCard({ bundles, canEdit, onNew, onEdit }: { bundles: AdminPricing["bundles"]; canEdit: boolean; onNew: () => void; onEdit: (b: BundleValues) => void }) {
  return (
    <Card>
      <CardHeader
        title="Volume bundles"
        actions={
          canEdit && (
            <Button variant="out" size="s" icon="plus" onClick={onNew}>
              New bundle
            </Button>
          )
        }
      />
      <DataTable
        flush
        caption="Volume bundles"
        isEmpty={bundles.length === 0}
        empty={
          <EmptyState icon="coin" title="No bundles yet">
            Bundles are optional. Agents can always buy any valid quantity at the rate card.
          </EmptyState>
        }
        columns={[
          { label: "Bundle" },
          { label: "Leads", align: "right" },
          { label: "Mix" },
          { label: "Discount", align: "right" },
          { label: "Price", align: "right" },
          { label: "Per lead", align: "right" },
          { label: "Sold", align: "right" },
          { label: "Actions", align: "right", srOnly: true },
        ]}
        footer={
          <CardFooter>
            <span className="xs">Bundles carry the same fixed mix. They land in the same balance and never expire. Prices follow the live rate card.</span>
          </CardFooter>
        }
      >
        {bundles.map((b) => (
          <tr key={b._id} style={b.active ? undefined : { opacity: 0.6 }}>
            <td style={{ minWidth: "11rem" }}>
              <span className="nm">{b.name}</span>
              {b.blurb && <span className="tsub">{b.blurb}</span>}
              <span className="row" style={{ gap: ".3rem", marginTop: ".3rem" }}>
                {b.active ? <Badge tone="g">Active</Badge> : <Badge tone="n">Inactive</Badge>}
                {b.featured && <Badge tone="gold">Featured</Badge>}
              </span>
            </td>
            <td className="tr strong">{b.quantity}</td>
            <td className="sm nowrap">{b.quote.exclusive} ex · {b.quote.standard} std</td>
            <td className="tr sm">{b.discountPercent ? `${b.discountPercent}%` : "—"}</td>
            <td className="tr strong">{formatMoney(b.quote.totalCents)}</td>
            <td className="tr sm">{formatRate(b.quote.perLeadCents)}</td>
            <td className="tr sm">{b.sold}</td>
            <td className="tr">
              {canEdit && (
                <Button variant="ghost" size="xs" onClick={() => onEdit(b)} aria-label={`Edit ${b.name}`}>
                  Edit
                </Button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </Card>
  );
}

export function RateHistoryCard({ history, currentId }: { history: AdminPricing["history"]; currentId: string | null }) {
  return (
    <Card>
      <CardHeader title="Rate history" description="Every change is a new version. Orders keep the rates of the version they were priced on." />
      <DataTable
        flush
        caption="Rate history"
        isEmpty={history.length === 0}
        empty={
          <EmptyState icon="clock" title="No saved versions yet">
            The placeholder rates are in force until the first rate card is saved.
          </EmptyState>
        }
        columns={[
          { label: "Changed" },
          { label: "Exclusive", align: "right" },
          { label: "Standard", align: "right" },
          { label: "Visibility" },
          { label: "Acquisition cost (ex · std)", align: "right" },
          { label: "By" },
          { label: "Note" },
        ]}
      >
        {history.map((h) => (
          <tr key={h._id}>
            <td className="sm nowrap">
              {formatDate(h.createdAt, true)}
              {h._id === currentId && (
                <>
                  {" "}
                  <Badge tone="navy">Current</Badge>
                </>
              )}
            </td>
            <td className="tr strong">{formatMoney(h.exclusiveRateCents)}</td>
            <td className="tr strong">{formatMoney(h.standardRateCents)}</td>
            <td>{h.displayMode === "public" ? <Badge tone="g">Public</Badge> : <Badge tone="b">Agent-only</Badge>}</td>
            <td className="tr sm nowrap">
              {formatMoney(h.acquisitionCostExclusiveCents)} · {formatMoney(h.acquisitionCostStandardCents)}
            </td>
            <td className="sm">{h.createdByName}</td>
            <td className="sm">{h.note ?? "—"}</td>
          </tr>
        ))}
      </DataTable>
    </Card>
  );
}
