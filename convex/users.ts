import { v } from "convex/values";
import { MAX_PRODUCER_SEATS } from "../src/domain/constants";
import { normalizeEmail, normalizeName, normalizeUsPhone } from "../src/domain/normalize";
import { type Permission, roleHasPermission } from "../src/domain/permissions";
import { generateToken, sha256Hex } from "../src/domain/reference";
import { DAY } from "../src/domain/time";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { templates } from "./integrations/templates";
import { getBalanceDoc, summarizeBalance } from "./ledger";
import { writeAudit } from "./lib/audit";
import {
  actorFromViewer,
  displayName,
  getViewer,
  isAccountReadOnly,
  isAccountRole,
  isStaffRole,
  requireStaff,
  requireViewer,
} from "./lib/auth";
import { siteUrl, staffMfaRequired } from "./lib/env";
import { forbidden, invalid, notFound } from "./lib/errors";
import { enforceRateLimit } from "./lib/rateLimit";
import { staffRoleV } from "./lib/validators";

/** Everything the UI needs to route and render chrome for the signed-in user. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const { user } = viewer;
    const base = {
      userId: viewer.userId,
      email: user.email ?? null,
      name: viewer.name,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      phone: user.phone ?? null,
      role: user.role ?? null,
    };
    if (isStaffRole(user.role)) {
      const factor = await ctx.db
        .query("mfaFactors")
        .withIndex("by_user", (q) => q.eq("userId", viewer.userId))
        .unique();
      let mfaVerified = false;
      if (viewer.sessionId) {
        const sessionId = viewer.sessionId;
        mfaVerified = !!(await ctx.db
          .query("mfaSessions")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .unique());
      }
      return {
        ...base,
        kind: "staff" as const,
        mfa: { required: staffMfaRequired(), enrolled: !!factor?.confirmedAt, verified: mfaVerified },
        account: null,
      };
    }
    if (isAccountRole(user.role) && user.accountId) {
      const account = await ctx.db.get(user.accountId);
      if (!account) return { ...base, kind: "none" as const, account: null, mfa: null };
      const balance = summarizeBalance(await getBalanceDoc(ctx, account._id));
      let memberId = null;
      if (user.role !== "AGENT") {
        const member = await ctx.db
          .query("agencyMembers")
          .withIndex("by_user", (q) => q.eq("userId", viewer.userId))
          .unique();
        memberId = member?._id ?? null;
      }
      return {
        ...base,
        kind: "account" as const,
        mfa: null,
        account: {
          id: account._id,
          name: account.name,
          type: account.type,
          status: account.status,
          statusReason: account.statusReason ?? null,
          readOnly: isAccountReadOnly(account),
          balanceTotal: balance.total,
          memberId,
          maxSeats: MAX_PRODUCER_SEATS,
        },
      };
    }
    return { ...base, kind: "none" as const, account: null, mfa: null };
  },
});

export const updateProfile = mutation({
  args: { firstName: v.string(), lastName: v.string(), phone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const firstName = normalizeName(args.firstName);
    const lastName = normalizeName(args.lastName);
    if (!firstName || !lastName) throw invalid("First and last name are required.");
    let phone: string | undefined;
    if (args.phone) {
      phone = normalizeUsPhone(args.phone) ?? undefined;
      if (!phone) throw invalid("Enter a valid US mobile number.");
    }
    await ctx.db.patch(viewer.userId, { firstName, lastName, name: `${firstName} ${lastName}`, phone });
    if (viewer.user.role === "AGENT" && viewer.user.accountId) {
      const account = await ctx.db.get(viewer.user.accountId);
      if (account?.type === "individual") {
        await ctx.db.patch(account._id, {
          name: `${firstName} ${lastName}`,
          phone: phone ?? account.phone,
          searchText: [`${firstName} ${lastName}`, account.businessName, account.email, account.npn].filter(Boolean).join(" "),
        });
      }
    }
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "profile.update",
      entityType: "user",
      entityId: viewer.userId,
      accountId: viewer.user.accountId,
      summary: "Profile details updated",
    });
  },
});

/** Active login sessions for the security page (Convex Auth `authSessions`). */
export const mySessions = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", viewer.userId))
      .collect();
    return sessions
      .filter((s) => s.expirationTime > Date.now())
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((s) => ({ id: s._id, createdAt: s._creationTime, expiresAt: s.expirationTime, current: s._id === viewer.sessionId }));
  },
});

