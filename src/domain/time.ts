/** Timezone helpers that work in the browser, Node and the Convex runtime (Intl only). */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(timestamp: number, timeZone: string): ZonedParts {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date(timestamp))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

/** Hour of day (0–23) at `timestamp` in `timeZone`. */
export function localHour(timestamp: number, timeZone: string): number {
  return zonedParts(timestamp, timeZone).hour;
}

/** Epoch ms of local midnight for the day containing `timestamp` in `timeZone`. */
export function startOfLocalDay(timestamp: number, timeZone: string): number {
  const p = zonedParts(timestamp, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = asUtc - Math.floor(timestamp / 1000) * 1000;
  return Date.UTC(p.year, p.month - 1, p.day) - offset;
}

export function isWithinReceivingHours(timestamp: number, timeZone: string, startHour: number, endHour: number): boolean {
  const h = localHour(timestamp, timeZone);
  if (startHour === endHour) return true;
  return startHour < endHour ? h >= startHour && h < endHour : h >= startHour || h < endHour;
}

export function hoursBetween(from: number, to: number): number {
  return (to - from) / HOUR;
}

export const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
] as const;
