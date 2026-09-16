"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@convex/_generated/api";
import { BalanceCard } from "@/components/balance/BalanceCard";
import { PageHeader } from "@/components/layouts/PortalShell";
import { LeadTypeBadge, Badge, StatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, DefinitionList, StatCard, Timeline } from "@/components/ui/Display";
import { Alert, EmptyState, Meter, PageLoading } from "@/components/ui/Feedback";
import { Switch } from "@/components/ui/Form";
import { daysUntil, formatDate, timeAgo, timeUntil } from "@/domain/format";
import { useAction } from "@/hooks/useAction";

export default function AgentDashboardPage() {
  const data = useQuery(api.dashboard.agent);
  const setAutoReload = useMutation(api.preferences.setAutoReload);
  const router = useRouter();
  const [toggleAutoReload, toggling] = useAction((enabled: boolean) => setAutoReload({ enabled }), {
    success: "Auto-reload updated",
  });

  if (data === undefined) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <PageLoading />
      </>
    );
  }

  const { account, balance, stats, preferences: prefs, purchases, pipeline } = data;
  const producer = data.role === "PRODUCER";
  const pace = prefs?.dailyPace ?? 0;
  const todayPct = pace ? Math.round((stats.releasedToday / pace) * 100) : 0;
  const leftPct = balance.issued ? Math.round((balance.total / balance.issued) * 100) : 0;

  const alerts: Array<{ kind: "e" | "w" | "i"; body: React.ReactNode; href: string; cta: string }> = [];
  if (account.status === "blocked") alerts.push({ kind: "e", body: <><b>Your account is blocked.</b> {account.statusReason} Existing leads stay visible; no new leads will be released.</>, href: "/agent/support", cta: "Contact support" });
  if (account.status === "suspended") alerts.push({ kind: "w", body: <><b>Account suspended.</b> {account.statusReason} Send your renewal evidence and we will lift it.</>, href: "/agent/licenses", cta: "Upload evidence" });
  if (account.declinedPurchaseOutstanding) alerts.push({ kind: "e", body: <><b>Your last auto-reload was declined.</b> No leads were added. Retry the purchase or update your card.</>, href: "/agent/purchases", cta: "Billing & purchases" });
  if (prefs?.paused) alerts.push({ kind: "i", body: <><b>Lead flow is paused</b>{prefs.pausedUntil ? ` until ${formatDate(prefs.pausedUntil)}` : ""}. Nothing will be released to you in the meantime.</>, href: "/agent/preferences", cta: "Resume now" });
  if (!producer) {
    if (balance.total === 0) alerts.push({ kind: "w", body: <><b>Your lead balance is empty.</b> Nothing expired — every lead you bought has been released to you. Buy more to start receiving again.</>, href: "/agent/balance/top-up", cta: "Buy leads" });
    else if (balance.issued && balance.total / balance.issued < 0.25)
      alerts.push({ kind: "w", body: <><b>Lead balance running low</b> — {balance.total} left of {balance.issued} received.{prefs?.autoReloadEnabled ? ` Auto-reload adds ${prefs.autoReloadQuantity} more at ${prefs.autoReloadThreshold}.` : " Auto-reload is off."}</>, href: "/agent/balance/top-up", cta: "Buy leads" });
  }
  if (data.eoExpiresAt) {
    const d = daysUntil(data.eoExpiresAt, data.now);
    if (d >= 0 && d < 60) alerts.push({ kind: "w", body: <><b>E&amp;O cover expires {timeUntil(data.eoExpiresAt, data.now)}.</b> Lead flow halts across all states the day it lapses — upload your renewal before then.</>, href: "/agent/licenses", cta: "Upload renewal" });
  }

  return (
    <>
      <PageHeader title="Dashboard" />
      {alerts.length > 0 && (
        <div className="stack" style={{ marginBottom: "1.25rem" }}>
          {alerts.map((a, i) => (
            <Alert key={i} kind={a.kind}>
              {a.body}{" "}
              <Link className="link" href={a.href} style={{ marginLeft: ".3rem" }}>
                {a.cta} →
              </Link>
            </Alert>
          ))}
        </div>
      )}

      <div className="g g4" style={{ marginBottom: "1.25rem" }}>
        <StatCard
          label="New, unopened"
          value={stats.newUnopened}
          icon="inbox"
          accent={stats.newUnopened ? "gold" : null}
          sub={stats.oldestNewAt ? `Oldest ${timeAgo(stats.oldestNewAt, data.now)}` : "All caught up"}
          href="/agent/leads?status=new"
        />
        <StatCard
          label="Released today"
          value={stats.releasedToday}
          unit={pace ? `of ${pace} pace` : undefined}
          icon="target"
          meter={todayPct}
          meterTone={todayPct > 85 ? "red" : undefined}
          sub={todayPct >= 100 ? "Daily pace reached — resumes at midnight" : `Room for ${Math.max(0, pace - stats.releasedToday)} more today`}
        />
        <StatCard
          label="Leads remaining"
          value={balance.total}
          unit={`of ${balance.issued} received`}
          icon="coin"
          accent={balance.total ? "gold" : "red"}
          meter={leftPct}
          meterTone={leftPct < 25 ? "red" : "gold"}
          sub={`${balance.delivered} delivered so far · no expiry`}
          href={producer ? undefined : "/agent/balance"}
        />
        <StatCard
          label="Contact rate"
          value={`${stats.contactRate}%`}
          icon="phone"
          accent={stats.contactRate > 70 ? "green" : stats.contactRate > 50 ? null : "red"}
          meter={stats.contactRate}
          meterTone={stats.contactRate > 70 ? "green" : "amber"}
          sub="Feeds your matching priority"
        />
      </div>

      <div className="g g-2-1">
        <div className="stack">
          <Card>
            <CardHeader
              title="Latest releases"
              description="Newest first. One lead came off your balance at the moment each of these was released."
              actions={
                <ButtonLink href="/agent/leads" variant="out" size="s" iconRight="arrow">
                  View all
                </ButtonLink>
              }
            />
            {data.latest.length ? (
              <DataTable
                flush
                caption="Latest releases"
                columns={[{ label: "Lead" }, { label: "Product" }, { label: "Where" }, { label: "Type" }, { label: "Status" }, { label: "Released" }]}
              >
                {data.latest.map((l) => (
                  <tr key={l.assignmentId} className="clk" onClick={() => router.push(`/agent/leads/${l.assignmentId}`)}>
                    <td>
                      <Link href={`/agent/leads/${l.assignmentId}`} className="nm">
                        {l.name}
                      </Link>
                      <span className="tsub mono">{l.reference}</span>
                    </td>
                    <td>{l.coverageName}</td>
                    <td>
                      {l.city ? `${l.city}, ` : ""}
                      {l.state}
                    </td>
                    <td>
                      <LeadTypeBadge type={l.leadType} />
                    </td>
                    <td>
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="sm nowrap">{timeAgo(l.assignedAt, data.now)}</td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <EmptyState
                icon="inbox"
                title="No leads yet"
                action={
                  <ButtonLink href="/agent/preferences" variant="out" size="s">
                    Review preferences
                  </ButtonLink>
                }
              >
                Your first release will land here.
                {prefs ? ` Your preferences currently cover ${prefs.coverageCount} products across ${prefs.states.length} states.` : ""}
              </EmptyState>
            )}
          </Card>

          <Card>
            <CardHeader title="Pipeline" />
            <CardBody>
              <div className="g g4">
                {(["new", "contacted", "qualified", "sold"] as const).map((st) => (
                  <div key={st}>
                    <div className="eyebrow" style={{ marginBottom: ".3rem" }}>
                      <StatusBadgeLabel status={st} />
                    </div>
                    <div style={{ fontFamily: "var(--fh)", fontSize: "1.5rem", fontWeight: 700 }}>{pipeline[st]}</div>
                    <Meter
                      percent={pipeline.total ? (pipeline[st] / pipeline.total) * 100 : 0}
                      tone={st === "sold" ? "green" : st === "qualified" ? "gold" : undefined}
                    />
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="stack">
          {!producer && (
            <Card>
              <CardHeader
                title="Your lead balance"
                description={`Bought ${purchases.leadsBought} · ${purchases.exclusiveBought} exclusive, ${purchases.standardBought} standard · ${balance.delivered} delivered`}
                actions={
                  <Badge tone="g" dot>
                    No expiry
                  </Badge>
                }
              />
              <CardBody className="stack" style={{ gap: ".65rem" }}>
                <BalanceCard type="exclusive" remaining={balance.exclusive} issued={balance.exclusiveIssued} />
                <BalanceCard type="standard" remaining={balance.standard} issued={balance.standardIssued} />
                {prefs && (
                  <div style={{ marginTop: ".3rem" }}>
                    <Switch
                      checked={prefs.autoReloadEnabled}
                      disabled={toggling || account.readOnly}
                      onChange={(on) => void toggleAutoReload(on)}
                      label={`Auto-reload ${prefs.autoReloadQuantity} leads at a balance of ${prefs.autoReloadThreshold}`}
                    />
                  </div>
                )}
                <p className="xs">
                  A lead is drawn down only when it is released to you, never before. Your balance does not expire, and there is no fixed delivery schedule — it
                  may fill in days or over several weeks depending on consumer volume in your states.
                </p>
                <ButtonLink href="/agent/balance/top-up" variant="navy" size="s" full>
                  Buy more leads
                </ButtonLink>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Your account" actions={<StatusBadge status={account.status} />} />
            <CardBody>
              <DefinitionList
                items={[
                  !producer && ["Leads bought", `${purchases.leadsBought} across ${purchases.orderCount} purchase${purchases.orderCount === 1 ? "" : "s"}`],
                  ["Mix", "2 exclusive in every 10 — fixed"],
                  prefs && ["Products", `${prefs.coverageCount} of ${prefs.coverageTotal} selected`],
                  prefs && ["States", prefs.states.join(", ") || "—"],
                  prefs && ["Daily pace", `${prefs.dailyPace} leads`],
                  ["Producer seats", account.type === "agency" ? `${data.seats} — included free` : "1 — included free"],
                ]}
              />
              {!producer && (
                <div className="b-row" style={{ marginTop: "1rem" }}>
                  <ButtonLink href="/agent/purchases" variant="out" size="s" full>
                    Billing &amp; purchases
                  </ButtonLink>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Recent activity" />
            <CardBody>
              {data.activity.length ? (
                <Timeline
                  items={data.activity.map((n) => ({
                    key: n.id,
                    tone: n.type === "dispute" ? "ok" : n.type === "leads" || n.type === "billing" ? "warn" : n.type === "compliance" ? "bad" : undefined,
                    time: timeAgo(n.createdAt, data.now),
                    title: n.title,
                    body: n.body,
                  }))}
                />
              ) : (
                <p className="sm">Nothing yet. New releases, balance changes and decisions appear here.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatusBadgeLabel({ status }: { status: string }) {
  const labels: Record<string, string> = { new: "New", contacted: "Contacted", qualified: "Qualified", sold: "Sold" };
  return <>{labels[status] ?? status}</>;
}
