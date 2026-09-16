/** Display formatting that mirrors the prototype's `ago`, `untilD` and `fmt` helpers. */

export function timeAgo(timestamp: number | null | undefined, now: number = Date.now()): string {
  if (!timestamp) return "—";
  const s = Math.floor((now - timestamp) / 1000);
  if (s < 0) return "in " + timeAgo(now - (timestamp - now), now).replace(" ago", "");
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  const days = Math.floor(s / 86400);
  if (days < 30) return days + "d ago";
  return Math.floor(days / 30) + "mo ago";
}

export function timeUntil(timestamp: number | null | undefined, now: number = Date.now()): string {
  if (!timestamp) return "—";
  const days = Math.round((timestamp - now) / 86_400_000);
  if (days < 0) return Math.abs(days) + " days ago";
  if (days === 0) return "today";
  return "in " + days + " days";
}

export function daysUntil(timestamp: number, now: number = Date.now()): number {
  return Math.round((timestamp - now) / 86_400_000);
}

export function formatDate(timestamp: number | null | undefined, withTime = false): string {
  if (!timestamp) return "—";
  const d = new Date(timestamp);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return withTime ? date + ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : date;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function plural(n: number, singular: string, pluralForm = singular + "s"): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

export function percent(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}
