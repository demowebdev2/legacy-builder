import { v } from "convex/values";
import { MAX_PRODUCER_SEATS } from "../src/domain/constants";
import { maskEmail, normalizeEmail, normalizeName, normalizeUsPhone } from "../src/domain/normalize";
import { generateToken, sha256Hex } from "../src/domain/reference";
import { DAY } from "../src/domain/time";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { templates } from "./integrations/templates";
import { getBalanceDoc, summarizeBalance } from "./ledger";
import { currentLicenses, isLicenseUsable } from "./licenses";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, assertAccountWritable, requireAccountViewer, requireStaff, requireViewer } from "./lib/auth";
import { siteUrl } from "./lib/env";
import { forbidden, invalid, notFound } from "./lib/errors";
import { enforceRateLimit } from "./lib/rateLimit";

/**
 * Agency seats share ONE account-level balance. Seats are free. Phase 1 handout is manual: the
 * principal hands a pooled lead to a verified producer (see assignments.handOut).
 */

export const team = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "team");
    const members = await ctx.db
      .query("agencyMembers")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .collect();
    const now = Date.now();
    const rows = [];
    for (const m of members) {
      const licenses = m.seatRole === "principal" ? await currentLicenses(ctx, m.accountId) : await currentLicenses(ctx, m.accountId, m._id);
      const held = await ctx.db
        .query("leadAssignments")
        .withIndex("by_producer", (q) => q.eq("producerMemberId", m._id))
        .collect();
      rows.push({
        ...m,
        inviteTokenHash: undefined,
        licensedStates: licenses.filter((l) => isLicenseUsable(l, now)).map((l) => l.state),
        pendingStates: licenses.filter((l) => l.verificationStatus === "unverified").map((l) => l.state),
        leadsHeld: held.filter((a) => !a.revokedAt).length,
      });
    }
    return {
      members: rows,
      maxSeats: MAX_PRODUCER_SEATS,
      activeSeats: members.filter((m) => m.status === "active" && m.seatRole !== "billing_contact").length,
      balance: summarizeBalance(await getBalanceDoc(ctx, viewer.account._id)),
    };
  },
});

export const invite = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    npn: v.optional(v.string()),
    seatRole: v.union(v.literal("producer"), v.literal("billing_contact")),
  },
  handler: async (ctx, args) => {
    const viewer = await requireAccountViewer(ctx, "team");
    assertAccountWritable(viewer.account, "Inviting producers");
    await enforceRateLimit(ctx, `seat-invite:${viewer.account._id}`, { max: 30, windowMs: DAY });
    const name = normalizeName(args.name);
    const email = normalizeEmail(args.email);
    if (!name) throw invalid("Enter the producer's name.");
    if (!email) throw invalid("Enter a valid email address.");
    const phone = args.phone ? normalizeUsPhone(args.phone) : null;
    if (args.phone && !phone) throw invalid("Enter a valid US mobile number.");
    const members = await ctx.db
      .query("agencyMembers")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .collect();
    if (members.filter((m) => m.status !== "deactivated").length >= MAX_PRODUCER_SEATS) {
      throw invalid(`Agencies can hold up to ${MAX_PRODUCER_SEATS} seats.`);
    }
    if (members.some((m) => m.email === email && m.status !== "deactivated")) throw invalid("That person already has a seat.");
    const token = generateToken();
    const now = Date.now();
    const id = await ctx.db.insert("agencyMembers", {
      accountId: viewer.account._id,
      name,
      email,
      phone: phone ?? undefined,
      npn: args.npn?.replace(/\D/g, "") || undefined,
      seatRole: args.seatRole,
      status: "invited",
      verificationStatus: args.seatRole === "billing_contact" ? "not_required" : "unverified",
      inviteTokenHash: await sha256Hex(token),
      inviteExpiresAt: now + 7 * DAY,
      invitedBy: viewer.userId,
      invitedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.integrations.messaging.sendTransactionalEmail, {
      to: email,
      template: "producer_invitation",
      accountId: viewer.account._id,
      ...templates.producerInvitation(viewer.account.name, `${siteUrl()}/auth/invite/${token}?type=seat`),
    });
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "seat.invite",
      entityType: "agencyMember",
      entityId: id,
      accountId: viewer.account._id,
      summary: `Invited ${name} (${args.seatRole.replace("_", " ")})`,
    });
    return id;
  },
});

