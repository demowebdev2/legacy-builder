"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
  count?: number | null;
  href?: string;
}

/** Prototype `.tabs`. Link tabs when `href` is set (URL state), otherwise buttons. */
export function Tabs({ items, active, onChange, label }: { items: TabItem[]; active: string; onChange?: (key: string) => void; label?: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t) => {
        const on = t.key === active;
        const inner = (
          <>
            {t.label}
            {t.count != null && <span className="n">{t.count}</span>}
          </>
        );
        return t.href ? (
          <Link key={t.key} href={t.href} role="tab" aria-selected={on} className={cn("tab", on && "on")} scroll={false}>
            {inner}
          </Link>
        ) : (
          <button key={t.key} type="button" role="tab" aria-selected={on} className={cn("tab", on && "on")} onClick={() => onChange?.(t.key)}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: Array<{ value: T; label: string }>; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={cn(value === o.value && "on")} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pager({
  label,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  label: ReactNode;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="pager" aria-label="Pagination">
      <span>{label}</span>
      <div className="b-row">
        <button type="button" className="b b-out b-xs" onClick={onPrev} disabled={!canPrev}>
          Previous
        </button>
        <button type="button" className="b b-out b-xs" onClick={onNext} disabled={!canNext}>
          Next
        </button>
      </div>
    </nav>
  );
}

/** "Load more" footer for Convex `usePaginatedQuery`. */
export function LoadMore({ status, onLoadMore, count }: { status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted"; onLoadMore: () => void; count: number }) {
  if (status === "LoadingFirstPage") return null;
  return (
    <div className="pager">
      <span>
        {count} shown{status === "Exhausted" ? " · end of list" : ""}
      </span>
      {status !== "Exhausted" && (
        <button type="button" className="b b-out b-xs" onClick={onLoadMore} disabled={status === "LoadingMore"}>
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