export const revokeSession = mutation({
  args: { sessionId: v.id("authSessions") },
  handler: async (ctx, { sessionId }) => {
    const viewer = await requireViewer(ctx);
    const session = await ctx.db.get(sessionId);
    if (!session || session.userId !== viewer.userId) throw notFound("Session");
    if (sessionId === viewer.sessionId) throw invalid("Use sign out to end the current session.");
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", sessionId))
      .collect();
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(sessionId);
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "session.revoke",
      entityType: "user",
      entityId: viewer.userId,
      summary: "Signed out another session",
    });
  },
});

// ─────────────────────────── staff users ───────────────────────────

export const listStaff = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "users.manage");
    const out = [];
    for (const role of ["ADMIN", "SUPPORT", "FINANCE", "CONTENT"] as const) {
      const users = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", role))
        .collect();
      for (const u of users) {
        const factor = await ctx.db
          .query("mfaFactors")
          .withIndex("by_user", (q) => q.eq("userId", u._id))
          .unique();
        out.push({
          id: u._id,
          name: displayName(u),
          email: u.email ?? "",
          role,
          disabled: !!u.disabled,
          mfaEnrolled: !!factor?.confirmedAt,
          lastSeenAt: u.lastSeenAt ?? null,
        });
      }
    }
    const invitations = (await ctx.db.query("staffInvitations").collect())
      .filter((i) => !i.acceptedAt && !i.revokedAt && i.expiresAt > Date.now())
      .map((i) => ({ id: i._id, email: i.email, role: i.role, expiresAt: i.expiresAt }));
    return { users: out, invitations };
  },
});

export const inviteStaff = mutation({
  args: { email: v.string(), role: staffRoleV },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, "users.manage");
    const email = normalizeEmail(args.email);
    if (!email) throw invalid("Enter a valid email address.");
    await enforceRateLimit(ctx, `invite-staff:${staff.userId}`, { max: 20, windowMs: DAY });
    const token = generateToken();
    const id = await ctx.db.insert("staffInvitations", {
      email,
      role: args.role,
      tokenHash: await sha256Hex(token),
      expiresAt: Date.now() + 7 * DAY,
      invitedBy: staff.userId,
      invitedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.integrations.messaging.sendTransactionalEmail, {
      to: email,
      template: "staff_invitation",
      ...templates.staffInvitation(args.role, `${siteUrl()}/auth/invite/${token}?type=staff`),
    });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "staff.invite",
      entityType: "staffInvitation",
      entityId: id,
      summary: `Invited ${email} as ${args.role}`,
    });
    return { id };
  },
});

export const revokeStaffInvitation = mutation({
  args: { invitationId: v.id("staffInvitations") },
  handler: async (ctx, { invitationId }) => {
    const staff = await requireStaff(ctx, "users.manage");
    const invitation = await ctx.db.get(invitationId);
    if (!invitation) throw notFound("Invitation");
    await ctx.db.patch(invitationId, { revokedAt: Date.now() });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "staff.invite_revoke",
      entityType: "staffInvitation",
      entityId: invitationId,
      summary: `Revoked invitation for ${invitation.email}`,
    });
  },
});

export const setStaffRole = mutation({
  args: { userId: v.id("users"), role: staffRoleV },
  handler: async (ctx, { userId, role }) => {
    const staff = await requireStaff(ctx, "users.manage");
    const target = await ctx.db.get(userId);
    if (!target || !isStaffRole(target.role)) throw notFound("Staff user");
    if (target._id === staff.userId && role !== "ADMIN") throw invalid("You cannot remove your own admin role.");
    await ctx.db.patch(userId, { role });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "staff.role_change",
      entityType: "user",
      entityId: userId,
      summary: `${displayName(target)}: ${target.role} → ${role}`,
    });
  },
});

export const setStaffDisabled = mutation({
  args: { userId: v.id("users"), disabled: v.boolean() },
  handler: async (ctx, { userId, disabled }) => {
    const staff = await requireStaff(ctx, "users.manage");
    const target = await ctx.db.get(userId);
    if (!target || !isStaffRole(target.role)) throw notFound("Staff user");
    if (target._id === staff.userId) throw invalid("You cannot disable your own login.");
    await ctx.db.patch(userId, { disabled });
    if (disabled) {
      const sessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .collect();
      for (const s of sessions) await ctx.db.delete(s._id);
    }
    await writeAudit(ctx, actorFromViewer(staff), {
      action: disabled ? "staff.disable" : "staff.enable",
      entityType: "user",
      entityId: userId,
      summary: `${disabled ? "Disabled" : "Re-enabled"} ${displayName(target)}`,
    });
  },
});

