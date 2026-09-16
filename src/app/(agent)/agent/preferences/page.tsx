"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { useAgentAccount, useMountTime } from "@/components/agent/useAgentAccount";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert, EmptyState, PageLoading } from "@/components/ui/Feedback";
import { Chips, Field, FieldGrid, Switch } from "@/components/ui/Form";
import { useToast } from "@/components/ui/Toast";
import { DAILY_PACE_OPTIONS, RECEIVING_END_HOURS, RECEIVING_START_HOURS } from "@/domain/constants";
import { formatDate } from "@/domain/format";

type UpdateArgs = {
  coverageTypes?: string[];
  states?: string[];
  dailyPace?: number;
  receivingStartHour?: number;
  receivingEndHour?: number;
  notifyEmailOnLead?: boolean;
  notifySmsOnLead?: boolean;
};

const DAY = 86_400_000;
const isoDay = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function PreferencesPage() {
  const agent = useAgentAccount();
  if (agent === undefined) {
    return (
      <>
        <PageHeader title="Preferences" />
        <PageLoading />
      </>
    );
  }
  if (!agent || agent.producer) {
    return (
      <>
        <PageHeader title="Preferences" />
        <div className="card">
          <EmptyState icon="filter" title="Set by your agency">
            Products, states and delivery pace are hard limits set once for the whole agency by your principal.
          </EmptyState>
        </div>
      </>
    );
  }
  return <PreferencesView readOnly={agent.readOnly} />;
}

