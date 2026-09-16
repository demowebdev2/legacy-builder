"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert, LoadingBlock } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { formatHoursShort } from "./format";

export interface AssignTarget {
  leadId: Id<"leads">;
  reference: string;
  leadType: string;
  subtitle: string;
}

/**
 * Prototype `assignModal`. Candidates come from the server evaluated against every rule (no
 * short-circuit): eligible accounts in ranking order, soft failures selectable as a recorded override,
 * hard failures (licence, E&O, TPMO, balance, status, already holding) disabled with their reasons.
 */
export function AssignLeadModal({ target, onClose }: { target: AssignTarget | null; onClose: () => void }) {
  if (!target) return null;
  return <AssignDialog target={target} onClose={onClose} />;
}

function AssignDialog({ target, onClose }: { target: AssignTarget; onClose: () => void }) {
  const data = useQuery(api.assignments.manualCandidates, { leadId: target.leadId });
  const settings = useQuery(api.distribution.admin.settings);
  const hardLabels = new Set((settings?.rules ?? []).filter((r) => r.hard).map((r) => r.label));
  const manualAssign = useMutation(api.assignments.manualAssign);
  const toast = useToast();
  const [selected, setSelected] = useState<Id<"accounts"> | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  const candidates = data?.candidates ?? [];
  const eligible = candidates.filter((c) => c.eligible);
  const soft = candidates.filter((c) => !c.eligible && !c.hardFailure);
  const hard = candidates.filter((c) => !c.eligible && c.hardFailure);
  const chosen = candidates.find((c) => c.accountId === selected) ?? null;
  const full = !!data && data.filled >= data.target;
  const type = target.leadType === "exclusive" ? "exclusive" : "standard";

  const submit = async () => {
    if (!chosen) return;
    setPending(true);
    try {
      const result = await manualAssign({ leadId: target.leadId, accountId: chosen.accountId, note: note.trim() || undefined });
      toast.success(
        `Assigned to ${chosen.name}`,
        `One ${type} lead drawn from their balance and the agent notified.${result.overridden.length ? ` Override recorded: ${result.overridden.join(", ")}.` : ""}`,
      );
      onClose();
    } catch (error) {
      toast.error(error, "Could not assign");
      setPending(false);
    }
  };

  const describe = (failures: Array<{ label: string; reason: string }>) =>
    failures.map((f) => (f.reason ? `${f.label} — ${f.reason}` : f.label)).join("; ");

  const option = (c: (typeof candidates)[number], kind: "eligible" | "soft" | "hard") => {
    const disabled = kind === "hard" || full;
    const hardFailures = c.failures.filter((f) => hardLabels.has(f.label));
    const softFailures = c.failures.filter((f) => !hardLabels.has(f.label));
    return (
      <button
        key={c.accountId}
        type="button"
        className={cn("opt", selected === c.accountId && "sel")}
        disabled={disabled}
        aria-pressed={selected === c.accountId}
        onClick={() => setSelected(c.accountId)}
        style={{ width: "100%", textAlign: "left" }}
      >
        <span className="opt-ic" style={{ display: "grid" }}>
          {kind === "eligible" ? (c.position ?? "·") : kind === "soft" ? <Icon name="warn" /> : <Icon name="x" />}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ color: "var(--ink)" }}>
            {c.name}{" "}
            {kind === "eligible" && c.position === 1 && <Badge tone="g" className="inline-flex align-middle">Next in line</Badge>}
            {kind === "soft" && <Badge tone="a" className="inline-flex align-middle">Override</Badge>}
          </b>
          {kind === "eligible" && (
            <span>
              {c.waitedHours == null ? "never had a lead" : `waited ${formatHoursShort(c.waitedHours)}`} · {c.balanceOfType} {type} leads left
              {c.score != null ? ` · score ${c.score}` : ""}
            </span>
          )}
          {kind === "soft" && (
            <span>
              Would override: {describe(c.failures)} · {c.balanceOfType} {type} leads left
            </span>
          )}
          {kind === "hard" && (
            <span>
              Blocked: {describe(hardFailures.length ? hardFailures : c.failures)}
              {hardFailures.length > 0 && softFailures.length > 0 && <> · also outside preferences: {softFailures.map((f) => f.label.toLowerCase()).join(", ")}</>}
            </span>
          )}
        </span>
      </button>
    );
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Assign manually"
      subtitle={`Lead ${target.reference} · ${target.subtitle}`}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant={chosen && !chosen.eligible ? "red" : "navy"} size="s" disabled={!chosen || full} loading={pending} onClick={() => void submit()}>
            {chosen ? `${chosen.eligible ? "Assign to" : "Override and assign to"} ${chosen.name}` : "Choose an agent"}
          </Button>
        </>
      }
    >
      <Alert kind="w">
        <b>Manual assignment still draws a lead from the agent&rsquo;s balance and still enforces every hard rule</b> — active account, verified licence in
        the lead state, E&amp;O cover, Medicare TPMO approval, balance and not already holding the lead. Those are never bent, not even here. Soft rules
        (the agent&rsquo;s own preferences, pace, receiving hours and holds) can be overridden; the override is recorded on the distribution attempt.
      </Alert>

      {data === undefined ? (
        <div style={{ marginTop: "1rem" }}>
          <LoadingBlock rows={4} label="Evaluating accounts" />
        </div>
      ) : data === null ? (
        <div style={{ marginTop: "1rem" }}>
          <Alert kind="e">This lead no longer exists.</Alert>
        </div>
      ) : (
        <>
          <p className="sm" style={{ margin: "1rem 0 .6rem" }}>
            {data.filled} of {data.target} recipient slot{data.target === 1 ? "" : "s"} filled · {eligible.length} eligible · {soft.length} need an override ·{" "}
            {hard.length} blocked
          </p>
          {full && (
            <div style={{ marginBottom: ".8rem" }}>
              <Alert kind="e">
                <b>Every recipient slot is already filled.</b> Revoke an existing assignment first — the row is kept and the slot opens again.
              </Alert>
            </div>
          )}
          {chosen && !chosen.eligible && (
            <div style={{ marginBottom: ".8rem" }}>
              <Alert kind="e">
                <b>You are overriding {chosen.failures.length === 1 ? "a soft rule" : `${chosen.failures.length} soft rules`}</b> for {chosen.name}:{" "}
                {chosen.failures.map((f) => f.label.toLowerCase()).join(", ")}. The agent set these for a reason — record why below.
              </Alert>
            </div>
          )}
          <Field label="Note (recorded on the distribution attempt)" help={chosen && !chosen.eligible ? "Strongly recommended for an override." : undefined}>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Consumer asked for this agent by name" />
          </Field>
          {candidates.length === 0 && <Alert kind="n">There are no approved accounts to evaluate.</Alert>}
          {eligible.length > 0 && (
            <>
              <div className="eyebrow" style={{ margin: ".4rem 0 .5rem" }}>
                Eligible — in ranking order
              </div>
              <div className="stack" style={{ gap: ".5rem" }}>
                {eligible.map((c) => option(c, "eligible"))}
              </div>
            </>
          )}
          {soft.length > 0 && (
            <>
              <div className="eyebrow" style={{ margin: "1rem 0 .5rem" }}>
                Selectable with an override
              </div>
              <div className="stack" style={{ gap: ".5rem" }}>
                {soft.map((c) => option(c, "soft"))}
              </div>
            </>
          )}
          {hard.length > 0 && (
            <>
              <div className="eyebrow" style={{ margin: "1rem 0 .5rem" }}>
                Blocked by a hard rule — cannot be chosen
              </div>
              <div className="stack" style={{ gap: ".5rem" }}>
                {hard.map((c) => option(c, "hard"))}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
