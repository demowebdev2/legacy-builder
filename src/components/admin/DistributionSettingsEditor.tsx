"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, DefinitionList, Timeline } from "@/components/ui/Display";
import { Alert } from "@/components/ui/Feedback";
import { Checkbox, Field, FieldGrid, Select, Switch } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/domain/format";
import { RANKING_COMPONENTS, type RankingWeights } from "@/domain/ranking";
import { EngineCard } from "./EngineCard";
import { formatMinutesLong } from "./format";

type Data = FunctionReturnType<typeof api.distribution.admin.settings>;
type Settings = Data["settings"];

/** Numeric settings edited as text so a field can be cleared mid-edit. [min, max] are the server's bounds. */
const NUMERIC = {
  standardRecipientCount: [1, 10],
  disputeWindowHours: [1, 720],
  starvationGuardHours: [1, 720],
  waitNormalizationHours: [1, 720],
  contactRateWindowDays: [1, 365],
  adminAlertAfterMinutes: [1, 10_080],
  unassignableAfterMinutes: [60, 20_160],
  disputePenaltyPercent: [1, 99],
  disputePenaltyMinAssignments: [0, 1000],
  exclusiveEvery: [1, 100],
  dedupWindowDays: [0, 365],
} as const;
type NumKey = keyof typeof NUMERIC;

const BOOLEANS = ["holdOnDeclinedPurchase", "dedupMatchPhone", "dedupMatchEmail", "dedupSameCoverageOnly"] as const;
type BoolKey = (typeof BOOLEANS)[number];

const CHANGE_LABELS: Record<string, string> = {
  weights: "ranking weights",
  retryScheduleMinutes: "retry ladder",
  standardRecipientCount: "standard recipients",
  disputeWindowHours: "dispute window",
  starvationGuardHours: "starvation guard",
  waitNormalizationHours: "wait normalisation",
  contactRateWindowDays: "contact-rate window",
  adminAlertAfterMinutes: "admin alert",
  unassignableAfterMinutes: "unassignable timing",
  disputePenaltyThreshold: "dispute penalty threshold",
  disputePenaltyMinAssignments: "dispute penalty minimum",
  exclusiveEvery: "grading ratio",
  gradingMode: "grading mode",
  dedupWindowDays: "dedup window",
  holdOnDeclinedPurchase: "declined-purchase hold",
  dedupMatchPhone: "dedup by phone",
  dedupMatchEmail: "dedup by email",
  dedupSameCoverageOnly: "dedup same product",
};

function liveNumber(s: Settings, key: NumKey): number {
  return key === "disputePenaltyPercent" ? Math.round(s.disputePenaltyThreshold * 100) : s[key];
}

function parseLadder(text: string): number[] | null {
  const parts = text
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const values = parts.map(Number);
  if (values.some((v) => !Number.isInteger(v) || v < 1 || v > 10_080)) return null;
  for (let i = 1; i < values.length; i++) if (values[i] <= values[i - 1]) return null;
  return values;
}

