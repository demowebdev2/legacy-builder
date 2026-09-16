import { timeAgo } from "@/domain/format";

/** Display helpers shared by the admin back-office screens. Pure formatting only — no business rules. */

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  website: "Website form",
  meta: "Meta Lead Ads",
  partner: "Partner API",
  admin: "Manual entry (admin)",
};

export const RUN_TRIGGER_LABELS: Record<string, string> = {
  capture: "At capture",
  retry: "Retry ladder",
  requeue: "Re-queued by staff",
  release_queue: "Queue released",
  manual: "Manual assignment",
};

export const SUPPRESSION_REASON_LABELS: Record<string, string> = {
  consumer_withdrawal: "Consumer withdrew consent",
  sms_stop: "SMS STOP reply",
  admin: "Staff entry",
  complaint: "Complaint",
};

export const WITHDRAWAL_METHOD_LABELS: Record<string, string> = {
  reference_lookup: "Consumer, via reference lookup",
  sms_stop: "SMS STOP reply",
  admin: "Staff (admin)",
};

/** Lead statuses that the engine or an admin may still release. */
export const ASSIGNABLE_LEAD_STATUSES = new Set(["queued", "unassigned_pending", "partially_assigned", "unassignable"]);

export function leadTypeLabel(type: string): string {
  return type === "exclusive" ? "exclusive" : "standard";
}

/** 5 → "5 minutes", 60 → "1 hour", 1440 → "24 hours", 90 → "1.5 hours". */
export function formatMinutesLong(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  if (hours <= 72) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round((minutes / 1440) * 10) / 10;
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** 5 → "5m", 60 → "1h", 90 → "1h 30m", 2880 → "48h". */
export function formatMinutesShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Hours since an account's last release (null = never). */
export function formatWaited(hours: number | null | undefined): string {
  if (hours == null) return "never had a lead";
  if (hours < 1) return `last lead ${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 72) return `last lead ${Math.round(hours)}h ago`;
  return `last lead ${Math.round(hours / 24)}d ago`;
}

export function formatHoursShort(hours: number | null | undefined): string {
  if (hours == null) return "never";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 72) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Renders a JSON string (raw payloads, audit metadata) readably; falls back to the original text. */
export function prettyJson(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** "+14045550148" → "(404) 555-0148"; anything else is returned unchanged (e.g. masked values). */
export function formatUsPhone(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : value;
}

/** Standard leads are shared: "Alicia Reyes +2". */
export function holderSummary(holders: string[]): string | null {
  if (!holders.length) return null;
  return holders.length > 1 ? `${holders[0]} +${holders.length - 1}` : holders[0];
}

/** `timeAgo` for past events, clamped so a timestamp a few seconds ahead of the local clock reads "just now". */
export function ago(timestamp: number | null | undefined, now: number): string {
  return timeAgo(timestamp == null ? timestamp : Math.min(timestamp, now), now);
}
