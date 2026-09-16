"use client";

import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export interface TraceRule {
  key: string;
  label: string;
  pass: boolean;
  skipped?: boolean;
  reason?: string;
}

export interface ScorePartView {
  key: string;
  label: string;
  points: number;
  max: number;
}

export interface ScoreView {
  total: number;
  tier: number;
  starved: boolean;
  penalized: boolean;
  parts: ScorePartView[];
  position?: number;
}

/** Prototype `.trace/.trace-r` rows: one line per rule, in evaluation order. */
export function TraceRules({ rules }: { rules: TraceRule[] }) {
  return (
    <div className="trace" role="list">
      {rules.map((t, i) => (
        <div key={`${t.key}-${i}`} role="listitem" className={cn("trace-r", t.skipped ? "skip" : t.pass ? "pass" : "fail")}>
          <span className="n">{i + 1}</span>
          <span className="st">
            <Icon name={t.pass ? "check" : "x"} />
          </span>
          <span>
            {t.label}
            {t.skipped && <span className="xs"> · not applicable</span>}
            <span className="sr-only">{t.skipped ? " skipped" : t.pass ? " passed" : " failed"}</span>
          </span>
          {!t.pass && t.reason && <span className="why">{t.reason}</span>}
        </div>
      ))}
    </div>
  );
}

export function tierLabel(score: Pick<ScoreView, "starved" | "penalized">): string | null {
  if (score.penalized) return "Dispute penalty — ranked last";
  if (score.starved) return "Starvation guard — ranked first";
  return null;
}

/** Weighted score parts as meters (prototype "Why X is next" breakdown). */
export function ScoreParts({ score, compact }: { score: ScoreView; compact?: boolean }) {
  return (
    <div>
      {score.parts.map((p) => (
        <div key={p.key} style={{ marginBottom: compact ? ".45rem" : ".7rem" }}>
          <div className="row-b" style={{ gap: ".5rem" }}>
            <span className={compact ? "xs" : "sm"}>{p.label}</span>
            <span className="strong" style={{ fontSize: compact ? ".8rem" : undefined }}>
              {p.points} <span className="xs">/ {p.max}</span>
            </span>
          </div>
          <Meter percent={p.max ? (p.points / p.max) * 100 : 0} tone="gold" className={compact ? "mt-1" : undefined} />
        </div>
      ))}
    </div>
  );
}

/**
 * One account's evaluation, collapsible. Used by the simulator (every account) and the lead detail
 * distribution-attempt timeline (every account traced in a run).
 */
export function AccountTrace({
  name,
  eligible,
  assigned,
  rules,
  score,
  subtitle,
  open,
  onToggle,
  extra,
}: {
  name: string;
  eligible: boolean;
  assigned?: boolean;
  rules: TraceRule[];
  score?: ScoreView | null;
  subtitle?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  extra?: ReactNode;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = open ?? localOpen;
  const toggle = onToggle ?? (() => setLocalOpen((o) => !o));
  const failIndex = rules.findIndex((r) => !r.pass);
  const failed = failIndex >= 0 ? rules[failIndex] : null;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: "var(--r-s)", overflow: "hidden" }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        className="row-b"
        style={{
          width: "100%",
          padding: ".6rem .8rem",
          background: eligible ? "var(--green-wash)" : "var(--soft)",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
          gap: ".6rem",
          flexWrap: "nowrap",
        }}
      >
        <span className="row" style={{ gap: ".5rem", flexWrap: "nowrap", minWidth: 0 }}>
          <span
            className="av"
            aria-hidden="true"
            style={{ width: 26, height: 26, fontSize: ".68rem", ...(eligible ? {} : { background: "var(--line-2)", color: "var(--gray)" }) }}
          >
            {initials}
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="strong" style={{ display: "block" }}>
              {name}
            </span>
            <span className="tsub" style={{ marginTop: 0 }}>
              {subtitle}
              {!eligible && failed ? `${subtitle ? " · " : ""}${failed.reason ?? failed.label}` : ""}
            </span>
          </span>
        </span>
        <span className="row" style={{ gap: ".4rem", flexWrap: "nowrap", flex: "none" }}>
          {assigned && <Badge tone="gold">Assigned</Badge>}
          {eligible ? <Badge tone="g">Eligible</Badge> : <Badge tone="r">Rule {failIndex + 1}</Badge>}
          <Icon name="arrow" style={{ transform: isOpen ? "rotate(90deg)" : undefined, transition: "transform .2s", color: "var(--gray-2)" }} />
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: ".7rem .8rem", borderTop: "1px solid var(--line)" }} className="stack">
          {eligible && (
            <p className="xs" style={{ margin: 0 }}>
              Passed all {rules.length} rules{score ? ` · score ${score.total}` : ""}
              {score && tierLabel(score) ? ` · ${tierLabel(score)}` : ""}
            </p>
          )}
          <TraceRules rules={rules} />
          {eligible && score && score.parts.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: ".4rem" }}>
                Score parts
              </div>
              <ScoreParts score={score} compact />
            </div>
          )}
          {extra}
        </div>
      )}
    </div>
  );
}
