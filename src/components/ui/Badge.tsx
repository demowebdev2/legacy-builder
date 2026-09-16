import type { ReactNode } from "react";
import { type BadgeTone, statusBadge } from "@/domain/status";
import { cn } from "@/lib/cn";

export function Badge({ tone = "n", dot, children, className }: { tone?: BadgeTone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("bg", `bg-${tone}`, className)}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Prototype `sb(status)` — status pill with a dot. */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const [tone, text] = statusBadge(status);
  return (
    <Badge tone={tone} dot>
      {label ?? text}
    </Badge>
  );
}

/** Prototype `exBadge(grade)`. */
export function LeadTypeBadge({ type }: { type: "exclusive" | "standard" | string }) {
  return type === "exclusive" ? <Badge tone="gold">Exclusive</Badge> : <Badge tone="n">Standard</Badge>;
}
