"use client";

import { useQuery } from "convex/react";
import { Component, type ReactNode, useState } from "react";
import { api } from "@convex/_generated/api";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Alert, ErrorState } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_COVERAGE_TYPES, DEFAULT_STATES } from "@/domain/referenceDefaults";
import { type Permission, roleHasPermission } from "@/domain/permissions";
import { errorMessage } from "@/lib/errors";

/** The signed-in staff member and a permission check used only to hide controls (the server enforces). */
export function useStaffAccess() {
  const me = useQuery(api.users.me);
  const staff = me?.kind === "staff" ? me : null;
  const role = staff?.role ?? null;
  return {
    me: staff,
    role,
    loading: me === undefined,
    can: (permission: Permission) => roleHasPermission(role, permission),
  };
}

/** State and coverage names from reference data, falling back to the seeded defaults while loading. */
export function useReferenceNames() {
  const data = useQuery(api.referenceData.publicData);
  const states = new Map<string, string>(DEFAULT_STATES.map((s) => [s.code, s.name]));
  const coverage = new Map<string, string>(DEFAULT_COVERAGE_TYPES.map((c) => [c.key, c.name]));
  for (const s of data?.states ?? []) states.set(s.code, s.name);
  for (const c of data?.coverageTypes ?? []) coverage.set(c.key, c.name);
  return {
    stateName: (code: string) => states.get(code) ?? code,
    coverageName: (key: string) => coverage.get(key) ?? key,
  };
}

/**
 * Submit helper for modals: pending state, inline error text (kept inside the dialog so the operator
 * can correct and retry) and a success toast.
 */
export function useModalSubmit<T>(
  fn: () => Promise<T>,
  options: { success?: string | ((result: T) => string); successBody?: string | ((result: T) => string | undefined); onDone?: (result: T) => void } = {},
) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (options.success) {
        const title = typeof options.success === "function" ? options.success(result) : options.success;
        const body = typeof options.successBody === "function" ? options.successBody(result) : options.successBody;
        toast.success(title, body);
      }
      options.onDone?.(result);
      return result;
    } catch (e) {
      setError(errorMessage(e));
      return undefined;
    } finally {
      setPending(false);
    }
  };
  return { submit, pending, error, setError };
}

export function ModalButtons({
  onCancel,
  onConfirm,
  label,
  variant = "navy",
  pending,
  disabled,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  label: string;
  variant?: ButtonVariant;
  pending?: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      <Button variant="out" size="s" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button variant={variant} size="s" onClick={onConfirm} loading={pending} disabled={disabled}>
        {label}
      </Button>
    </>
  );
}

/** Inline failure message shown at the bottom of a dialog body. */
export function ModalError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div style={{ marginTop: "1rem" }}>
      <Alert kind="e">{error}</Alert>
    </div>
  );
}

/**
 * Generic "decision with written notes" dialog (licence / E&O / seat verification, TPMO decisions,
 * quality hold, restore…). `minLength` 0 makes the notes optional.
 */
export function NotesModal({
  title,
  subtitle,
  intro,
  label,
  placeholder,
  help,
  minLength = 0,
  confirmLabel,
  variant = "navy",
  multiline = true,
  success,
  onSubmit,
  onClose,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  intro?: ReactNode;
  label: string;
  placeholder?: string;
  help?: ReactNode;
  minLength?: number;
  confirmLabel: string;
  variant?: ButtonVariant;
  multiline?: boolean;
  success: string;
  onSubmit: (notes: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { submit, pending, error } = useModalSubmit(() => onSubmit(notes.trim()), { success, onDone: onClose });
  const confirm = () => {
    if (notes.trim().length < minLength) {
      setFieldError(minLength <= 1 ? "This is required." : `Write at least ${minLength} characters.`);
      return;
    }
    setFieldError(null);
    void submit();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={<ModalButtons onCancel={onClose} onConfirm={confirm} label={confirmLabel} variant={variant} pending={pending} />}
    >
      {intro && <div style={{ marginBottom: "1rem" }}>{intro}</div>}
      <Field label={label} required={minLength > 0} error={fieldError} help={help}>
        {multiline ? (
          <textarea value={notes} placeholder={placeholder} maxLength={2000} onChange={(e) => { setNotes(e.target.value); setFieldError(null); }} />
        ) : (
          <input value={notes} placeholder={placeholder} maxLength={300} onChange={(e) => { setNotes(e.target.value); setFieldError(null); }} />
        )}
      </Field>
      <ModalError error={error} />
    </Modal>
  );
}

/** Keeps a failing tab (e.g. a permission change mid-session) from taking down the whole account page. */
export class SectionBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key?: string }> {
  override state: { error: Error | null; key?: string } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: Error | null; key?: string }) {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey };
    return null;
  }

  override render() {
    if (this.state.error) {
      return (
        <ErrorState
          title="This section could not be loaded."
          message={errorMessage(this.state.error)}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

/** Cents from a dollars text field ("12.50" → 1250). Returns null when the text is not a valid amount. */
export function parseDollars(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}
