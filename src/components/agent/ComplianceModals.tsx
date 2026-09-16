"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Checkbox, Field, FieldGrid } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { errorMessage } from "@/lib/errors";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** yyyy-mm-dd (local) → end of that day, so a licence "expiring 31 Dec" is valid all of that day. */
export function endOfDay(date: string) {
  return new Date(`${date}T23:59:59`).getTime();
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function LicenseModal({
  open,
  onClose,
  states,
  initialState,
  producer,
}: {
  open: boolean;
  onClose: () => void;
  states: Array<{ code: string; name: string }>;
  initialState?: string;
  producer: boolean;
}) {
  const submit = useMutation(api.licenses.submit);
  const toast = useToast();
  const [state, setState] = useState(initialState ?? "");
  const [number, setNumber] = useState("");
  const [expires, setExpires] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    state: state ? null : "Choose the state.",
    number: number.trim().length >= 3 ? null : "Enter the licence number.",
    expires: !expires ? "Enter the expiry date." : expires < todayIso() ? "That licence has already expired." : null,
  };
  const valid = !errors.state && !errors.number && !errors.expires;

  const onSubmit = async () => {
    setTouched(true);
    if (!valid) return;
    setPending(true);
    setError(null);
    try {
      await submit({ state, licenseNumber: number.trim(), expiresAt: endOfDay(expires) });
      toast.success("Licence submitted", "Our licensing team reviews it before the state unlocks.");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialState ? "Renew a licence" : "Add or renew a licence"}
      subtitle={producer ? "Added to your own producer seat." : "Each state is reviewed by our licensing team before it can receive leads."}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="navy" size="s" loading={pending} onClick={() => void onSubmit()}>
            Submit for review
          </Button>
        </>
      }
    >
      {error && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="e">{error}</Alert>
        </div>
      )}
      <Field label="State" required error={touched ? errors.state : null}>
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Select…</option>
          {states.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <FieldGrid>
        <Field label="Licence number" required error={touched ? errors.number : null}>
          <input value={number} maxLength={40} autoComplete="off" onChange={(e) => setNumber(e.target.value)} />
        </Field>
        <Field label="Expires" required error={touched ? errors.expires : null}>
          <input type="date" value={expires} min={todayIso()} onChange={(e) => setExpires(e.target.value)} />
        </Field>
      </FieldGrid>
      <Alert kind="i">
        A renewal replaces the current record once it is verified. Until then the existing licence keeps working if it has not expired.
      </Alert>
    </Modal>
  );
}

export function EoRenewalModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const generateUploadUrl = useMutation(api.eoPolicies.generateUploadUrl);
  const submit = useMutation(api.eoPolicies.submit);
  const toast = useToast();
  const [carrier, setCarrier] = useState("");
  const [policy, setPolicy] = useState("");
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errors = {
    carrier: carrier.trim().length >= 2 ? null : "Enter the E&O carrier.",
    expires: !expires ? "Enter the expiry date." : expires < todayIso() ? "That policy has already expired." : null,
    file: file && file.size > MAX_UPLOAD_BYTES ? "The document must be 10 MB or smaller." : null,
  };
  const valid = !errors.carrier && !errors.expires && !errors.file;

  const onSubmit = async () => {
    setTouched(true);
    if (!valid) return;
    setPending(true);
    setError(null);
    try {
      let documentStorageId: Id<"_storage"> | undefined;
      if (file) {
        const url = await generateUploadUrl();
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!res.ok) throw new Error("The document could not be uploaded. Please try again.");
        documentStorageId = ((await res.json()) as { storageId: Id<"_storage"> }).storageId;
      }
      await submit({ carrier: carrier.trim(), policyNumber: policy.trim() || undefined, expiresAt: endOfDay(expires), documentStorageId });
      toast.success("E&O renewal submitted", "Our team reviews it and updates your cover on file.");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload E&O renewal"
      subtitle="Lead flow halts across all states the day E&O cover lapses."
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="navy" size="s" loading={pending} onClick={() => void onSubmit()}>
            Submit for review
          </Button>
        </>
      }
    >
      {error && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="e">{error}</Alert>
        </div>
      )}
      <FieldGrid>
        <Field label="Carrier" required error={touched ? errors.carrier : null}>
          <input value={carrier} maxLength={120} onChange={(e) => setCarrier(e.target.value)} />
        </Field>
        <Field label="Policy number">
          <input value={policy} maxLength={60} onChange={(e) => setPolicy(e.target.value)} />
        </Field>
        <Field label="Expires" required error={touched ? errors.expires : null} full>
          <input type="date" value={expires} min={todayIso()} onChange={(e) => setExpires(e.target.value)} />
        </Field>
        <Field label="Declarations page" help="PDF or image, up to 10 MB. Optional, but it speeds up the review." error={errors.file} full>
          <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      </FieldGrid>
    </Modal>
  );
}

export function TpmoRequestModal({
  open,
  onClose,
  addendum,
}: {
  open: boolean;
  onClose: () => void;
  addendum: { title: string; version: number | string; content: string } | null;
}) {
  const request = useMutation(api.tpmo.request);
  const toast = useToast();
  const [attested, setAttested] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setPending(true);
    setError(null);
    try {
      await request({ attested });
      toast.success("TPMO request sent", "Our compliance team reviews it. Medicare leads start once it is approved.");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Request Medicare TPMO approval"
      subtitle={addendum ? `${addendum.title} — version ${addendum.version}` : "Medicare Third-Party Marketing Organization addendum"}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="navy" size="s" loading={pending} disabled={!attested} onClick={() => void onSubmit()}>
            Send request
          </Button>
        </>
      }
    >
      {error && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="e">{error}</Alert>
        </div>
      )}
      {addendum ? (
        <div
          style={{
            background: "var(--soft)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-s)",
            padding: "1rem",
            fontSize: ".88rem",
            lineHeight: 1.75,
            maxHeight: 320,
            overflowY: "auto",
            whiteSpace: "pre-line",
          }}
          tabIndex={0}
        >
          {addendum.content}
        </div>
      ) : (
        <Alert kind="w">The addendum text is not published yet. Your request is still recorded and reviewed.</Alert>
      )}
      <div style={{ marginTop: ".8rem" }}>
        <Checkbox checked={attested} onChange={setAttested}>
          <b>I have read the Medicare TPMO addendum</b> and confirm I will follow CMS marketing rules, including the scope-of-appointment and recording
          requirements, for every Medicare lead released to me.
        </Checkbox>
      </div>
    </Modal>
  );
}
