"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { Suspense, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AccountTrace, ScoreParts } from "@/components/admin/EligibilityTrace";
import { formatMinutesLong, formatMinutesShort, formatWaited } from "@/components/admin/format";
import { useSearchParamState, useStaff } from "@/components/admin/hooks";
import { PageHeader } from "@/components/layouts/PortalShell";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { Badge, LeadTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert, EmptyState, LoadingBlock, PageLoading } from "@/components/ui/Feedback";
import { Field, Select } from "@/components/ui/Form";
import { RANKING_COMPONENTS } from "@/domain/ranking";
import { cn } from "@/lib/cn";

export default function SimulatorPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <RequirePermission permission="distribution.read" title="Distribution simulator">
        <SimulatorView />
      </RequirePermission>
    </Suspense>
  );
}

function SimulatorView() {
  const [params, setParams] = useSearchParamState();
  const { can } = useStaff();
  const leadId = (params.get("leadId") || null) as Id<"leads"> | null;
  const state = params.get("state") || "GA";
  const product = params.get("product") || "life";
  const grade = params.get("grade") === "exclusive" ? "exclusive" : "standard";

  const reference = useQuery(api.referenceData.publicData);
  const settings = useQuery(api.distribution.admin.settings);
  const sim = useQuery(api.distribution.admin.simulate, leadId ? { leadId } : { state, coverageType: product, leadType: grade });
  const existing = useQuery(api.leads.adminGet, leadId && can("leads.read") ? { leadId } : "skip");
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const coverageName = (key: string) => reference?.coverageTypes.find((c) => c.key === key)?.name ?? key;
  const stateName = (code: string) => reference?.states.find((s) => s.code === code)?.name ?? code;
  const recipients = settings?.settings.standardRecipientCount ?? 3;

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader title="Distribution simulator" />
      <Alert kind="i">
        <b>This runs the live engine read-only.</b> The panels below apply the same eligibility rules and the same ranking the engine uses to every approved
        account as it stands right now. <b>Nothing is assigned</b>, no balance is drawn and nobody is notified. An exclusive lead goes to exactly one agent; a
        standard lead goes to up to {recipients} agents. Change the lead and the outcome changes with it.
      </Alert>

      <div className="g g-1-2" style={{ marginTop: "1.25rem" }}>
        <div className="stack">
          {leadId ? (
            <Card>
              <CardHeader title="Existing lead" actions={existing ? <StatusBadge status={existing.lead.status} /> : undefined} />
              <CardBody>
                {sim === null ? (
                  <Alert kind="e">That lead does not exist.</Alert>
                ) : (
                  <>
                    {existing && (
                      <p style={{ marginBottom: ".6rem" }}>
                        <Link href={`/admin/leads/${leadId}`} className="mono strong link">
                          {existing.lead.reference}
                        </Link>
                      </p>
                    )}
                    {sim ? (
                      <dl className="dl">
                        <dt>State</dt>
                        <dd>{stateName(sim.lead.state)}</dd>
                        <dt>Product</dt>
                        <dd>{coverageName(sim.lead.coverageType)}</dd>
                        <dt>Grade</dt>
                        <dd>
                          <LeadTypeBadge type={sim.lead.leadType} />
                        </dd>
                        <dt>Assigned</dt>
                        <dd>
                          {sim.alreadyAssigned} of {sim.target} slot{sim.target === 1 ? "" : "s"}
                        </dd>
                      </dl>
                    ) : (
                      <LoadingBlock rows={3} />
                    )}
                    <p className="xs" style={{ marginTop: ".8rem" }}>
                      Accounts already holding this lead fail the &ldquo;not already released&rdquo; rule, so the trace shows exactly who else could take the
                      open slots.
                    </p>
                  </>
                )}
                <Button variant="out" size="s" full style={{ marginTop: ".9rem" }} onClick={() => setParams({ leadId: null })}>
                  Try a hypothetical lead instead
                </Button>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Hypothetical lead" />
              <CardBody>
                <Field label="State">
                  <Select
                    value={state}
                    onChange={(e) => setParams({ state: e.target.value })}
                    options={(reference?.states ?? [{ code: state, name: state, serviced: true }]).map((s) => ({
                      value: s.code,
                      label: s.serviced ? s.name : `${s.name} (not serviced)`,
                    }))}
                  />
                </Field>
                <Field label="Product">
                  <Select
                    value={product}
                    onChange={(e) => setParams({ product: e.target.value })}
                    options={(reference?.coverageTypes ?? [{ key: product, name: product }]).map((c) => ({ value: c.key, label: c.name }))}
                  />
                </Field>
                <Field
                  label="Lead grade"
                  help={`The grade is set at capture by the grading policy, not chosen by the agent. An exclusive lead goes to one agent; a standard lead to up to ${recipients}, each debited one standard lead.`}
                >
                  <Select
                    value={grade}
                    onChange={(e) => setParams({ grade: e.target.value })}
                    options={[
                      { value: "standard", label: "Standard — shared" },
                      { value: "exclusive", label: "Exclusive — one agent" },
                    ]}
                  />
                </Field>
                <p className="xs" style={{ marginTop: ".4rem" }}>
                  Receiving hours and daily pace are checked in each account&rsquo;s own timezone as of this moment.
                </p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Outcome"
              actions={
                sim ? (
                  sim.engineEnabled ? (
                    <Badge tone="g" dot>
                      Engine running
                    </Badge>
                  ) : (
                    <Badge tone="r" dot>
                      Engine paused
                    </Badge>
                  )
                ) : undefined
              }
            />
            <CardBody>{sim === undefined ? <LoadingBlock rows={4} label="Running the rules" /> : sim === null ? <p className="sm">No lead to simulate.</p> : <Outcome sim={sim} settings={settings?.settings} />}</CardBody>
          </Card>
        </div>

        <div className="stack">
          {sim && sim.ranked.length > 0 && <WhyCard sim={sim} settings={settings?.settings} />}

          <Card>
            <CardHeader
              title="Rule trace — every account"
              actions={
                sim ? (
                  <div className="row" style={{ gap: ".6rem" }}>
                    <span className="xs">
                      {sim.ranked.length} pass · {sim.evaluated.length - sim.ranked.length} blocked
                    </span>
                    {sim.evaluated.length > 0 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setOpenIds(openIds.size === sim.evaluated.length ? new Set() : new Set(sim.evaluated.map((e) => e.accountId)))}
                      >
                        {openIds.size === sim.evaluated.length ? "Collapse all" : "Expand all"}
                      </Button>
                    )}
                  </div>
                ) : undefined
              }
            />
            <CardBody className="stack" style={{ gap: ".6rem" }}>
              {sim === undefined ? (
                <LoadingBlock rows={6} label="Evaluating accounts" />
              ) : !sim || sim.evaluated.length === 0 ? (
                <EmptyState icon="users" title="No accounts to evaluate">
                  Only approved accounts are considered by the engine.
                </EmptyState>
              ) : (
                <>
                  <p className="xs" style={{ margin: 0 }}>
                    Rules run in order and stop at the first failure for each account, which is why a trace ends where it does.
                  </p>
                  {[...sim.evaluated].sort((a, b) => (sim.ranked.find((r) => r.accountId === a.accountId)?.position ?? 999) - (sim.ranked.find((r) => r.accountId === b.accountId)?.position ?? 999)).map((e) => {
                    const ranked = sim.ranked.find((r) => r.accountId === e.accountId);
                    return (
                      <AccountTrace
                        key={e.accountId}
                        name={e.name}
                        eligible={e.eligible}
                        rules={e.trace}
                        score={ranked?.score ?? null}
                        open={openIds.has(e.accountId)}
                        onToggle={() => toggle(e.accountId)}
                        subtitle={`${e.balanceOfType} ${sim.lead.leadType} left${ranked ? ` · #${ranked.position} · score ${ranked.score.total}` : ""}`}
                      />
                    );
                  })}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
      {!leadId && can("leads.read") && (
        <p className="xs" style={{ marginTop: "1rem" }}>
          To diagnose a real lead, open it from <Link className="link" href="/admin/leads/unassigned">Unassigned leads</Link> and choose Diagnose.
        </p>
      )}
      {leadId && can("leads.read") && (
        <div style={{ marginTop: "1rem" }}>
          <ButtonLink href={`/admin/leads/${leadId}`} variant="out" size="s" icon="back">
            Back to the lead
          </ButtonLink>
        </div>
      )}
    </>
  );
}

type Sim = NonNullable<FunctionReturnType<typeof api.distribution.admin.simulate>>;
type Settings = FunctionReturnType<typeof api.distribution.admin.settings>["settings"];

function Outcome({ sim, settings }: { sim: Sim; settings: Settings | undefined }) {
  const receivers = sim.ranked.filter((r) => r.receives);
  const type = sim.lead.leadType;
  const ladder = settings?.retryScheduleMinutes.map(formatMinutesShort) ?? [];
  const names = receivers.map((r) => r.name).join(", ");

  let note;
  if (sim.slots === 0) {
    note = (
      <Alert kind="n">
        <b>
          All {sim.target} recipient slot{sim.target === 1 ? " is" : "s are"} already filled.
        </b>{" "}
        Nobody else would receive this lead unless an assignment is revoked.
      </Alert>
    );
  } else if (!sim.engineEnabled) {
    note = (
      <Alert kind="w">
        <b>Distribution is switched off.</b> This lead would be held in the queue and released
        {receivers.length ? ` to ${names}` : ""} once an admin switches sending back on and releases the queue. Nothing is lost.
      </Alert>
    );
  } else if (receivers.length) {
    note = (
      <Alert kind="s">
        <b>
          {receivers.length === 1 ? "One agent" : `${receivers.length} agents`} would receive it: {names}.
        </b>{" "}
        {sim.ranked.length} of {sim.evaluated.length} accounts passed every rule
        {receivers.length < sim.slots
          ? `, so only ${receivers.length} of the ${sim.slots} open slots can be filled — the rest stay on the retry ladder`
          : ""}
        . Each receiver is debited one {type} lead; everyone else keeps their place for the next lead.
      </Alert>
    );
  } else {
    note = (
      <Alert kind="e">
        <b>Nobody is eligible.</b> This lead would enter the retry ladder
        {ladder.length ? ` (${ladder[0]} → ${ladder[ladder.length - 1]})` : ""}
        {settings ? `, alert an admin after ${formatMinutesLong(settings.adminAlertAfterMinutes)} and become unassignable after ${formatMinutesLong(settings.unassignableAfterMinutes)}` : ""}
        . Expand the trace to see which rule stops each account.
      </Alert>
    );
  }

  return (
    <>
      {note}
      {sim.ranked.length > 0 && (
        <div style={{ marginTop: ".9rem" }}>
          {sim.ranked.map((r) => (
            <div key={r.accountId} className={cn("rank", r.receives && "win")}>
              <span className={cn("pos", !r.receives && "muted")}>{r.position}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong">
                  {r.name}{" "}
                  {r.receives && (
                    <Badge tone="g" className="align-middle">
                      {sim.engineEnabled ? "Receives it" : "Next in line"}
                    </Badge>
                  )}
                </div>
                <div className="xs">
                  {formatWaited(r.waitedHours)} · {r.balanceOfType} {type} left · score {r.score.total}
                  {r.score.starved ? " · starvation guard" : ""}
                  {r.score.penalized ? " · dispute penalty" : ""}
                </div>
              </div>
              <span className="sc" style={r.receives ? undefined : { color: "var(--gray-2)" }}>
                #{r.position}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function WhyCard({ sim, settings }: { sim: Sim; settings: Settings | undefined }) {
  const first = sim.ranked[0];
  const guard = sim.starvationGuardHours;
  const weights = sim.weights;
  const threshold = settings ? Math.round(settings.disputePenaltyThreshold * 100) : null;
  const waited = first.waitedHours == null ? "they have never received a lead" : `their last lead was ${Math.round(first.waitedHours)} hours ago`;

  return (
    <Card>
      <CardHeader
        title={`Why ${first.name} is first`}
        actions={
          first.receives ? (
            <Badge tone="g">{sim.engineEnabled ? "Receives it" : "Next in line"}</Badge>
          ) : undefined
        }
      />
      <CardBody>
        {first.score.starved ? (
          <Alert kind="i">
            <b>The starvation guard put them first.</b> {waited[0].toUpperCase() + waited.slice(1)}, which is at or beyond the {guard}-hour guard. Accounts
            that have waited that long rank ahead of everyone served more recently — longest wait first — whatever their score.
          </Alert>
        ) : first.score.penalized ? (
          <Alert kind="w">
            <b>Every eligible account is in the dispute-penalty tier.</b> Their upheld-dispute rate is above the threshold, so they are ordered by score
            among themselves; any account outside the penalty would have ranked ahead.
          </Alert>
        ) : (
          <Alert kind="i">
            <b>The weighted score decided.</b> No eligible account has waited {guard} hours or more, so accounts are ordered by the score below, highest
            first; a tie goes to whoever has waited longest. Here {waited}.
          </Alert>
        )}
        <div style={{ height: ".9rem" }} />
        <ScoreParts score={first.score} />
        <hr className="hr" />
        <div className="row-b">
          <span className="strong">Weighted score</span>
          <span style={{ fontFamily: "var(--fh)", fontSize: "1.4rem", fontWeight: 700 }}>
            {first.score.total} <span className="xs">/ 100</span>
          </span>
        </div>
        <div className="eyebrow" style={{ margin: "1.1rem 0 .45rem" }}>
          How the order is decided
        </div>
        <ol className="sm" style={{ paddingLeft: "1.1rem", display: "grid", gap: ".35rem" }}>
          <li>
            <b>Starvation guard</b> — accounts that have waited {guard}h or more since their last lead, or never had one, go first, longest wait first.
          </li>
          <li>
            <b>Weighted score</b> — everyone else, highest score first; ties go to the longest wait.
          </li>
          <li>
            <b>Dispute penalty</b> — accounts whose upheld-dispute rate is above {threshold != null ? `${threshold}%` : "the threshold"} still receive leads,
            but rank last.
          </li>
        </ol>
        <p className="xs" style={{ marginTop: ".8rem" }}>
          Live weights: {RANKING_COMPONENTS.map((c) => `${c.label.toLowerCase()} ${weights[c.key]}`).join(" · ")}. There are no plan tiers and no bidding —
          what agents buy is leads, not priority.
        </p>
      </CardBody>
    </Card>
  );
}