/** Accepts a staff invitation for the signed-in user. The token proves control of the invited mailbox. */
export const acceptStaffInvitation = mutation({
  args: { token: v.string(), firstName: v.string(), lastName: v.string() },
  handler: async (ctx, { token, firstName, lastName }) => {
    const viewer = await requireViewer(ctx);
    await enforceRateLimit(ctx, `accept-invite:${viewer.userId}`, { max: 10, windowMs: DAY });
    const tokenHash = await sha256Hex(token);
    const invitation = await ctx.db
      .query("staffInvitations")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt < Date.now()) {
      throw invalid("This invitation is invalid or has expired.");
    }
    if (normalizeEmail(viewer.user.email) !== invitation.email) {
      throw forbidden("Sign in with the email address the invitation was sent to.");
    }
    if (viewer.user.role || viewer.user.accountId) throw invalid("This login already has a role.");
    await ctx.db.patch(viewer.userId, {
      role: invitation.role,
      firstName: normalizeName(firstName),
      lastName: normalizeName(lastName),
      name: `${normalizeName(firstName)} ${normalizeName(lastName)}`,
    });
    await ctx.db.patch(invitation._id, { acceptedAt: Date.now(), acceptedBy: viewer.userId });
    await writeAudit(ctx, { kind: "user", userId: viewer.userId, name: viewer.name, role: invitation.role }, {
      action: "staff.invite_accept",
      entityType: "user",
      entityId: viewer.userId,
      summary: `Accepted ${invitation.role} invitation`,
    });
    return { role: invitation.role };
  },
});

export const touchLastSeen = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return;
    const now = Date.now();
    if (!viewer.user.lastSeenAt || now - viewer.user.lastSeenAt > 10 * 60_000) {
      await ctx.db.patch(viewer.userId, { lastSeenAt: now });
    }
  },
});

// ─────────────────────────── internal (actions & CLI) ───────────────────────────

export const getStaffForAction = internalQuery({
  args: { userId: v.id("users"), permission: v.string() },
  handler: async (ctx, { userId, permission }) => {
    const user = await ctx.db.get(userId);
    if (!user || user.disabled || !isStaffRole(user.role)) return null;
    if (!roleHasPermission(user.role, permission as Permission)) return null;
    return { userId: user._id, role: user.role, name: displayName(user) };
  },
});

export const getOwnedAccountForAction = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<Doc<"accounts"> | null> => {
    const user = await ctx.db.get(userId);
    if (!user?.accountId || (user.role !== "AGENT" && user.role !== "AGENCY_PRINCIPAL")) return null;
    return await ctx.db.get(user.accountId);
  },
});

/**
 * First-admin bootstrap. Run from the CLI after signing up normally:
 *   npx convex run users:bootstrapAdmin '{"email":"you@example.com"}'
 * Refuses once any ADMIN exists.
 */
export const bootstrapAdmin = internalMutation({
  args: { email: v.string(), firstName: v.optional(v.string()), lastName: v.optional(v.string()) },
  handler: async (ctx, { email, firstName, lastName }) => {
    const existingAdmin = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "ADMIN"))
      .first();
    if (existingAdmin) throw invalid("An admin already exists. Invite further staff from Admin → Users.");
    const normalized = normalizeEmail(email);
    const user = normalized
      ? await ctx.db
          .query("users")
          .withIndex("email", (q) => q.eq("email", normalized))
          .unique()
      : null;
    if (!user) throw notFound("User with that email (sign up first)");
    await ctx.db.patch(user._id, { role: "ADMIN", firstName, lastName, name: [firstName, lastName].filter(Boolean).join(" ") || user.name });
    await writeAudit(ctx, { kind: "system", name: "CLI bootstrap" }, {
      action: "staff.bootstrap_admin",
      entityType: "user",
      entityId: user._id,
      summary: `Promoted ${normalized} to ADMIN via CLI bootstrap`,
    });
    return user._id;
  },
});
