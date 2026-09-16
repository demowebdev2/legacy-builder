/** Consumer reference numbers and document numbering. */

/** No 0/O/1/I/L to avoid transcription errors when read over the phone. */
const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REFERENCE_RANDOM_LENGTH = 5;

export type RandomBytes = (length: number) => Uint8Array;

export const cryptoRandomBytes: RandomBytes = (length) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

export function randomString(length: number, alphabet: string, random: RandomBytes = cryptoRandomBytes): string {
  // Rejection sampling keeps the distribution uniform.
  const out: string[] = [];
  const limit = 256 - (256 % alphabet.length);
  while (out.length < length) {
    for (const b of random(length * 2)) {
      if (b < limit) out.push(alphabet[b % alphabet.length]);
      if (out.length === length) break;
    }
  }
  return out.join("");
}

/** `LB-YYMM-XXXXX` */
export function generateLeadReference(now: number, random: RandomBytes = cryptoRandomBytes): string {
  const d = new Date(now);
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `LB-${yy}${mm}-${randomString(REFERENCE_RANDOM_LENGTH, REFERENCE_ALPHABET, random)}`;
}

export function normalizeLeadReference(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

export function isLeadReference(input: string): boolean {
  return /^LB-\d{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(normalizeLeadReference(input));
}

export function formatInvoiceNumber(sequence: number): string {
  return `LB-INV-${2600 + sequence}`;
}

export function formatCreditNoteNumber(sequence: number): string {
  return `LB-CN-${String(sequence).padStart(4, "0")}`;
}

/** URL-safe opaque token for invitations and confirmation links. */
export function generateToken(random: RandomBytes = cryptoRandomBytes): string {
  return randomString(40, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", random);
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
