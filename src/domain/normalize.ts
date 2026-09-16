/**
 * Normalisation shared by capture, deduplication and suppression. Keeping one implementation
 * means a phone number suppressed via SMS STOP matches the number captured on the website.
 */

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) ? trimmed : null;
}

/** US numbers only (serviced states are all US). Returns E.164 (+1XXXXXXXXXX) or null. */
export function normalizeUsPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  let national: string;
  if (digits.length === 10) national = digits;
  else if (digits.length === 11 && digits.startsWith("1")) national = digits.slice(1);
  else return null;
  // NANP: area code and exchange cannot start with 0 or 1.
  if (/^[01]/.test(national) || /^[01]/.test(national.slice(3))) return null;
  return "+1" + national;
}

export function formatUsPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function normalizeZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const m = /^(\d{5})(?:-?\d{4})?$/.exec(zip.trim());
  return m ? m[1] : null;
}

export function normalizeName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeStateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  const code = state.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** Masks PII for logs and outbound message records visible to non-privileged staff. */
export function maskPhone(e164: string): string {
  return e164.length > 4 ? "•••" + e164.slice(-4) : "••••";
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "••••";
  return (user?.[0] ?? "") + "•••@" + domain;
}
