"use client";

import {
  cloneElement,
  type InputHTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Prototype `.f` field: label (with red * when required), control, help text and an accessible error
 * message linked through aria-describedby.
 */
export function Field({
  label,
  required,
  help,
  error,
  children,
  className,
  full,
}: {
  label: ReactNode;
  required?: boolean;
  help?: ReactNode;
  error?: string | null;
  children: ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string; required?: boolean }>;
  className?: string;
  full?: boolean;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, required })
    : children;
  return (
    <div className={cn("f", error && "err", full && "f-full", className)}>
      <label htmlFor={id}>
        {label} {required && <i aria-hidden="true">*</i>}
      </label>
      {control}
      {help && <small id={helpId}>{help}</small>}
      <div className="msg" id={errorId} role={error ? "alert" : undefined}>
        {error}
      </div>
    </div>
  );
}

/** A labelled group (chips, radio cards) that is not a single form control. */
export function FieldGroup({ label, required, help, error, children, className }: { label: ReactNode; required?: boolean; help?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn("f", error && "err", className)} role="group" aria-labelledby={`${id}-label`}>
      <span className="lbl" id={`${id}-label`}>
        {label} {required && <i aria-hidden="true">*</i>}
      </span>
      {children}
      {help && <small>{help}</small>}
      <div className="msg" role={error ? "alert" : undefined}>
        {error}
      </div>
    </div>
  );
}

export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("fg", className)}>{children}</div>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} />;
}

export function Select({
  options,
  placeholder,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: ReadonlyArray<string | { value: string | number; label: string }>; placeholder?: string }) {
  return (
    <select {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const value = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        return (
          <option key={String(value)} value={value}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

export function Checkbox({ checked, onChange, children, disabled, name }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; disabled?: boolean; name?: string }) {
  return (
    <label className="chk">
      <input type="checkbox" name={name} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <p>{children}</p>
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="sw">
      <input type="checkbox" role="switch" aria-checked={checked} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export interface ChipOption {
  value: string;
  label: string;
  disabled?: boolean;
  title?: string;
}

/** Prototype chip multi-select. Rendered as toggle buttons with aria-pressed. */
export function Chips({ options, selected, onToggle, gold, disabled }: { options: ChipOption[]; selected: readonly string[]; onToggle: (value: string) => void; gold?: boolean; disabled?: boolean }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            className={cn("chip", on && "on", on && gold && "gold")}
            aria-pressed={on}
            disabled={disabled || o.disabled}
            title={o.title}
            onClick={() => onToggle(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
