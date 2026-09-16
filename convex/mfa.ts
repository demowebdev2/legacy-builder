import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { base32Encode, otpauthUrl, verifyTotp } from "../src/domain/totp";
import { MINUTE } from "../src/domain/time";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, type ActionCtx, internalMutation, mutation, type MutationCtx, query } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, displayName, isStaffRole, requireViewer, type Viewer } from "./lib/auth";
import { isProductionDeployment, readEnv, staffMfaRequired } from "./lib/env";
import { appError, invalid, unauthenticated } from "./lib/errors";
import { consumeRateLimit } from "./lib/rateLimit";

/**
 * TOTP two-factor authentication. Secrets are encrypted at rest with AES-GCM (MFA_ENCRYPTION_KEY,
 * base64 32 bytes). Verification is recorded per Convex Auth session, so signing in on a new device
 * requires a fresh code.
 */

async function encryptionKey(): Promise<CryptoKey> {
  const raw = readEnv("MFA_ENCRYPTION_KEY");
  let bytes: Uint8Array;
  if (raw) {
    bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    if (bytes.length !== 32) throw appError("CONFIGURATION", "MFA_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  } else {
    if (isProductionDeployment()) throw appError("CONFIGURATION", "MFA_ENCRYPTION_KEY is not configured.");
    bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("legacy-builders-dev-only-mfa-key")));
  }
  return await crypto.subtle.importKey("raw", bytes as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function encryptSecret(secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(secret));
  return { secretCiphertext: toB64(new Uint8Array(cipher)), secretIv: toB64(iv) };
}

async function decryptSecret(factor: Doc<"mfaFactors">): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(factor.secretIv) as BufferSource },
    await encryptionKey(),
    fromB64(factor.secretCiphertext) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

async function factorFor(ctx: MutationCtx, viewer: Viewer) {
  return await ctx.db
    .query("mfaFactors")
    .withIndex("by_user", (q) => q.eq("userId", viewer.userId))
    .unique();
}

async function markSessionVerified(ctx: MutationCtx, viewer: Viewer) {
  if (!viewer.sessionId) return;
  const sessionId = viewer.sessionId;
  const existing = await ctx.db
    .query("mfaSessions")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .unique();
  if (!existing) await ctx.db.insert("mfaSessions", { sessionId, userId: viewer.userId, verifiedAt: Date.now() });
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const factor = await ctx.db
      .query("mfaFactors")
      .withIndex("by_user", (q) => q.eq("userId", viewer.userId))
      .unique();
    let verified = false;
    if (viewer.sessionId) {
      const sessionId = viewer.sessionId;
      verified = !!(await ctx.db
        .query("mfaSessions")
        .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
        .unique());
    }
    const staff = isStaffRole(viewer.user.role);
    return { enrolled: !!factor?.confirmedAt, verified, required: staff && staffMfaRequired(), staff };
  },
});

export const beginEnrollment = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const existing = await factorFor(ctx, viewer);
    if (existing?.confirmedAt) throw invalid("Two-factor authentication is already set up.");
    const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
    const encrypted = await encryptSecret(secret);
    if (existing) await ctx.db.patch(existing._id, { ...encrypted, createdAt: Date.now(), lastUsedStep: undefined });
    else await ctx.db.insert("mfaFactors", { userId: viewer.userId, ...encrypted, createdAt: Date.now() });
    return { secret, otpauthUrl: otpauthUrl(secret, viewer.user.email ?? viewer.name) };
  },
});

// ─────────────────────────── code verification (rate limited) ───────────────────────────
//
// Each attempt is counted in its own committed mutation BEFORE the code is checked, then the check runs
// in a second mutation that reports failure as a value. A failing check therefore can never roll back
// the attempt counter (a single throwing mutation would), so codes cannot be brute-forced.

const MFA_ATTEMPTS = { max: 6, windowMs: 15 * MINUTE };
const purposeV = v.union(v.literal("confirm"), v.literal("verify"), v.literal("disable"));
type CodeResult = { ok: true } | { ok: false; code: "INVALID"; message: string };

export const consumeAttempt = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await consumeRateLimit(ctx, `mfa:${userId}`, MFA_ATTEMPTS),
});

export const applyCode = internalMutation({
  args: { userId: v.id("users"), sessionId: v.optional(v.id("authSessions")), code: v.string(), purpose: purposeV },
  handler: async (ctx, { userId, sessionId, code, purpose }): Promise<CodeResult> => {
    const user = await ctx.db.get(userId);
    if (!user || user.disabled) return { ok: false, code: "INVALID", message: "Please sign in again." };
    const viewer: Viewer = { userId, user, sessionId: sessionId ?? null, name: displayName(user) };
    const fail = (message: string): CodeResult => ({ ok: false, code: "INVALID", message });
    const factor = await factorFor(ctx, viewer);
    if (purpose === "confirm") {
      if (!factor) return fail("Start two-factor setup first.");
      if (factor.confirmedAt) return fail("Already set up.");
    } else {
      if (!factor?.confirmedAt) return fail("Two-factor authentication is not set up.");
      if (purpose === "disable" && isStaffRole(user.role) && staffMfaRequired()) return fail("Two-factor authentication is mandatory for staff.");
    }
    const step = await verifyTotp(await decryptSecret(factor), code, Date.now());
    if (step === null) return fail("That code is not valid. Check your authenticator app and try again.");
    if (factor.lastUsedStep != null && step <= factor.lastUsedStep) return fail("That code has already been used. Wait for the next one.");
    await ctx.db.patch(factor._id, { lastUsedStep: step });

    if (purpose === "disable") {
      await ctx.db.delete(factor._id);
      const sessions = await ctx.db.query("mfaSessions").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
      for (const s of sessions) await ctx.db.delete(s._id);
      await writeAudit(ctx, actorFromViewer(viewer), { action: "mfa.disable", entityType: "user", entityId: userId, summary: "Two-factor authentication disabled" });
      return { ok: true };
    }
    if (purpose === "confirm") {
      await ctx.db.patch(factor._id, { confirmedAt: Date.now() });
      await writeAudit(ctx, actorFromViewer(viewer), { action: "mfa.enroll", entityType: "user", entityId: userId, summary: "Two-factor authentication enabled" });
    }
    await markSessionVerified(ctx, viewer);
    return { ok: true };
  },
});

async function runCode(ctx: ActionCtx, purpose: "confirm" | "verify" | "disable", code: string): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw unauthenticated();
  const sessionId = (await getAuthSessionId(ctx)) ?? undefined;
  const allowed: boolean = await ctx.runMutation(internal.mfa.consumeAttempt, { userId });
  if (!allowed) throw appError("RATE_LIMITED", "Too many codes. Wait 15 minutes and try again.");
  const result: CodeResult = await ctx.runMutation(internal.mfa.applyCode, { userId, sessionId, code, purpose });
  if (!result.ok) throw appError(result.code, result.message);
}

export const confirmEnrollment = action({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<void> => await runCode(ctx, "confirm", code),
});

export const verify = action({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<void> => await runCode(ctx, "verify", code),
});

export const disable = action({
  args: { code: v.string() },
  handler: async (ctx, { code }): Promise<void> => await runCode(ctx, "disable", code),
});
