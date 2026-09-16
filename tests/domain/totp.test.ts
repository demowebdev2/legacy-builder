import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, otpauthUrl, totpStep, verifyTotp } from "../../src/domain/totp";

/** RFC 6238 Appendix B uses the ASCII secret "12345678901234567890" for SHA-1. */
const RFC_SECRET_BYTES = new TextEncoder().encode("12345678901234567890");
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32", () => {
  it("encodes the RFC secret and round-trips", () => {
    expect(base32Encode(RFC_SECRET_BYTES)).toBe(RFC_SECRET_BASE32);
    expect(base32Decode(RFC_SECRET_BASE32)).toEqual(RFC_SECRET_BYTES);
  });

  it("tolerates lower case, spaces and padding; rejects invalid characters", () => {
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq====")).toEqual(RFC_SECRET_BYTES);
    expect(() => base32Decode("GEZD1")).toThrow(/Invalid base32/);
  });
});

describe("RFC 6238 test vectors (SHA-1, truncated to 6 digits)", () => {
  it("T = 59 s → 287082 (8-digit vector 94287082)", async () => {
    expect(totpStep(59_000)).toBe(1);
    expect(await hotp(RFC_SECRET_BYTES, 1)).toBe("287082");
    expect(await verifyTotp(RFC_SECRET_BASE32, "287082", 59_000, 0)).toBe(1);
  });

  it.each([
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])("T = %i s → %s", async (seconds, code) => {
    expect(await hotp(RFC_SECRET_BYTES, totpStep(seconds * 1000))).toBe(code);
    expect(await verifyTotp(RFC_SECRET_BASE32, code, seconds * 1000, 0)).toBe(totpStep(seconds * 1000));
  });
});

describe("verification window and replay protection", () => {
  const codeAtStep1 = "287082"; // valid for 30 s ≤ T < 60 s

  it("accepts the previous step within the default ±1 window and reports the matched step", async () => {
    expect(await verifyTotp(RFC_SECRET_BASE32, codeAtStep1, 75_000)).toBe(1); // step 2, one step late
    expect(await verifyTotp(RFC_SECRET_BASE32, codeAtStep1, 15_000)).toBe(1); // step 0, one step early
  });

  it("rejects a code two steps old", async () => {
    expect(await verifyTotp(RFC_SECRET_BASE32, codeAtStep1, 95_000)).toBeNull(); // step 3
  });

  it("returns the matched step so the caller can refuse to reuse it (step ≤ lastUsedStep)", async () => {
    const first = await verifyTotp(RFC_SECRET_BASE32, codeAtStep1, 45_000);
    const replay = await verifyTotp(RFC_SECRET_BASE32, codeAtStep1, 70_000);
    expect(first).toBe(1);
    expect(replay).toBe(first); // same step → the server treats it as already used
  });

  it("rejects malformed and wrong codes", async () => {
    expect(await verifyTotp(RFC_SECRET_BASE32, "28708", 59_000)).toBeNull();
    expect(await verifyTotp(RFC_SECRET_BASE32, "2870821", 59_000)).toBeNull();
    expect(await verifyTotp(RFC_SECRET_BASE32, "abcdef", 59_000)).toBeNull();
    expect(await verifyTotp(RFC_SECRET_BASE32, "287083", 59_000)).toBeNull();
    expect(await verifyTotp(RFC_SECRET_BASE32, "287 082", 59_000)).toBe(1);
  });

  it("builds an otpauth URL for authenticator apps", () => {
    expect(otpauthUrl(RFC_SECRET_BASE32, "dawn@example.com")).toBe(
      "otpauth://totp/Legacy%20Builders%3Adawn%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Legacy%20Builders&algorithm=SHA1&digits=6&period=30",
    );
  });
});
