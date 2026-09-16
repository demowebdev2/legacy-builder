"use client";

import { EmptyState } from "@/components/ui/Feedback";

export type OrderKind = "opening" | "top_up" | "bundle" | "auto_reload";

export const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  opening: "Opening purchase",
  top_up: "Top-up",
  bundle: "Volume bundle",
  auto_reload: "Auto-reload",
};

/** Integer cents → the string shown in a dollar input ("20", "22.87"). */
export function centsToInput(cents: number): string {
  return cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100);
}

/** Dollar input → integer cents, or null when the value is not a positive amount under $10,000. */
export function inputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed) * 100);
  return cents > 0 && cents <= 1_000_000 ? cents : null;
}

export function shortId(id: string, length = 6): string {
  return id.length > length ? `…${id.slice(-length)}` : id;
}

export function NoAccess({ what }: { what: string }) {
  return (
    <div className="card">
      <EmptyState icon="lock" title="You do not have access to this screen">
        {what} is limited to staff roles with the matching permission. Ask an admin if you need it.
      </EmptyState>
    </div>
  );
}

/** Builds RFC 4180 CSV and hands it to the browser as a download. */
export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const escape = (cell: string | number) => {
    const text = String(cell);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