/** Prototype `A.rules`, backed by versioned `distributionSettings`. Each save is a new, audited version. */
export function DistributionSettingsEditor({ data, canManage }: { data: Data; canManage: boolean }) {
  const live = data.settings;
  const updateSettings = useMutation(api.distribution.admin.updateSettings);
  const toast = useToast();
  const [nums, setNums] = useState<Partial<Record<NumKey, string>>>({});
  const [weights, setWeights] = useState<RankingWeights | null>(null);
  const [ladderText, setLadderText] = useState<string | null>(null);
  const [bools, setBools] = useState<Partial<Record<BoolKey, boolean>>>({});
  const [gradingMode, setGradingMode] = useState<"ratio" | "source" | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const disabled = !canManage || saving;

  // Effective values: the draft where the user touched a field, otherwise the live version.
  const numText = (k: NumKey) => nums[k] ?? String(liveNumber(live, k));
  const effWeights = weights ?? live.weights;
  const effLadderText = ladderText ?? live.retryScheduleMinutes.join(", ");
  const effBool = (k: BoolKey) => bools[k] ?? live[k];
  const effGrading = gradingMode ?? live.gradingMode;

  const errors: Partial<Record<NumKey | "ladder", string>> = {};
  const changes: Record<string, unknown> = {};
  const effNum = (k: NumKey) => {
    const n = Number(numText(k));
    return Number.isInteger(n) ? n : liveNumber(live, k);
  };
  for (const key of Object.keys(nums) as NumKey[]) {
    const raw = nums[key];
    if (raw === undefined) continue;
    const n = Number(raw);
    const [min, max] = NUMERIC[key];
    if (raw.trim() === "" || !Number.isInteger(n) || n < min || n > max) {
      errors[key] = `Whole number, ${min}–${max.toLocaleString()}.`;
      continue;
    }
    if (n === liveNumber(live, key)) continue;
    if (key === "disputePenaltyPercent") changes.disputePenaltyThreshold = n / 100;
    else changes[key] = n;
  }
  if (!errors.unassignableAfterMinutes && !errors.adminAlertAfterMinutes && effNum("unassignableAfterMinutes") <= effNum("adminAlertAfterMinutes")) {
    errors.unassignableAfterMinutes = "Must be later than the admin alert.";
  }
  const weightSum = RANKING_COMPONENTS.reduce((s, c) => s + effWeights[c.key], 0);
  if (weights && RANKING_COMPONENTS.some((c) => weights[c.key] !== live.weights[c.key])) changes.weights = weights;
  const ladder = parseLadder(effLadderText);
  if (!ladder) errors.ladder = "Whole minutes (1–10,080), separated by commas, each step later than the last.";
  else if (ladderText !== null && ladder.join(",") !== live.retryScheduleMinutes.join(",")) changes.retryScheduleMinutes = ladder;
  for (const key of BOOLEANS) if (bools[key] !== undefined && bools[key] !== live[key]) changes[key] = bools[key];
  if (gradingMode && gradingMode !== live.gradingMode) changes.gradingMode = gradingMode;

  const changedKeys = Object.keys(changes);
  const hasErrors = Object.keys(errors).length > 0;
  const touched = Object.keys(nums).length > 0 || weights !== null || ladderText !== null || Object.keys(bools).length > 0 || gradingMode !== null;
  const canSave = canManage && changedKeys.length > 0 && !hasErrors && weightSum === 100 && note.trim().length >= 5 && !saving;

  const discard = () => {
    setNums({});
    setWeights(null);
    setLadderText(null);
    setBools({});
    setGradingMode(null);
    setNote("");
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateSettings({ ...changes, note: note.trim() });
      toast.success("New settings version saved", `Changed: ${changedKeys.map((k) => CHANGE_LABELS[k] ?? k).join(", ")}. Applies to the next distribution attempt.`);
      discard();
    } catch (e) {
      toast.error(e, "Settings not saved");
    } finally {
      setSaving(false);
    }
  };

  const numField = (key: NumKey, label: string, help?: string, unit?: string) => (
    <Field label={unit ? `${label} (${unit})` : label} error={errors[key]} help={help}>
      <input
        type="number"
        inputMode="numeric"
        min={NUMERIC[key][0]}
        max={NUMERIC[key][1]}
        value={numText(key)}
        disabled={disabled}
        onChange={(e) => setNums((n) => ({ ...n, [key]: e.target.value }))}
      />
    </Field>
  );

  const adminAlert = effNum("adminAlertAfterMinutes");
  const unassignable = effNum("unassignableAfterMinutes");
  const recipients = effNum("standardRecipientCount");
  const ladderSteps = [
    ...(ladder ?? live.retryScheduleMinutes).map((m, i, all) => ({
      m,
      title: i === 0 ? "First retry" : i === all.length - 1 ? "Final retry" : `Retry ${i + 1}`,
      tone: undefined as "warn" | "bad" | undefined,
    })),
    { m: adminAlert, title: "Admin alert fired", tone: "warn" as const },
    { m: unassignable, title: "Marked unassignable, admin notified", tone: "bad" as const },
  ].sort((a, b) => a.m - b.m);

  return (
    <>
      {!canManage && (
        <div style={{ marginBottom: "1.25rem" }}>
          <Alert kind="n">
            <b>Read-only.</b> Only an administrator can change distribution settings. Every change is saved as a new version with a reason, listed at the
            bottom of this page.
          </Alert>
        </div>
      )}

      <div className="g g2">
        <div className="stack">
          <Card>
            <CardHeader
              title="Ranking weights"
              description={
                <>
                  Rules decide who <i>can</i> receive a lead. These weights order everyone who can.
                </>
              }
              actions={<Badge tone={weightSum === 100 ? "g" : "r"}>{weightSum}%</Badge>}
            />
            <CardBody>
              {RANKING_COMPONENTS.map((c) => (
                <div key={c.key} style={{ marginBottom: "1.1rem" }}>
                  <div className="row-b">
                    <label className="strong" style={{ fontSize: ".88rem" }} htmlFor={`w-${c.key}`}>
                      {c.label}
                    </label>
                    <span className="strong">{effWeights[c.key]}%</span>
                  </div>
                  <input
                    id={`w-${c.key}`}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={effWeights[c.key]}
                    disabled={disabled}
                    onChange={(e) => setWeights({ ...effWeights, [c.key]: Number(e.target.value) })}
                    style={{ width: "100%", accentColor: "var(--gold)", margin: ".4rem 0" }}
                    aria-describedby={`w-${c.key}-help`}
                  />
                  <p className="xs" id={`w-${c.key}-help`}>
                    {c.help}
                  </p>
                </div>
              ))}
              {weightSum !== 100 && (
                <div style={{ marginBottom: ".9rem" }}>
                  <Alert kind="e">
                    The weights add up to <b>{weightSum}</b>. They must total exactly 100 before the settings can be saved.
                  </Alert>
                </div>
              )}
              <hr className="hr" />
              <Alert kind="i">
                <b>Order of release.</b> Accounts that have waited {effNum("starvationGuardHours")} hours or more — or have never had a lead — rank first,
                longest wait first (starvation guard). Everyone else is ordered by this weighted score, ties going to the longest wait. Accounts above the
                dispute-penalty threshold stay eligible but rank last.
              </Alert>
              <div style={{ marginTop: "1rem" }}>
                <FieldGrid>
                  {numField("starvationGuardHours", "Starvation guard", "Waiting this long jumps the score order.", "hours")}
                  {numField("waitNormalizationHours", "Full waiting score after", "A wait this long earns the whole waiting weight.", "hours")}
                  {numField("contactRateWindowDays", "Contact-rate window", "Releases counted for the contact rate.", "days")}
                </FieldGrid>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Dispute penalty" />
            <CardBody>
              <FieldGrid>
                {numField("disputePenaltyPercent", "Upheld-dispute threshold", "Rate of upheld disputes to releases.", "%")}
                {numField("disputePenaltyMinAssignments", "Applies after", "Releases before the rate counts.", "releases")}
              </FieldGrid>
              <DefinitionList
                items={[
                  [`Up to ${effNum("disputePenaltyPercent")}%`, "No adjustment"],
                  [`Over ${effNum("disputePenaltyPercent")}%`, `Still eligible, ranked last — once the account has ${effNum("disputePenaltyMinAssignments")} releases`],
                ]}
              />
              <p className="xs" style={{ marginTop: ".7rem" }}>
                Never auto-blocked. A genuinely bad source produces exactly this signature, and punishing the agent for it would be wrong.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Lead grading" description="How a captured lead becomes exclusive or standard" />
            <CardBody>
              <Field label="Grading mode">
                <Select
                  value={effGrading}
                  disabled={disabled}
                  onChange={(e) => setGradingMode(e.target.value as "ratio" | "source")}
                  options={[
                    { value: "ratio", label: "Ratio — every Nth captured lead is exclusive" },
                    { value: "source", label: "By marketing source — each source's default grade" },
                  ]}
                />
              </Field>
              {effGrading === "ratio" ? (
                numField(
                  "exclusiveEvery",
                  "Exclusive every",
                  `Every ${effNum("exclusiveEvery")}th captured lead is exclusive (${effNum("exclusiveEvery") ? Math.round((10 / effNum("exclusiveEvery")) * 10) / 10 : 0} in every 10).`,
                  "leads",
                )
              ) : (
                <p className="sm" style={{ marginBottom: ".9rem" }}>
                  Each marketing source&rsquo;s default grade is set under Settings → reference data. Sources without one grade leads as standard.
                </p>
              )}
              <p className="xs">Admins can change a lead&rsquo;s grade on the lead page until it is first released.</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Duplicate detection" description="A matching lead inside the window is kept, linked and not distributed" />
            <CardBody>
              {numField("dedupWindowDays", "Window", "0 turns duplicate detection off.", "days")}
              <Checkbox checked={effBool("dedupMatchPhone")} disabled={disabled} onChange={(v) => setBools((b) => ({ ...b, dedupMatchPhone: v }))}>
                Match on phone number
              </Checkbox>
              <Checkbox checked={effBool("dedupMatchEmail")} disabled={disabled} onChange={(v) => setBools((b) => ({ ...b, dedupMatchEmail: v }))}>
                Match on email address
              </Checkbox>
              <Checkbox checked={effBool("dedupSameCoverageOnly")} disabled={disabled} onChange={(v) => setBools((b) => ({ ...b, dedupSameCoverageOnly: v }))}>
                Only when it is for the same product
              </Checkbox>
            </CardBody>
          </Card>
        </div>

        <div className="stack">
          <EngineCard />

          <Card>
            <CardHeader title="Assignment rule" actions={<Badge tone="gold">Exclusive fixed at 1</Badge>} />
            <CardBody>
              <DefinitionList
                items={[
                  ["Exclusive lead", <span key="e"><b>Exactly one agent.</b> Fixed.</span>],
                  ["Standard lead", `Up to ${recipients} agent${recipients === 1 ? "" : "s"}, each debited one standard lead`],
                  ["Order", "Starvation guard, then weighted score; dispute penalty last"],
                  ["Re-release", "Never, unless an admin revokes an assignment"],
                  ["Grade", "Set at capture by the grading policy"],
                ]}
              />
              <div style={{ marginTop: "1rem" }}>
                {numField("standardRecipientCount", "Standard lead recipients", "1–10. Default 3.", "agents")}
              </div>
              <Alert kind="w">
                <b>Consumer copy review (D1).</b> Public FAQ, consent wording and pricing copy that promise a consumer &ldquo;one agent&rdquo; must be reviewed
                by counsel and the client before standard leads are shared with more than one agent.
              </Alert>
              <hr className="hr" />
              {numField("disputeWindowHours", "Dispute window", "Measured from release. Applies to leads released after the change.", "hours")}
              <Switch
                checked={effBool("holdOnDeclinedPurchase")}
                disabled={disabled}
                onChange={(v) => setBools((b) => ({ ...b, holdOnDeclinedPurchase: v }))}
                label="Hold distribution while an agent has a declined purchase outstanding"
              />
              <p className="xs" style={{ marginTop: ".35rem" }}>
                The agent is notified and can retry; there is no dunning and no automatic suspension. The balance is never forfeited.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Retry ladder" description="When nobody is eligible, or a standard lead's slots are not all filled" />
            <CardBody>
              <Field label="Retry steps (minutes after the first attempt)" error={errors.ladder} help="For example 5, 15, 60, 240, 720, 1440.">
                <input value={effLadderText} disabled={disabled} onChange={(e) => setLadderText(e.target.value)} />
              </Field>
              <FieldGrid>
                {numField("adminAlertAfterMinutes", "Admin alert after", undefined, "minutes")}
                {numField("unassignableAfterMinutes", "Unassignable after", undefined, "minutes")}
              </FieldGrid>
              <Timeline items={ladderSteps.map((s, i) => ({ key: `${s.title}-${i}`, tone: s.tone, time: formatMinutesLong(s.m), title: s.title }))} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={`The ${data.rules.length} eligibility rules, in order`} />
            <CardBody>
              <div className="trace" role="list">
                {data.rules.map((r, i) => (
                  <div key={r.key} className="trace-r pass" role="listitem">
                    <span className="n">{i + 1}</span>
                    <span className="st">
                      <Icon name="check" />
                    </span>
                    <span>{r.label}</span>
                    <span style={{ marginLeft: "auto" }}>
                      {r.hard ? <Badge tone="r">Hard</Badge> : <Badge tone="n">Soft</Badge>}
                    </span>
                  </div>
                ))}
              </div>
              <p className="xs" style={{ marginTop: ".7rem" }}>
                Evaluation stops at the first failing rule, which is why a trace ends where it does. <b>Hard</b> rules are legal or financial constraints
                that even a manual assignment cannot bypass; <b>soft</b> rules are the agent&rsquo;s own preferences and holds, which an admin may override
                on a manual assignment (recorded).
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card style={{ marginTop: "1.25rem" }}>
        <CardHeader title="Settings versions" description="Every save — including the engine switch — creates a new version. Assignments keep the version they were made under." />
        <DataTable
          flush
          caption="Settings versions"
          columns={[{ label: "Saved" }, { label: "By" }, { label: "Reason" }, { label: "Weights" }, { label: "Standard recipients", align: "right" }, { label: "Engine" }]}
          isEmpty={data.history.length === 0}
          empty={<p className="sm card-bd">Running on built-in defaults — no version has been saved yet.</p>}
        >
          {data.history.map((h) => (
            <tr key={h.id}>
              <td className="sm nowrap">
                {formatDate(h.createdAt, true)}
                {h.id === data.versionId && (
                  <span className="tsub">
                    <Badge tone="g">Current</Badge>
                  </span>
                )}
              </td>
              <td className="sm">{h.createdByName}</td>
              <td className="sm" style={{ maxWidth: 320 }}>
                {h.note ?? "—"}
              </td>
              <td className="sm mono nowrap">{RANKING_COMPONENTS.map((c) => h.weights[c.key]).join(" / ")}</td>
              <td className="tr sm">{h.standardRecipientCount}</td>
              <td>{h.engineEnabled ? <Badge tone="g">On</Badge> : <Badge tone="r">Off</Badge>}</td>
            </tr>
          ))}
        </DataTable>
      </Card>

      {canManage && touched && (
        <div
          className="card"
          style={{ position: "sticky", bottom: "1rem", zIndex: 30, marginTop: "1.25rem", boxShadow: "var(--sh-xl)", borderLeft: "3px solid var(--gold)" }}
        >
          <div className="card-bd">
            <div className="row-b" style={{ alignItems: "flex-end" }}>
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <p className="sm" style={{ marginBottom: ".5rem" }}>
                  {changedKeys.length ? (
                    <>
                      <b>Unsaved changes:</b> {changedKeys.map((k) => CHANGE_LABELS[k] ?? k).join(", ")}.
                    </>
                  ) : (
                    "No changes from the current version."
                  )}
                  {weightSum !== 100 && <span style={{ color: "var(--red)", fontWeight: 600 }}> Weights total {weightSum} — they must equal 100.</span>}
                  {hasErrors && <span style={{ color: "var(--red)", fontWeight: 600 }}> Fix the highlighted fields.</span>}
                </p>
                <Field label="Reason for change" required help="Recorded on the new version and in the audit log.">
                  <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rebalance toward contact rate after Q3 review" />
                </Field>
              </div>
              <div className="b-row" style={{ marginBottom: "1.4rem" }}>
                <Button variant="out" size="s" onClick={discard} disabled={saving}>
                  Discard
                </Button>
                <Button variant="navy" size="s" onClick={() => void save()} disabled={!canSave} loading={saving}>
                  Save new version
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
