"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { DefinitionList } from "@/components/ui/Display";
import { Alert, LoadingBlock } from "@/components/ui/Feedback";
import { Field, FieldGrid, Select } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/domain/format";
import { errorMessage } from "@/lib/errors";
import { LEAD_SOURCE_LABELS, prettyJson } from "./format";

// ─────────────────────────── suppress / withdraw consent ───────────────────────────

export function SuppressLeadModal({
  open,
  onClose,
  leadId,
  reference,
  holders,
}: {
  open: boolean;
  onClose: () => void;
  leadId: Id<"leads">;
  reference: string;
  holders: number;
}) {
  if (!open) return null;
  return <SuppressDialog onClose={onClose} leadId={leadId} reference={reference} holders={holders} />;
}

function SuppressDialog({ onClose, leadId, reference, holders }: { onClose: () => void; leadId: Id<"leads">; reference: string; holders: number }) {
  const suppressLead = useMutation(api.leads.suppressLead);
  const toast = useToast();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (note.trim().length < 5) {
      setError("Record why consent is being withdrawn (at least 5 characters).");
      return;
    }
    setPending(true);
    try {
      const result = await suppressLead({ leadId, note: note.trim() });
      toast.warn(
        result.alreadyWithdrawn ? "Contact suppressed" : "Consent withdrawn",
        result.alreadyWithdrawn
          ? "Consent was already withdrawn; the phone and email are on the suppression register."
          : `Phone and email added to the suppression register. ${result.notices} cease-contact notice${result.notices === 1 ? "" : "s"} sent.`,
      );
      onClose();
    } catch (e) {
      toast.error(e, "Could not suppress");
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Suppress and withdraw consent"
      subtitle={`Lead ${reference}`}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="red" size="s" onClick={() => void submit()} loading={pending}>
            Withdraw consent
          </Button>
        </>
      }
    >
      <Alert kind="e">
        <b>This cannot be quietly undone.</b> The consumer&rsquo;s phone and email go on the suppression register, the lead is marked withdrawn and is
        never released again, and {holders ? `the ${holders} current holder${holders === 1 ? "" : "s"} are` : "any current holder is"} told to cease all
        contact immediately. Nothing is deleted.
      </Alert>
      <div style={{ marginTop: "1rem" }}>
        <Field label="Note" required error={error} help="Where the request came from — e.g. consumer called support on 16 Sep asking for no further contact.">
          <textarea
            value={note}
            maxLength={1000}
            onChange={(e) => {
              setNote(e.target.value);
              if (error) setError(null);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ─────────────────────────── edit lead ───────────────────────────

export interface EditableLead {
  id: Id<"leads">;
  reference: string;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  zip: string;
  bestTimeToCall: string | null;
  leadType: "exclusive" | "standard";
  assignedCount: number;
}

export function EditLeadModal({ lead, onClose, callTimes }: { lead: EditableLead | null; onClose: () => void; callTimes: string[] }) {
  if (!lead) return null;
  return <EditDialog lead={lead} onClose={onClose} callTimes={callTimes} />;
}

function EditDialog({ lead, onClose, callTimes }: { lead: EditableLead; onClose: () => void; callTimes: string[] }) {
  const updateDetails = useMutation(api.leads.updateDetails);
  const toast = useToast();
  const [form, setForm] = useState({
    firstName: lead.firstName ?? "",
    lastName: lead.lastName ?? "",
    city: lead.city ?? "",
    zip: lead.zip,
    bestTimeToCall: lead.bestTimeToCall ?? "",
    leadType: lead.leadType,
  });
  const [pending, setPending] = useState(false);
  const released = lead.assignedCount > 0;
  const namesEditable = lead.firstName !== null && lead.lastName !== null;

  const submit = async () => {
    const changes: {
      firstName?: string;
      lastName?: string;
      city?: string;
      zip?: string;
      bestTimeToCall?: string;
      leadType?: "exclusive" | "standard";
    } = {};
    if (namesEditable && form.firstName.trim() !== lead.firstName) changes.firstName = form.firstName.trim();
    if (namesEditable && form.lastName.trim() !== lead.lastName) changes.lastName = form.lastName.trim();
    if (form.city.trim() !== (lead.city ?? "")) changes.city = form.city.trim();
    if (form.zip.trim() !== lead.zip) changes.zip = form.zip.trim();
    if (form.bestTimeToCall !== (lead.bestTimeToCall ?? "")) changes.bestTimeToCall = form.bestTimeToCall;
    if (!released && form.leadType !== lead.leadType) changes.leadType = form.leadType;
    if (!Object.keys(changes).length) {
      onClose();
      return;
    }
    setPending(true);
    try {
      await updateDetails({ leadId: lead.id, ...changes });
      toast.success("Lead updated", `Changed: ${Object.keys(changes).join(", ")}. The edit is in the audit log.`);
      onClose();
    } catch (e) {
      toast.error(e, "Could not update the lead");
      setPending(false);
    }
  };

  const options = callTimes.includes(form.bestTimeToCall) || !form.bestTimeToCall ? callTimes : [form.bestTimeToCall, ...callTimes];

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit lead"
      subtitle={`Lead ${lead.reference} · every change is audited`}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="navy" size="s" onClick={() => void submit()} loading={pending}>
            Save changes
          </Button>
        </>
      }
    >
      <Alert kind="n">
        Contact details and consent are evidence and cannot be edited. The consumer&rsquo;s reason is kept exactly as captured.
      </Alert>
      <div style={{ marginTop: "1rem" }}>
        <FieldGrid>
          <Field label="First name" help={namesEditable ? undefined : "Hidden for your role."}>
            <input value={form.firstName} disabled={!namesEditable} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
          </Field>
          <Field label="Last name">
            <input value={form.lastName} disabled={!namesEditable} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
          </Field>
          <Field label="City">
            <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </Field>
          <Field label="ZIP">
            <input inputMode="numeric" maxLength={5} value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value.replace(/\D/g, "") }))} />
          </Field>
          <Field label="Best time to call">
            <Select value={form.bestTimeToCall} placeholder="Not given" options={options} onChange={(e) => setForm((f) => ({ ...f, bestTimeToCall: e.target.value }))} />
          </Field>
          <Field
            label="Lead grade"
            help={released ? "Locked — the lead has been released and balances were debited at this grade." : "Can change only before the first release."}
          >
            <Select
              value={form.leadType}
              disabled={released}
              onChange={(e) => setForm((f) => ({ ...f, leadType: e.target.value as "exclusive" | "standard" }))}
              options={[
                { value: "standard", label: "Standard" },
                { value: "exclusive", label: "Exclusive" },
              ]}
            />
          </Field>
        </FieldGrid>
      </div>
    </Modal>
  );
}

