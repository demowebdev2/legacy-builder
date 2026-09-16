"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DefinitionList, type TimelineItem, Timeline } from "@/components/ui/Display";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { Chips, Field } from "@/components/ui/Form";
import { useToast } from "@/components/ui/Toast";
import { ASSIGNMENT_STATUSES, DISPUTE_REASONS, type AssignmentStatus } from "@/domain/constants";
import { formatDate, timeAgo } from "@/domain/format";
import { statusBadge } from "@/domain/status";
import { useAction } from "@/hooks/useAction";
import { DisputeModal } from "./DisputeModal";

export type LeadDetail = Extract<FunctionReturnType<typeof api.leads.myLead>, { forbidden: false }>;

const HOUR = 3_600_000;

/** Right column: "Update status" chips + note (prototype V.lead). */
export function LeadWorkCard({ data, readOnly }: { data: LeadDetail; readOnly: boolean }) {
  const updateStatus = useMutation(api.assignments.updateStatus);
  const addNote = useMutation(api.assignments.addNote);
  const toast = useToast();
  const [note, setNote] = useState("");
  const id = data.assignment.id;

  const [setStatus, statusPending] = useAction((status: AssignmentStatus) => updateStatus({ assignmentId: id, status }), {
    success: "Status updated",
  });
  const [saveNote, notePending] = useAction(async () => {
    await addNote({ assignmentId: id, note });
    setNote("");
  }, { success: "Note saved", successBody: "Written to the lead status history." });

  return (
    <Card>
      <CardHeader title="Update status" />
      <CardBody>
        {readOnly ? (
          <Alert kind="w">Your account is read-only, so status changes are disabled. Existing leads stay visible.</Alert>
        ) : (
          <>
            <Chips
              options={ASSIGNMENT_STATUSES.map((s) => ({ value: s, label: statusBadge(s)[1] }))}
              selected={[data.assignment.status]}
              disabled={statusPending}
              onToggle={(value) => {
                if (value !== data.assignment.status) void setStatus(value as AssignmentStatus);
              }}
            />
            <Field label="Add a note" className="mt-4">
              <textarea placeholder="What happened on the call?" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button
              variant="out"
              size="s"
              full
              loading={notePending}
              onClick={() => {
                if (!note.trim()) toast.warn("Nothing to save", "Type a note first.");
                else void saveNote();
              }}
            >
              Save note
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** Agency principal: hand a pooled lead to a verified producer licensed in the lead's state. */
export function HandoutCard({ data, readOnly, state }: { data: LeadDetail; readOnly: boolean; state: string }) {
  const team = useQuery(api.agencyMembers.team);
  const handOut = useMutation(api.assignments.handOut);
  const current = data.assignment.producerMemberId ?? "";
  const [choice, setChoice] = useState<string>(current);
  const [run, pending] = useAction(
    (memberId: string) => handOut({ assignmentId: data.assignment.id, memberId: memberId ? (memberId as Id<"agencyMembers">) : undefined }),
    { success: "Handout updated" },
  );
  const ceased = !!data.assignment.ceaseContactAt;
  const seats = (team?.members ?? []).filter((m) => m.seatRole !== "billing_contact" && m.status === "active");

  return (
    <Card>
      <CardHeader title="Agency handout" actions={current ? <Badge tone="g" dot>Handed out</Badge> : <Badge tone="gold">In pool</Badge>} />
      <CardBody>
        <p className="sm" style={{ marginBottom: ".9rem" }}>
          {data.assignment.producerName ? (
            <>
              Currently with <b>{data.assignment.producerName}</b>. Only they and you can see it.
            </>
          ) : (
            "This lead sits in the agency pool. Hand it to a verified producer who holds a licence in the consumer's state."
          )}
        </p>
        {readOnly ? (
          <Alert kind="w">Handouts are disabled while your account is read-only.</Alert>
        ) : ceased ? (
          <Alert kind="n">The consumer withdrew consent, so this lead cannot be handed out.</Alert>
        ) : team === undefined ? (
          <Skeleton height={40} />
        ) : (
          <>
            <Field label="Producer" help={`Only verified seats with a usable ${state} licence can take this lead.`}>
              <select value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">Agency pool — not handed out</option>
                {seats.map((m) => {
                  const unverified = m.verificationStatus !== "verified";
                  const unlicensed = !m.licensedStates.includes(state);
                  const why = unverified ? " — not verified yet" : unlicensed ? ` — no verified ${state} licence` : "";
                  return (
                    <option key={m._id} value={m._id} disabled={unverified || unlicensed}>
                      {m.name}
                      {m.seatRole === "principal" ? " (principal)" : ""}
                      {why}
                    </option>
                  );
                })}
              </select>
            </Field>
            <Button variant="navy" size="s" full loading={pending} disabled={choice === current} onClick={() => void run(choice)}>
              {!choice && current ? "Return to the pool" : "Hand out lead"}
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** Dispute window countdown / decision (prototype V.lead dispute card) + the raise-dispute modal. */
export function DisputeCard({ data, readOnly, consumerName }: { data: LeadDetail; readOnly: boolean; consumerName: string }) {
  const [open, setOpen] = useState(false);
  const { assignment, dispute, now } = data;
  const deadline = assignment.disputeDeadlineAt;
  const windowHours = Math.round((deadline - assignment.assignedAt) / HOUR);
  const remaining = deadline - now;
  const canDispute = !dispute && remaining > 0;
  const left = remaining >= HOUR ? `${Math.round(remaining / HOUR)}h left` : `${Math.max(1, Math.round(remaining / 60_000))}m left`;
  const reasonLabel = dispute ? (DISPUTE_REASONS.find((r) => r.key === dispute.reason)?.label ?? dispute.reason) : "";

  return (
    <Card>
      <CardHeader
        title="Dispute"
        actions={
          dispute ? (
            <StatusBadge status={dispute.status} />
          ) : canDispute ? (
            <Badge tone="b" dot>
              {left}
            </Badge>
          ) : (
            <Badge tone="n">Window closed</Badge>
          )
        }
      />
      <CardBody>
        {dispute ? (
          <>
            <DefinitionList
              items={[
                ["Reason", reasonLabel],
                ["Raised", formatDate(dispute.submittedAt, true)],
                dispute.decidedAt ? ["Decided", `${formatDate(dispute.decidedAt, true)} by ${dispute.decidedByName ?? "Legacy Builders"}`] : null,
              ]}
            />
            {dispute.decisionNotes && (
              <p className="sm" style={{ marginTop: ".8rem" }}>
                {dispute.decisionNotes}
              </p>
            )}
            {dispute.returnLedgerEntryId && (
              <div style={{ marginTop: ".9rem" }}>
                <Alert kind="s">One {dispute.leadType} lead has been returned to your balance.</Alert>
              </div>
            )}
            {dispute.status === "pending" && (
              <div style={{ marginTop: ".9rem" }}>
                <Alert kind="i">Under review. Decisions are made within two business days.</Alert>
              </div>
            )}
            <p className="xs" style={{ marginTop: ".8rem" }}>
              <Link className="link" href={`/agent/disputes/${dispute._id}`}>
                View the dispute →
              </Link>
            </p>
          </>
        ) : canDispute ? (
          <>
            <p className="sm" style={{ marginBottom: ".9rem" }}>
              If this lead was not workable, raise it within {windowHours} hours of release and it goes straight back into your balance if upheld.
            </p>
            {readOnly ? (
              <Alert kind="w">Disputes cannot be raised while your account is read-only.</Alert>
            ) : (
              <Button variant="out" size="s" full onClick={() => setOpen(true)}>
                Raise a dispute
              </Button>
            )}
          </>
        ) : (
          <p className="sm">
            The {windowHours}-hour window closed {timeAgo(deadline, now)}.{" "}
            <Link className="link" href="/agent/support">
              Contact support
            </Link>{" "}
            if there is something exceptional here.
          </p>
        )}
      </CardBody>
      {canDispute && !readOnly && (
        <DisputeModal
          open={open}
          onClose={() => setOpen(false)}
          assignmentId={assignment.id}
          reference={data.lead.reference}
          consumerName={consumerName}
          assignedAt={assignment.assignedAt}
          leadType={assignment.leadType}
          now={now}
        />
      )}
    </Card>
  );
}

export function BalanceDrawCard({ data, producer }: { data: LeadDetail; producer: boolean }) {
  const type = data.assignment.leadType === "exclusive" ? "Exclusive" : "Standard";
  return (
    <Card>
      <CardHeader title="Drawn from your balance" />
      <CardBody>
        <DefinitionList
          items={[
            ["Type", type],
            ["Amount", "1 lead"],
            ["Drawn at", formatDate(data.assignment.assignedAt, true)],
            [producer ? "Agency balance" : "Balance now", `${data.balanceOfType} ${type.toLowerCase()} remaining`],
          ]}
        />
        <p className="xs" style={{ marginTop: ".7rem" }}>
          A lead is drawn down at release, never before. Working the lead costs nothing further, and nothing in your balance expires.
        </p>
      </CardBody>
    </Card>
  );
}

const EVENT_TITLES: Record<string, string> = {
  released: "Released to you",
  opened: "Opened",
  note: "Note added",
  handout: "Agency handout",
  revoked: "Assignment revoked",
  cease_contact: "Consent withdrawn — cease contact",
  dispute: "Dispute raised",
};

export function LeadHistoryCard({ data }: { data: LeadDetail }) {
  const items: TimelineItem[] = data.events.map((e, i) => ({
    key: `${e.at}-${i}`,
    tone: e.kind === "cease_contact" || e.kind === "revoked" ? "bad" : e.kind === "dispute" ? "warn" : i === 0 ? "now" : "ok",
    time: `${formatDate(e.at, true)} · ${e.actorName}`,
    title: e.kind === "status" && e.status ? statusBadge(e.status)[1] : (EVENT_TITLES[e.kind] ?? e.kind),
    body: e.note ?? undefined,
  }));
  items.push({
    key: "captured",
    tone: "ok",
    time: formatDate(data.lead.capturedAt, true),
    title: "Consumer submitted the enquiry",
    body: "Consent captured at the same moment",
  });
  return (
    <Card>
      <CardHeader title="Status history" />
      <CardBody>
        <Timeline items={items} />
      </CardBody>
    </Card>
  );
}
