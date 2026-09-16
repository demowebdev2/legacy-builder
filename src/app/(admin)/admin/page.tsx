"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo } from "react";
import { api } from "@convex/_generated/api";
import { EngineCard } from "@/components/admin/EngineCard";
import { ago } from "@/components/admin/format";
import { useNow, useStaff } from "@/components/admin/hooks";
import { PageHeader } from "@/components/layouts/PortalShell";
import { LeadTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/Card";
import { DataTable, IconBox, StatCard } from "@/components/ui/Display";
import { Alert, EmptyState, Meter, PageLoading } from "@/components/ui/Feedback";
import type { IconName } from "@/components/ui/Icon";
import { formatMoney } from "@/domain/money";
import type { Permission } from "@/domain/permissions";

/** Where a staff member without `reports.read` lands instead (first page their role can open). */
const FALLBACK_ROUTES: Array<[string, Permission]> = [
  ["/admin/leads", "leads.read"],
  ["/admin/simulator", "distribution.read"],
  ["/admin/accounts", "accounts.read"],
  ["/admin/purchases", "payments.read"],
  ["/admin/suppression", "suppression.read"],
  ["/admin/audit-log", "audit.read"],
  ["/admin/cms", "cms.manage"],
  ["/admin/legal", "legal.draft"],
  ["/admin/settings", "settings.read"],
];

type Tone = "amber" | "red" | "blue" | "green";

function QueueCard({ label, count, sub, icon, tone, cost, href }: { label: string; count: number; sub: string; icon: IconName; tone: Tone; cost: ReactNode; href: string | null }) {
  const body = (
    <div className="card-bd">
      <div className="row-b" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{label}</div>
          <div style={{ fontFamily: "var(--fh)", fontSize: "2.1rem", fontWeight: 700, letterSpacing: "-.03em", lineHeight: 1.1, margin: ".25rem 0" }}>{count}</div>
          <div className="sm">{sub}</div>
        </div>
        <IconBox icon={icon} tone={tone} />
      </div>
      <div className="xs" style={{ marginTop: ".7rem", color: `var(--${tone})`, fontWeight: 600 }}>
        {cost}
      </div>
    </div>
  );
  const style = { borderLeft: `3px solid var(--${tone})`, display: "block" } as const;
  return href ? (
    <Link href={href} className="card hoverlift" style={style} aria-label={`${label}: ${count}`}>
      {body}
    </Link>
  ) : (
    <div className="card" style={style}>
      {body}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { can, loading: staffLoading } = useStaff();
  const allowed = !staffLoading && can("reports.read");
  const data = useQuery(api.reports.adminDashboard, allowed ? {} : "skip");
  const queue = useQuery(api.distribution.admin.queueStatus, allowed && can("distribution.read") ? {} : "skip");
  const reference = useQuery(api.referenceData.publicData);
  const now = useNow();

  useEffect(() => {
    if (staffLoading || allowed) return;
    const target = FALLBACK_ROUTES.find(([, permission]) => can(permission));
    router.replace(target ? target[0] : "/auth/login");
  }, [allowed, can, router, staffLoading]);

  const actions = useMemo(
    () =>
      can("leads.manage") ? (
        <ButtonLink href="/admin/leads?create=1" variant="navy" size="s" icon="plus">
          New lead
        </ButtonLink>
      ) : undefined,
    [can],
  );

  if (!allowed || data === undefined) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <PageLoading />
      </>
    );
  }

  const { queues, stats, latestLeads, supply } = data;
  const leadTypeInfo = new Map((reference?.leadTypes ?? []).map((t) => [t.key, t]));
  const releasesPerLead = stats.leads24 ? Math.round((stats.releases24 / stats.leads24) * 10) / 10 : 0;

  return (
    <>
      <PageHeader title="Dashboard" actions={actions} />

      <h3 className="h3" style={{ marginBottom: ".25rem" }}>
        The four queues
      </h3>
      <p className="sm" style={{ marginBottom: "1rem" }}>
        Every hour an item sits in one of these costs the business money. Work top to bottom.
      </p>
      <div className="g g4" style={{ marginBottom: "1.5rem" }}>
        <QueueCard
          label="Awaiting verification"
          count={queues.verification.count}
          sub={queues.verification.oldestAt ? `Oldest ${ago(queues.verification.oldestAt, now)}` : "All decided"}
          icon="clock"
          tone="amber"
          href={can("licenses.verify") ? "/admin/verification" : can("accounts.read") ? "/admin/accounts?status=pending_verification" : null}
          cost={`≈ ${formatMoney(queues.verification.unbankedCents)} of unbanked opening purchases`}
        />
        <QueueCard
          label="Unassigned leads"
          count={queues.unassigned.count}
          sub={queues.unassigned.oldestAt ? `Oldest ${ago(queues.unassigned.oldestAt, now)}` : "All distributed"}
          icon="warn"
          tone="red"
          href={can("leads.read") ? "/admin/leads/unassigned" : null}
          cost={`≈ ${formatMoney(queues.unassigned.atRiskCents)} of acquisition cost at risk`}
        />
        <QueueCard
          label="Open disputes"
          count={queues.disputes.count}
          sub={queues.disputes.count ? "SLA 2 business days" : "None open"}
          icon="flow"
          tone="blue"
          href={can("disputes.read") ? "/admin/disputes" : null}
          cost={
            <>
              {queues.disputes.count} lead{queues.disputes.count === 1 ? "" : "s"} pending decision
              {queues.disputes.slaRisk ? ` · ${queues.disputes.slaRisk} at SLA risk` : ""}
            </>
          }
        />
        <QueueCard
          label="Declined purchases"
          count={queues.declined.count}
          sub={queues.declined.count ? "Agent notified — retry available" : "All current"}
          icon="money"
          tone="red"
          href={can("payments.read") ? "/admin/finance?tab=declined" : null}
          cost={`≈ ${formatMoney(queues.declined.valueCents)} of declined purchases`}
        />
      </div>

      <div className="g g4" style={{ marginBottom: "1.5rem" }}>
        <StatCard
          label="Lead sales, 30 days"
          value={formatMoney(stats.sales30Cents)}
          icon="trend"
          accent="green"
          sub={`${stats.leadsSold30} leads sold · ${stats.activeAccounts} active accounts`}
        />
        <StatCard label="Leads, 24h" value={stats.leads24} icon="inbox" sub={`${stats.releases24} releases · ${releasesPerLead} per lead`} />
        <StatCard
          label="Acquisition cost, 24h"
          value={formatMoney(stats.spend24Cents)}
          icon="money"
          accent="blue"
          sub={`Avg ${formatMoney(stats.leads24 ? Math.round(stats.spend24Cents / stats.leads24) : 0)} per lead`}
        />
        <StatCard
          label="Distribution engine"
          value={stats.engineEnabled ? "Running" : "Paused"}
          icon="play"
          accent={stats.engineEnabled ? "green" : "red"}
          sub={`${stats.runs24} attempts logged in 24h`}
          href={can("distribution.read") ? "/admin/distribution" : undefined}
        />
      </div>

      {!stats.engineEnabled && (
        <div style={{ marginBottom: "1.25rem" }}>
          <Alert kind="e">
            <b>Lead distribution is switched off.</b>{" "}
            {queue
              ? `${queue.heldCount} lead${queue.heldCount === 1 ? " is" : "s are"} waiting in the queue and nothing is reaching any agent.`
              : "Nothing is reaching any agent."}{" "}
            Nothing is lost and nothing expires — turn sending back on below and release the queue, oldest first.
          </Alert>
        </div>
      )}

      <div className="g g-2-1">
        <div className="stack">
          <Card>
            <CardHeader
              title="Latest leads"
              description="Straight from capture, newest first"
              actions={
                can("leads.read") ? (
                  <ButtonLink href="/admin/leads" variant="out" size="s" iconRight="arrow">
                    All leads
                  </ButtonLink>
                ) : undefined
              }
            />
            {latestLeads.length ? (
              <DataTable
                flush
                caption="Latest leads"
                columns={[{ label: "Reference" }, { label: "Product" }, { label: "Where" }, { label: "Type" }, { label: "Status" }, { label: "Held by" }, { label: "Age" }]}
              >
                {latestLeads.map((l) => {
                  return (
                    <tr key={l.id} className="clk" onClick={() => router.push(`/admin/leads/${l.id}`)}>
                      <td>
                        <Link href={`/admin/leads/${l.id}`} className="mono nm nowrap" onClick={(e) => e.stopPropagation()}>
                          {l.reference}
                        </Link>
                        <span className="tsub">{l.name}</span>
                      </td>
                      <td className="sm">{l.coverageName}</td>
                      <td className="sm">
                        {l.city ? `${l.city}, ` : ""}
                        {l.state}
                      </td>
                      <td>
                        <LeadTypeBadge type={l.leadType} />
                      </td>
                      <td>
                        <StatusBadge status={l.status} />
                      </td>
                      <td className="sm">
                        {l.holder ? (
                          <span className="nowrap" title={l.holder}>
                            <span
                              style={{ display: "inline-block", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}
                            >
                              {l.holder}
                            </span>
                            {l.holderCount > 1 && <span className="xs"> +{l.holderCount - 1}</span>}
                          </span>
                        ) : (
                          <span className="xs">—</span>
                        )}
                      </td>
                      <td className="sm nowrap">{ago(l.capturedAt, now)}</td>
                    </tr>
                  );
                })}
              </DataTable>
            ) : (
              <EmptyState icon="inbox" title="No leads yet">
                Captured leads appear here the moment they arrive.
              </EmptyState>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Supply against demand"
              description="Leads coming in (last 30 days) versus leads already paid for and waiting"
              actions={
                can("payments.read") ? (
                  <ButtonLink href="/admin/finance?tab=economics" variant="out" size="s" iconRight="arrow">
                    Lead economics
                  </ButtonLink>
                ) : undefined
              }
            />
            <DataTable
              flush
              caption="Supply against demand"
              columns={[
                { label: "Grade" },
                { label: "Captured", align: "right" },
                { label: "Released", align: "right" },
                { label: "Owed to agents", align: "right" },
                { label: "Cost each", align: "right" },
                { label: "Cover" },
              ]}
            >
              {supply.map((s) => {
                const info = leadTypeInfo.get(s.type);
                return (
                  <tr key={s.type}>
                    <td>
                      <span className="nm">{info?.name ?? (s.type === "exclusive" ? "Exclusive" : "Standard")}</span>
                      {info?.description && <span className="tsub">{info.description}</span>}
                    </td>
                    <td className="tr strong">{s.captured}</td>
                    <td className="tr sm">{s.released}</td>
                    <td className="tr strong" style={{ color: s.coverPercent < 50 ? "var(--red)" : undefined }}>
                      {s.owed}
                    </td>
                    <td className="tr sm">{formatMoney(s.costCents)}</td>
                    <td>
                      <div style={{ minWidth: 70 }} title={`${s.coverPercent}% covered`}>
                        <Meter percent={s.coverPercent} tone={s.coverPercent > 66 ? "green" : s.coverPercent > 33 ? "gold" : "red"} className="mt-0" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
            <CardFooter>
              <span className="xs">
                Because balances never expire, every unreleased lead is one the business still owes and must acquire. This liability is the number to keep
                ahead of.
              </span>
            </CardFooter>
          </Card>
        </div>

        <div className="stack">
          {can("distribution.read") && <EngineCard />}
          {can("distribution.read") && (
            <Card>
              <CardHeader title="Try the engine" />
              <CardBody>
                <p className="sm" style={{ marginBottom: ".9rem" }}>
                  Build a hypothetical lead and watch every eligibility rule run against every account, then see exactly which agents the ranking would
                  release it to. Nothing is assigned.
                </p>
                <ButtonLink href="/admin/simulator" variant="navy" size="s" full icon="target">
                  Open the simulator
                </ButtonLink>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
