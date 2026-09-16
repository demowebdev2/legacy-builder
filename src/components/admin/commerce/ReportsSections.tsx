"use client";

import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import type { ReactNode } from "react";
import type { api } from "@convex/_generated/api";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, DefinitionList } from "@/components/ui/Display";
import { EmptyState, Meter } from "@/components/ui/Feedback";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/domain/format";
import { formatMoney } from "@/domain/money";
import { downloadCsv } from "./shared";

export type OperationsReport = FunctionReturnType<typeof api.reports.operations>;
type Count = { key: string; count: number };

function shortDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Daily lead volume as a row of bars in the prototype meter palette (no chart library). */
export function VolumeCard({ report }: { report: OperationsReport }) {
  const days = report.leadVolume.byDay;
  const max = Math.max(1, ...days.map((d) => d.count));
  const peak = days.reduce((best, d) => (d.count > best.count ? d : best), days[0] ?? { date: "", count: 0 });
  const average = days.length ? report.leadVolume.total / days.length : 0;
  const mid = days[Math.floor(days.length / 2)];
  return (
    <Card>
      <CardHeader
        title="Lead volume"
        description={`${report.leadVolume.total} leads captured · ${average.toFixed(1)} a day on average${peak?.count ? ` · peak ${peak.count} on ${shortDate(peak.date)}` : ""}`}
      />
      <CardBody>
        {report.leadVolume.total === 0 ? (
          <EmptyState icon="inbox" title="No leads in this window">
            Captured leads from the website, Meta and partners are counted by day here.
          </EmptyState>
        ) : (
          <>
            <div className="vbars" role="img" aria-label={`Leads captured per day over the last ${report.window} days, peak ${peak.count}`}>
              {days.map((d) => (
                <i
                  key={d.date}
                  className={cn(d.count === 0 && "zero", d.count === peak.count && d.count > 0 && "peak")}
                  style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
                  title={`${shortDate(d.date)}: ${d.count} lead${d.count === 1 ? "" : "s"}`}
                />
              ))}
            </div>
            <div className="vbars-k" aria-hidden="true">
              <span>{days[0] ? shortDate(days[0].date) : ""}</span>
              {days.length > 14 && mid && <span>{shortDate(mid.date)}</span>}
              <span>{days.length ? shortDate(days[days.length - 1].date) : ""}</span>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function LeadTypeCard({ report }: { report: OperationsReport }) {
  const exclusive = report.byLeadType.find((r) => r.key === "exclusive")?.count ?? 0;
  const standard = report.byLeadType.find((r) => r.key === "standard")?.count ?? 0;
  const total = exclusive + standard;
  return (
    <Card>
      <CardHeader title="Standard vs exclusive" description="Grade of leads captured in the window" />
      <CardBody>
        <div className="split-bar" aria-hidden="true">
          <i className="exc" style={{ width: `${total ? (exclusive / total) * 100 : 0}%` }} />
          <i className="std" style={{ width: `${total ? (standard / total) * 100 : 0}%` }} />
        </div>
        <div className="split-k" style={{ justifyContent: "flex-start", marginBottom: "1rem" }}>
          <span>
            <span className="swatch exc" />
            <b>{exclusive}</b> exclusive{total ? ` · ${Math.round((exclusive / total) * 100)}%` : ""}
          </span>
          <span>
            <span className="swatch std" />
            <b>{standard}</b> standard{total ? ` · ${Math.round((standard / total) * 100)}%` : ""}
          </span>
        </div>
        <DefinitionList
          items={[
            ["Distributable", `${report.assignmentRate.distributable} leads`],
            ["Assigned", `${report.assignmentRate.assigned} (${report.assignmentRate.percent}%)`],
            ["Releases", `${report.assignmentRate.releases} to agents`],
            ["Unassigned", report.unassigned ? <Link key="u" className="link" href="/admin/leads/unassigned">{report.unassigned} waiting</Link> : "None"],
          ]}
        />
      </CardBody>
    </Card>
  );
}

/** Prototype "revenue by order type" layout: label + count, then a meter. */
export function BreakdownCard({ title, description, rows, render, empty = "Nothing captured in this window.", limit = 8 }: { title: string; description?: string; rows: Count[]; render?: (key: string) => ReactNode; empty?: string; limit?: number }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit).reduce((s, r) => s + r.count, 0);
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        {shown.length === 0 ? (
          <p className="sm">{empty}</p>
        ) : (
          <>
            {shown.map((r) => (
              <div key={r.key} style={{ marginBottom: ".75rem" }}>
                <div className="row-b" style={{ gap: ".5rem", flexWrap: "nowrap" }}>
                  <span className="sm" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {render ? render(r.key) : r.key}
                  </span>
                  <span className="strong nowrap">
                    {r.count} <span className="xs">· {Math.round((r.count / total) * 100)}%</span>
                  </span>
                </div>
                <Meter percent={(r.count / total) * 100} tone="gold" />
              </div>
            ))}
            {rest > 0 && <p className="xs">+ {rest} more across {rows.length - limit} other values</p>}
          </>
        )}
      </CardBody>
    </Card>
  );
}

export function ReasonsCard({ report }: { report: OperationsReport }) {
  return (
    <Card>
      <CardHeader title="Latest consumer reasons" description="What is bringing people here, in their words — newest first" />
      {report.reasons.length === 0 ? (
        <EmptyState icon="inbox" title="No reasons yet">
          The request wizard asks every consumer what is bringing them here.
        </EmptyState>
      ) : (
        <CardBody className="stack" style={{ gap: ".7rem", maxHeight: 460, overflowY: "auto" }}>
          {report.reasons.map((r) => (
            <div key={r.reference} className="faq-item">
              <div className="row-b" style={{ marginBottom: ".25rem", gap: ".5rem" }}>
                <span className="xs">
                  <span className="mono">{r.reference}</span> · {r.coverageName}
                </span>
                <span className="xs">{timeAgo(r.capturedAt)}</span>
              </div>
              <p className="sm">&ldquo;{r.reason}&rdquo;</p>
            </div>
          ))}
        </CardBody>
      )}
    </Card>
  );
}

export function DeliveriesCard({ report }: { report: OperationsReport }) {
  const t = report.disputeTotals;
  return (
    <Card>
      <CardHeader
        title="Agent deliveries and dispute rates"
        description={`${t.total} dispute${t.total === 1 ? "" : "s"} raised in the window · ${t.upheld} upheld · ${t.pending} pending`}
      />
      <DataTable
        flush
        caption="Agent deliveries and dispute rates"
        isEmpty={report.disputeRates.length === 0}
        empty={
          <EmptyState icon="users" title="No releases in this window">
            Accounts appear here once the engine releases leads to them.
          </EmptyState>
        }
        columns={[{ label: "Account" }, { label: "Releases", align: "right" }, { label: "Disputes", align: "right" }, { label: "Upheld", align: "right" }, { label: "Dispute rate" }]}
        footer={
          <CardFooter>
            <span className="xs">Top 25 accounts by releases. The dispute rate feeds the ranking penalty tier once an account passes the minimum assignment count.</span>
          </CardFooter>
        }
      >
        {report.disputeRates.map((d) => (
          <tr key={d.accountId}>
            <td>
              <Link href={`/admin/accounts/${d.accountId}`} className="nm rowlink">
                {d.name}
              </Link>
            </td>
            <td className="tr strong">{d.releases}</td>
            <td className="tr">{d.disputes}</td>
            <td className="tr sm">{d.upheld}</td>
            <td style={{ minWidth: 150 }}>
              <div className="row" style={{ gap: ".5rem", flexWrap: "nowrap" }}>
                <div className="meter" style={{ flex: 1, minWidth: 60, margin: 0 }} role="presentation">
                  <i className={d.ratePercent > 15 ? "red" : d.ratePercent > 5 ? "amber" : "green"} style={{ width: `${Math.min(100, d.ratePercent)}%` }} />
                </div>
                <span className="strong" style={{ color: d.ratePercent > 15 ? "var(--red)" : undefined }}>
                  {d.ratePercent}%
                </span>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </Card>
  );
}

export function PurchasesActivityCard({ report }: { report: OperationsReport }) {
  const p = report.purchases;
  return (
    <Card>
      <CardHeader title="Purchase volume" actions={<Link className="link sm" href="/admin/purchases">Purchases</Link>} />
      <CardBody>
        <DefinitionList
          items={[
            ["Paid orders", String(p.orders)],
            ["Leads sold", String(p.leads)],
            ["Value", formatMoney(p.valueCents)],
            ["Average", p.orders ? formatMoney(Math.round(p.valueCents / p.orders)) : "—"],
            [
              "Declined",
              p.declinedCount ? (
                <Link key="d" className="link" href="/admin/finance?tab=declined" style={{ color: "var(--red)" }}>
                  {p.declinedCount} · {formatMoney(p.declinedCents)}
                </Link>
              ) : (
                "None"
              ),
            ],
          ]}
        />
      </CardBody>
    </Card>
  );
}

export function AccountActivityCard({ report }: { report: OperationsReport }) {
  return (
    <Card>
      <CardHeader title="Account activity" />
      <CardBody>
        <DefinitionList
          items={[
            ["Applications", `${report.accounts.applications} in the window`],
            ["Approvals", `${report.accounts.approvals} in the window`],
          ]}
        />
        <hr className="hr" style={{ margin: ".9rem 0" }} />
        <div className="row" style={{ gap: ".4rem" }}>
          {report.accounts.byStatus.map((s) => (
            <span key={s.key} className="row" style={{ gap: ".3rem" }}>
              <StatusBadge status={s.key} />
              <span className="strong sm">{s.count}</span>
            </span>
          ))}
        </div>
        <p className="xs" style={{ marginTop: ".6rem" }}>
          All accounts by current status.
        </p>
      </CardBody>
    </Card>
  );
}

export function LiabilityCard({ report }: { report: OperationsReport }) {
  const l = report.liability;
  const onDownload = () => {
    downloadCsv(`balance-liability-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Account", "Status", "Exclusive remaining", "Standard remaining", "Value at current rates (USD)", "Fulfilment cost (USD)"],
      ...l.rows.map((r) => [r.name, r.status, r.exclusive, r.standard, (r.valueCents / 100).toFixed(2), (r.fulfilmentCostCents / 100).toFixed(2)]),
      ["Total", "", l.exclusive, l.standard, (l.valueCents / 100).toFixed(2), (l.fulfilmentCostCents / 100).toFixed(2)],
    ]);
  };
  return (
    <Card>
      <CardHeader
        title="Balance liability"
        description="Leads paid for and not yet released, per account. Nothing expires, so this is what the business still owes."
        actions={
          <Button variant="out" size="s" icon="doc" onClick={onDownload} disabled={l.rows.length === 0}>
            Download CSV
          </Button>
        }
      />
      <DataTable
        flush
        caption="Balance liability by account"
        isEmpty={l.rows.length === 0}
        empty={
          <EmptyState icon="coin" title="No outstanding balances">
            Every lead paid for has been released.
          </EmptyState>
        }
        columns={[
          { label: "Account" },
          { label: "Status" },
          { label: "Exclusive", align: "right" },
          { label: "Standard", align: "right" },
          { label: "Value at current rates", align: "right" },
          { label: "Fulfilment cost", align: "right" },
        ]}
        footer={
          <CardFooter>
            <span className="xs">
              Value uses today&apos;s rate card; fulfilment cost uses today&apos;s per-grade acquisition cost, before any sharing of standard leads. Current state, not
              limited to the date window.
            </span>
          </CardFooter>
        }
      >
        {l.rows.map((r) => (
          <tr key={r.accountId}>
            <td>
              <Link href={`/admin/accounts/${r.accountId}`} className="nm rowlink">
                {r.name}
              </Link>
            </td>
            <td>
              <StatusBadge status={r.status} />
            </td>
            <td className="tr strong">{r.exclusive}</td>
            <td className="tr strong">{r.standard}</td>
            <td className="tr">{formatMoney(r.valueCents)}</td>
            <td className="tr sm">{formatMoney(r.fulfilmentCostCents)}</td>
          </tr>
        ))}
        {l.rows.length > 0 && (
          <tr style={{ background: "var(--soft)" }}>
            <td className="nm">Total · {l.rows.length} accounts</td>
            <td />
            <td className="tr strong">{l.exclusive}</td>
            <td className="tr strong">{l.standard}</td>
            <td className="tr strong">{formatMoney(l.valueCents)}</td>
            <td className="tr strong">{formatMoney(l.fulfilmentCostCents)}</td>
          </tr>
        )}
      </DataTable>
    </Card>
  );
}