/** Public preview for the invitation page (no PII beyond the masked address). */
export const invitationInfo = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tokenHash = await sha256Hex(token);
    const member = await ctx.db
      .query("agencyMembers")
      .withIndex("by_inviteTokenHash", (q) => q.eq("inviteTokenHash", tokenHash))
      .unique();
    if (!member || member.status !== "invited" || (member.inviteExpiresAt ?? 0) < Date.now()) return null;
    const account = await ctx.db.get(member.accountId);
    return { agencyName: account?.name ?? "Your agency", email: member.email, maskedEmail: maskEmail(member.email), name: member.name };
  },
});

export const acceptInvitation = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const viewer = await requireViewer(ctx);
    await enforceRateLimit(ctx, `seat-accept:${viewer.userId}`, { max: 10, windowMs: DAY });
    const tokenHash = await sha256Hex(token);
    const member = await ctx.db
      .query("agencyMembers")
      .withIndex("by_inviteTokenHash", (q) => q.eq("inviteTokenHash", tokenHash))
      .unique();
    if (!member || member.status !== "invited" || (member.inviteExpiresAt ?? 0) < Date.now()) {
      throw invalid("This invitation is invalid or has expired.");
    }
    if (normalizeEmail(viewer.user.email) !== member.email) throw forbidden("Sign in with the email address the invitation was sent to.");
    if (viewer.user.role || viewer.user.accountId) throw invalid("This login already belongs to an account.");
    const [firstName, ...rest] = member.name.split(" ");
    await ctx.db.patch(viewer.userId, {
      role: "PRODUCER",
      accountId: member.accountId,
      firstName,
      lastName: rest.join(" ") || undefined,
      name: member.name,
      phone: member.phone,
    });
    await ctx.db.patch(member._id, { userId: viewer.userId, status: "active", activatedAt: Date.now(), inviteTokenHash: undefined });
    await writeAudit(ctx, { kind: "user", userId: viewer.userId, name: member.name, role: "PRODUCER" }, {
      action: "seat.accept",
      entityType: "agencyMember",
      entityId: member._id,
      accountId: member.accountId,
      summary: `${member.name} accepted the seat invitation`,
    });
  },
});

export const setSeatActive = mutation({
  args: { memberId: v.id("agencyMembers"), active: v.boolean() },
  handler: async (ctx, { memberId, active }) => {
    const viewer = await requireAccountViewer(ctx, "team");
    const member = await ctx.db.get(memberId);
    if (!member || member.accountId !== viewer.account._id) throw notFound("Seat");
    if (member.seatRole === "principal") throw invalid("The principal seat cannot be deactivated.");
    await ctx.db.patch(memberId, active ? { status: member.userId ? "active" : "invited", deactivatedAt: undefined } : { status: "deactivated", deactivatedAt: Date.now() });
    if (!active && member.userId) {
      const sessions = await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", member.userId!)).collect();
      for (const s of sessions) await ctx.db.delete(s._id);
    }
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: active ? "seat.reactivate" : "seat.deactivate",
      entityType: "agencyMember",
      entityId: memberId,
      accountId: viewer.account._id,
      summary: `${active ? "Reactivated" : "Deactivated"} seat for ${member.name}`,
    });
  },
});

export const forAccount = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    await requireStaff(ctx, "accounts.read");
    const members = await ctx.db.query("agencyMembers").withIndex("by_account", (q) => q.eq("accountId", accountId)).collect();
    return members.map((m) => ({ ...m, inviteTokenHash: undefined }));
  },
});

export const setSeatVerification = mutation({
  args: { memberId: v.id("agencyMembers"), status: v.union(v.literal("verified"), v.literal("failed")), notes: v.string() },
  handler: async (ctx, { memberId, status, notes }) => {
    const staff = await requireStaff(ctx, "licenses.verify");
    const member = await ctx.db.get(memberId);
    if (!member) throw notFound("Seat");
    if (notes.trim().length < 3) throw invalid("Notes are required.");
    await ctx.db.patch(memberId, { verificationStatus: status, verifiedAt: Date.now(), verifiedBy: staff.userId });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: `seat.${status}`,
      entityType: "agencyMember",
      entityId: memberId,
      accountId: member.accountId,
      summary: `Seat ${member.name} ${status}: ${notes.trim()}`,
    });
  },
});
