import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MINUTE } from "../../src/domain/time";
import { base32Decode, hotp, totpStep } from "../../src/domain/totp";
import { as, createLead, expectAppError, seedWorld, setupTest, teardownTest, TEST_NOW, type TestConvex, type World } from "./fixtures";

const codeAt = async (secret: string, timestamp: number) => await hotp(base32Decode(secret), totpStep(timestamp));

describe("staff two-factor authentication", () => {
  let t: TestConvex;
  let world: World;

  beforeEach(async () => {
    t = setupTest();
    world = await seedWorld(t);
  });
  afterEach(() => {
    process.env.REQUIRE_STAFF_2FA = "false";
    teardownTest();
  });

  const enrol = async () => {
    const session = await as(t, world.admin);
    const { secret } = await session.mutation(api.mfa.beginEnrollment, {});
    await session.action(api.mfa.confirmEnrollment, { code: await codeAt(secret, Date.now()) });
    return { session, secret };
  };

  it("verification is per session, codes cannot be replayed, and staff functions require it when enforced", async () => {
    process.env.REQUIRE_STAFF_2FA = "true";
    const leadId = await createLead(t);
    const { session: enrolledSession, secret } = await enrol();

    // The enrolling session is verified.
    await enrolledSession.mutation(api.leads.revealContact, { leadId });

    // A new sign-in (new session) must verify again…
    const newSession = await as(t, world.admin);
    await expectAppError(newSession.mutation(api.leads.revealContact, { leadId }), "MFA_REQUIRED");
    // …and cannot reuse the code that was just used for enrolment.
    await expectAppError(newSession.action(api.mfa.verify, { code: await codeAt(secret, Date.now()) }), "INVALID", /already been used/);
    await expectAppError(newSession.action(api.mfa.verify, { code: "000000" === (await codeAt(secret, Date.now())) ? "111111" : "000000" }), "INVALID", /not valid/);

    vi.advanceTimersByTime(30_000);
    await newSession.action(api.mfa.verify, { code: await codeAt(secret, Date.now()) });
    await newSession.mutation(api.leads.revealContact, { leadId });
    expect(await newSession.query(api.mfa.status, {})).toMatchObject({ enrolled: true, verified: true, required: true, staff: true });
  });

  /**
   * KNOWN ISSUE (reported, not fixed here): `enforceRateLimit` writes its counter in the same mutation that
   * then throws INVALID for a wrong code. Convex rolls back every write of a failed mutation, so failed
   * attempts are never counted and TOTP codes can be guessed without limit. Fixing it needs an API contract
   * change (return a failure result instead of throwing, or record attempts in a separate committed call)
   * that the two-factor page must adopt at the same time. When fixed, change `it.fails` to `it`.
   */
  it("locks out after 6 wrong codes in 15 minutes (attempts are counted in a separate committed transaction)", async () => {
    const { secret } = await enrol();
    vi.advanceTimersByTime(16 * MINUTE); // fresh rate-limit window
    const attacker = await as(t, world.admin);
    const valid = await codeAt(secret, Date.now());
    const wrong = valid === "123456" ? "654321" : "123456";
    for (let i = 0; i < 6; i++) await expectAppError(attacker.action(api.mfa.verify, { code: wrong }), "INVALID");
    await expectAppError(attacker.action(api.mfa.verify, { code: wrong }), "RATE_LIMITED");
  });
});

describe("consent withdrawal lookup throttling", () => {
  let t: TestConvex;
  let reference: string;

  beforeEach(async () => {
    t = setupTest();
    await seedWorld(t);
    const leadId: Id<"leads"> = await createLead(t, { email: "jane.doe@example.com", phone: "+14045550199" });
    reference = (await t.run((ctx) => ctx.db.get(leadId)))!.reference;
  });
  afterEach(teardownTest);

  it("successful lookups for one reference are limited to 5 per hour", async () => {
    for (let i = 0; i < 5; i++) {
      await t.action(api.intake.withdrawConsent, { reference, contact: "jane.doe@example.com", ipAddress: `198.51.100.${i}` });
    }
    await expectAppError(t.action(api.intake.withdrawConsent, { reference, contact: "jane.doe@example.com", ipAddress: "198.51.100.99" }), "RATE_LIMITED");
    vi.setSystemTime(TEST_NOW + 61 * MINUTE);
    await t.action(api.intake.withdrawConsent, { reference, contact: "jane.doe@example.com", ipAddress: "198.51.100.99" });
  });

  /**
   * KNOWN ISSUE (same root cause as the MFA lockout): a non-matching contact throws, which rolls back the
   * `withdraw-ref` counter, so guesses of the email/phone for a known reference are not throttled.
   */
  it("wrong-contact guesses for one reference are throttled", async () => {
    for (let i = 0; i < 5; i++) {
      await expectAppError(t.action(api.intake.withdrawConsent, { reference, contact: `guess${i}@example.com`, ipAddress: `198.51.100.${i}` }), "INVALID");
    }
    await expectAppError(t.action(api.intake.withdrawConsent, { reference, contact: "guess9@example.com", ipAddress: "198.51.100.99" }), "RATE_LIMITED");
  });
});