// ─────────────────────────── raw payload ───────────────────────────

type RawPayload = { source: string; receivedAt: number; payload: string; contentHash: string; signatureVerified: boolean };

export function RawPayloadModal({ open, onClose, leadId, reference }: { open: boolean; onClose: () => void; leadId: Id<"leads">; reference: string }) {
  if (!open) return null;
  return <RawPayloadDialog onClose={onClose} leadId={leadId} reference={reference} />;
}

function RawPayloadDialog({ onClose, leadId, reference }: { onClose: () => void; leadId: Id<"leads">; reference: string }) {
  const reveal = useMutation(api.leads.revealRawPayload);
  const [payload, setPayload] = useState<RawPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    // One audited read per opening (guards against the development double-invoke of effects).
    if (requested.current) return;
    requested.current = true;
    reveal({ leadId })
      .then(setPayload)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [leadId, reveal]);

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Raw payload"
      subtitle={`Lead ${reference} · exactly as received, stored write-once · this view is audited`}
      footer={
        <Button variant="navy" size="s" onClick={onClose}>
          Close
        </Button>
      }
    >
      {error ? (
        <Alert kind="e">{error}</Alert>
      ) : !payload ? (
        <LoadingBlock rows={5} label="Loading raw payload" />
      ) : (
        <>
          <DefinitionList
            items={[
              ["Source", LEAD_SOURCE_LABELS[payload.source] ?? payload.source],
              ["Received", formatDate(payload.receivedAt, true)],
              ["Signature", payload.signatureVerified ? "Verified" : "Not signed / not verified"],
              ["Content hash", <span key="h" className="mono xs" style={{ wordBreak: "break-all" }}>{payload.contentHash}</span>],
            ]}
          />
          <pre
            className="mono"
            style={{
              marginTop: "1rem",
              background: "var(--soft)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-s)",
              padding: "1rem",
              fontSize: ".78rem",
              lineHeight: 1.6,
              overflowX: "auto",
              whiteSpace: "pre",
              maxHeight: "50vh",
            }}
          >
            {prettyJson(payload.payload)}
          </pre>
        </>
      )}
    </Modal>
  );
}
