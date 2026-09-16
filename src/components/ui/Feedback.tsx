import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

type NoteKind = "i" | "w" | "e" | "s" | "n";
const NOTE_ICON: Record<NoteKind, IconName> = { i: "info", w: "warn", e: "warn", s: "check", n: "info" };

/** Prototype `note(kind, html)`. `e` notes are announced to assistive tech. */
export function Alert({ kind = "i", children, className }: { kind?: NoteKind; children: ReactNode; className?: string }) {
  return (
    <div className={cn("note", `note-${kind}`, className)} role={kind === "e" || kind === "w" ? "alert" : undefined}>
      <Icon name={NOTE_ICON[kind]} />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ic">
        <Icon name={icon} />
      </div>
      <h4 className="h4">{title}</h4>
      {children && (
        <p className="sm" style={{ maxWidth: "44ch", margin: ".3rem auto 0" }}>
          {children}
        </p>
      )}
      {action && <div style={{ marginTop: "1rem" }}>{action}</div>}
    </div>
  );
}

export function Meter({ percent, tone, className }: { percent: number; tone?: "gold" | "green" | "red" | "amber"; className?: string }) {
  const width = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (
    <div className={cn("meter", className)} role="presentation">
      <i className={tone} style={{ width: `${width}%` }} />
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%", className }: { height?: number | string; width?: number | string; className?: string }) {
  return <div className={cn("skel", className)} style={{ height, width }} aria-hidden="true" />;
}

/** Standard loading placeholder for data-driven screens. */
export function LoadingBlock({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="card card-bd stack" style={{ gap: ".7rem" }} role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <Skeleton height={22} width="40%" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={14} width={`${90 - i * 12}%`} />
      ))}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="stack">
      <div className="g g4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat">
            <Skeleton height={12} width="50%" />
            <Skeleton height={28} width="40%" className="mt-3" />
          </div>
        ))}
      </div>
      <LoadingBlock rows={6} />
    </div>
  );
}

export function ErrorState({ title = "Something failed while drawing this screen.", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="fatal" role="alert">
      <b>{title}</b>
      The rest of the app still works — use the navigation to move on{onRetry ? " or try again" : ""}.
      {message && <code>{message}</code>}
      {onRetry && (
        <button type="button" className="b b-out b-s mt-3" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Avatar({ name, large, className }: { name: string; large?: boolean; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className={cn("av", large && "av-lg", className)} aria-hidden="true">
      {initials}
    </div>
  );
}
