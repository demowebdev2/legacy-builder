import { describe, expect, it } from "vitest";
import {
  formatCreditNoteNumber,
  formatInvoiceNumber,
  generateLeadReference,
  generateToken,
  isLeadReference,
  normalizeLeadReference,
  randomString,
  type RandomBytes,
  sha256Hex,
} from "../../src/domain/reference";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Deterministic byte source: returns the given bytes cyclically. */
const bytes = (...values: number[]): RandomBytes => {
  let i = 0;
  return (length) => Uint8Array.from({ length }, () => values[i++ % values.length]);
};

describe("lead reference numbers (LB-YYMM-XXXXX)", () => {
  const sept2026 = Date.UTC(2026, 8, 16, 12, 0, 0);

  it("uses the UTC year and month of capture", () => {
    expect(generateLeadReference(sept2026, bytes(0, 1, 2, 3, 4))).toBe("LB-2609-23456");
    expect(generateLeadReference(Date.UTC(2027, 0, 1), bytes(30))).toBe("LB-2701-ZZZZZ");
  });

  it("only uses the unambiguous alphabet (no 0/O/1/I/L)", () => {
    expect(ALPHABET).not.toMatch(/[01OIL]/);
    for (let i = 0; i < 300; i++) {
      const ref = generateLeadReference(sept2026);
      expect(ref).toMatch(/^LB-2609-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
      expect(isLeadReference(ref)).toBe(true);
    }
  });

  it("rejection-samples bytes ≥ 248 so every symbol is equally likely", () => {
    // 256 - (256 % 31) = 248: bytes 248–255 are discarded rather than biasing the first 8 symbols.
    expect(randomString(3, ALPHABET, bytes(255, 248, 0, 31, 62))).toBe("222");
    expect(randomString(2, ALPHABET, bytes(247, 30))).toBe("ZZ");
  });

  it("recognises references regardless of case and stray spaces", () => {
    expect(normalizeLeadReference("  lb-2609-abcde ")).toBe("LB-2609-ABCDE");
    expect(isLeadReference("lb-2609-abcde")).toBe(true);
    expect(isLeadReference("LB-2609 -ABCDE")).toBe(true);
  });

  it.each([
    ["ambiguous 0", "LB-2609-ABCD0"],
    ["ambiguous 1", "LB-2609-ABCD1"],
    ["ambiguous O", "LB-2609-ABCDO"],
    ["ambiguous I", "LB-2609-ABCDI"],
    ["ambiguous L", "LB-2609-ABCDL"],
    ["too short", "LB-2609-ABCD"],
    ["too long", "LB-2609-ABCDEF"],
    ["wrong prefix", "XX-2609-ABCDE"],
    ["3-digit date", "LB-269-ABCDE"],
    ["old sequential format", "LB-2609-4411"],
    ["empty", ""],
  ])("rejects %s (%s)", (_label, input) => {
    expect(isLeadReference(input)).toBe(false);
  });
});

describe("document numbers and tokens", () => {
  it("formats invoice and credit-note numbers", () => {
    expect(formatInvoiceNumber(1)).toBe("LB-INV-2601");
    expect(formatInvoiceNumber(250)).toBe("LB-INV-2850");
    expect(formatCreditNoteNumber(7)).toBe("LB-CN-0007");
  });

  it("generates 40-character URL-safe tokens that differ each time", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9]{40}$/);
    expect(a).not.toBe(b);
  });

  it("hashes with SHA-256 (consent wording fingerprint)", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