function PreferencesView({ readOnly }: { readOnly: boolean }) {
  const data = useQuery(api.preferences.mine);
  const reference = useQuery(api.referenceData.publicData);
  const update = useMutation(api.preferences.update);
  const setPausedMutation = useMutation(api.preferences.setPaused);
  const toast = useToast();
  const now = useMountTime();
  const [saving, setSaving] = useState(false);
  const [pauseUntil, setPauseUntil] = useState("");

  if (data === undefined || reference === undefined) {
    return (
      <>
        <PageHeader title="Preferences" />
        <PageLoading />
      </>
    );
  }
  const prefs = data.preferences;
  if (!prefs) {
    return (
      <>
        <PageHeader title="Preferences" />
        <div className="card">
          <EmptyState icon="filter" title="Preferences not set up yet">
            Your lead preferences are created when your account is approved. Contact support if this persists.
          </EmptyState>
        </div>
      </>
    );
  }

  const disabled = readOnly || saving;
  const verified = new Set(data.verifiedStates);
  const paused = prefs.paused && (!prefs.pausedUntil || prefs.pausedUntil > now);

  const save = async (args: UpdateArgs, title: string, body?: string) => {
    if (readOnly) {
      toast.warn("Read-only", "Your account cannot be edited right now.");
      return;
    }
    setSaving(true);
    try {
      await update(args);
      toast.success(title, body);
    } catch (e) {
      toast.error(e, "Preferences were not saved");
    } finally {
      setSaving(false);
    }
  };

  const togglePause = async (next: boolean) => {
    let until: number | undefined;
    if (next && pauseUntil) until = new Date(`${pauseUntil}T23:59:59`).getTime();
    setSaving(true);
    try {
      await setPausedMutation({ paused: next, until });
      toast.success(next ? "Lead flow paused" : "Lead flow resumed", next ? "The engine will skip you entirely." : "You are back in the queue.");
      setPauseUntil("");
    } catch (e) {
      toast.error(e, "Lead flow was not changed");
    } finally {
      setSaving(false);
    }
  };

  const toggleIn = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <>
      <PageHeader title="Preferences" />
      {readOnly && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="w">Your account is read-only, so preferences cannot be changed. They are shown for reference.</Alert>
        </div>
      )}
      <Alert kind="i">
        <b>These are hard limits.</b> The distribution engine filters on them before anything else. Nothing outside your selected products, states and hours
        will ever reach you — and because the engine assigns automatically, these settings are how you shape what lands.
      </Alert>

      <div className="g g2" style={{ marginTop: "1.25rem" }}>
        <div className="stack">
          <Card>
            <CardHeader
              title="Products"
              description={`${prefs.coverageTypes.length} of ${reference.coverageTypes.length} selected — all products are available on every account`}
            />
            <CardBody>
              <Chips
                options={reference.coverageTypes.map((c) => ({ value: c.key, label: c.name }))}
                selected={prefs.coverageTypes}
                disabled={disabled}
                onToggle={(key) => {
                  const next = toggleIn(prefs.coverageTypes, key);
                  if (!next.length) toast.warn("Keep at least one", "You must take at least one product.");
                  else void save({ coverageTypes: next }, "Preferences saved", "The engine uses this on the next lead.");
                }}
              />
              {reference.coverageTypes.some((c) => c.requiresTpmo && prefs.coverageTypes.includes(c.key)) && (
                <p className="xs" style={{ marginTop: ".7rem" }}>
                  Medicare leads also need an approved{" "}
                  <Link className="link" href="/agent/licenses">
                    TPMO request
                  </Link>
                  .
                </p>
              )}
              <p className="xs" style={{ marginTop: ".7rem" }}>
                Narrowing this slows delivery; widening it speeds delivery up. It never changes what a lead costs.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="States" description="Only states with a verified licence can be selected" />
            <CardBody>
              <Chips
                gold
                options={reference.servicedStates.map((s) => {
                  const ok = verified.has(s.code);
                  const on = prefs.states.includes(s.code);
                  return { value: s.code, label: ok ? s.name : `${s.name} ·`, disabled: !ok && !on, title: ok ? undefined : "No verified licence" };
                })}
                selected={prefs.states}
                disabled={disabled}
                onToggle={(code) => {
                  const next = toggleIn(prefs.states, code);
                  if (!next.length) toast.warn("Keep at least one state", "Otherwise nothing can reach you.");
                  else void save({ states: next }, "Preferences saved", "The engine uses this on the next lead.");
                }}
              />
              <p className="xs" style={{ marginTop: ".7rem" }}>
                States without a verified licence are locked. Add a state or file a renewal in{" "}
                <Link className="link" href="/agent/licenses">
                  Licences &amp; compliance
                </Link>{" "}
                — our licensing team reviews it before it unlocks.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Volume & timing" />
            <CardBody>
              <Field
                label="Daily pace — most leads per day"
                help={`There is no fixed delivery schedule, so your whole balance could arrive in a day if volume is strong. This caps how many reach you at once. ${data.releasedLast24h} released in the last 24 hours.`}
              >
                <select
                  value={prefs.dailyPace}
                  disabled={disabled}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    void save({ dailyPace: n }, "Daily pace updated", `At most ${n} leads a day will reach you.`);
                  }}
                >
                  {DAILY_PACE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <FieldGrid>
                <Field label="Receiving from">
                  <select
                    value={prefs.receivingStartHour}
                    disabled={disabled}
                    onChange={(e) => void save({ receivingStartHour: Number(e.target.value) }, "Receiving window updated")}
                  >
                    {RECEIVING_START_HOURS.map((n) => (
                      <option key={n} value={n}>
                        {n}:00
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Receiving until">
                  <select
                    value={prefs.receivingEndHour}
                    disabled={disabled}
                    onChange={(e) => void save({ receivingEndHour: Number(e.target.value) }, "Receiving window updated")}
                  >
                    {RECEIVING_END_HOURS.map((n) => (
                      <option key={n} value={n}>
                        {n}:00
                      </option>
                    ))}
                  </select>
                </Field>
              </FieldGrid>
              <p className="xs">
                Hours are in your account time zone ({data.timezone.replace(/_/g, " ")}). Leads that qualify outside this window are held and retried when it
                next opens — they are not lost.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Pause lead flow"
              actions={
                paused ? (
                  <Badge tone="a" dot>
                    Paused
                  </Badge>
                ) : (
                  <Badge tone="g" dot>
                    Receiving
                  </Badge>
                )
              }
            />
            <CardBody>
              <p className="sm" style={{ marginBottom: ".9rem" }}>
                {paused
                  ? `Paused ${prefs.pausedUntil ? `until ${formatDate(prefs.pausedUntil)}` : "until you resume"}. Your lead balance is untouched and nothing expires while you are away.`
                  : "Going on holiday? Pause and the engine will skip you entirely. Your balance is unaffected — there is no cycle to lose and nothing expires."}
              </p>
              {!paused && !readOnly && (
                <Field label="Pause until (optional)" help="Leave empty to pause until you resume. Up to 90 days ahead.">
                  <input type="date" value={pauseUntil} min={isoDay(now + DAY)} max={isoDay(now + 89 * DAY)} onChange={(e) => setPauseUntil(e.target.value)} />
                </Field>
              )}
              <Switch checked={paused} disabled={disabled} onChange={(v) => void togglePause(v)} label={paused ? "Resume receiving leads" : "Pause lead flow"} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notification channels" />
            <CardBody className="stack" style={{ gap: ".5rem" }}>
              <Switch checked disabled onChange={() => undefined} label="In-app — always on" />
              <Switch
                checked={prefs.notifyEmailOnLead}
                disabled={disabled}
                onChange={(v) => void save({ notifyEmailOnLead: v }, v ? "Email alerts on" : "Email alerts off")}
                label="Email on new lead"
              />
              <Switch
                checked={prefs.notifySmsOnLead}
                disabled={disabled}
                onChange={(v) => void save({ notifySmsOnLead: v }, v ? "SMS alerts on" : "SMS alerts off")}
                label="SMS on new lead"
              />
              <p className="xs">Compliance messages — such as a consumer opting out — always send on every channel and cannot be turned off.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
