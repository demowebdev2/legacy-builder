import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { normalizeEmail, normalizeUsPhone } from "../src/domain/normalize";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { type Actor, actorFromViewer, requireStaff, SYSTEM_ACTOR } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { notifyAccount, notifyStaff } from "./lib/notify";

type Ctx = QueryCtx | MutationCtx;

/** Checked at capture AND again inside the assignment transaction. */
export async function findActiveSuppression(
  ctx: Ctx,
  contact: { phone?: string | null; email?: string | null },
): Promise<Doc<"suppressionEntries"> | null> {
  const checks: Array<["phone" | "email", string]> = [];
  if (contact.phone) checks.push(["phone", contact.phone]);
  if (contact.email) checks.push(["email", contact.email]);
  for (const [channel, value] of checks) {
    const rows = await ctx.db
      .query("suppressionEntries")
      .withIndex("by_channel_value", (q) => q.eq("channel", channel).eq("value", value))
      .collect();
    const active = rows.find((r) => r.active);
    if (active) return active;
  }
  return null;
}

export async function addSuppression(
  ctx: MutationCtx,
  input: {
    channel: "phone" | "email";
    value: string;
    reason: Doc<"suppressionEntries">["reason"];
    leadId?: Id<"leads">;
    note?: string;
    actor: Actor;
  },
): Promise<Id<"suppressionEntries"> | null> {
  const existing = await ctx.db
    .query("suppressionEntries")
    .withIndex("by_channel_value", (q) => q.eq("channel", input.channel).eq("value", input.value))
    .collect();
  if (existing.some((e) => e.active)) return null;
  return await ctx.db.insert("suppressionEntries", {
    channel: input.channel,
    value: input.value,
    reason: input.reason,
    leadId: input.leadId,
    note: input.note,
    active: true,
    createdAt: Date.now(),
    createdBy: input.actor.kind === "user" ? input.actor.userId : undefined,
  });
}

/**
 * Withdraws consent for a lead: consent-withdrawal record, suppression entries, lead status, and
 * cease-contact notices to every current holder. History is never deleted.
 */
export async function withdrawLeadConsent(
  ctx: MutationCtx,
  lead: Doc<"leads">,
  input: {
    method: Doc<"consentWithdrawals">["method"];
    actor: Actor;
    ipAddress?: string;
    userAgent?: string;
    note?: string;
  },
): Promise<{ alreadyWithdrawn: boolean; notices: number }> {
  const now = Date.now();
  await addSuppression(ctx, {
    channel: "phone",
    value: lead.phone,
    reason: input.method === "sms_stop" ? "sms_stop" : input.method === "admin" ? "admin" : "consumer_withdrawal",
    leadId: lead._id,
    actor: input.actor,
  });
  await addSuppression(ctx, {
    channel: "email",
    value: lead.email,
    reason: input.method === "sms_stop" ? "sms_stop" : input.method === "admin" ? "admin" : "consumer_withdrawal",
    leadId: lead._id,
    actor: input.actor,
  });
  if (lead.withdrawnAt) return { alreadyWithdrawn: true, notices: 0 };

  const holders = await ctx.db
    .query("leadAssignments")
    .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
    .collect();
  let notices = 0;
  for (const assignment of holders.filter((h) => !h.revokedAt && !h.ceaseContactAt)) {
    await ctx.db.patch(assignment._id, { ceaseContactAt: now });
    await ctx.db.insert("assignmentEvents", {
      assignmentId: assignment._id,
      leadId: lead._id,
      accountId: assignment.accountId,
      kind: "cease_contact",
      note: "Consumer withdrew consent — cease all contact",
      actorName: "Compliance",
      at: now,
    });
    await notifyAccount(ctx, {
      accountId: assignment.accountId,
      type: "compliance",
      title: "Cease contact — consent withdrawn",
      body: `The consumer for lead ${lead.reference} has withdrawn consent. Stop all calls, texts and emails immediately.`,
      link: `/agent/leads/${assignment._id}`,
      compliance: true,
      relatedLeadId: lead._id,
    });
    notices++;
  }

  await ctx.db.insert("consentWithdrawals", {
    leadId: lead._id,
    consentId: lead.consentId,
    method: input.method,
    requestedAt: now,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    note: input.note,
    processedBy: input.actor.kind === "user" ? input.actor.userId : undefined,
    ceaseContactNotices: notices,
  });
  await ctx.db.patch(lead._id, { status: "withdrawn", withdrawnAt: now, nextRetryAt: undefined });
  await writeAudit(ctx, input.actor, {
    action: "consent.withdrawn",
    entityType: "lead",
    entityId: lead._id,
    summary: `Consent withdrawn for lead ${lead.reference} via ${input.method.replace("_", " ")}; ${notices} cease-contact notice(s)`,
    metadata: { method: input.method, notices },
  });
  await notifyStaff(ctx, {
    type: "compliance",
    title: `Consent withdrawn — ${lead.reference}`,
    body: `${notices} current holder(s) told to cease contact.`,
    link: `/admin/leads/${lead._id}`,
    relatedLeadId: lead._id,
  });
  return { alreadyWithdrawn: false, notices };
}

/** Twilio inbound STOP (called from the HTTP action after signature validation). */
export const handleInboundSms = internalMutation({
  args: { from: v.string(), body: v.string() },
  handler: async (ctx, { from, body }) => {
    const phone = normalizeUsPhone(from);
    const keyword = body.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
    if (!phone) return { handled: false };
    const stopWords = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"]);
    if (!stopWords.has(keyword)) {
      if (keyword === "START" || keyword === "UNSTOP") {
        await writeAudit(ctx, SYSTEM_ACTOR, {
          action: "sms.start_received",
          entityType: "phone",
          entityId: phone.slice(-4),
          summary: "START received — suppression is NOT lifted automatically; review in the suppression register",
        });
      }
      return { handled: false };
    }
    await addSuppression(ctx, { channel: "phone", value: phone, reason: "sms_stop", actor: SYSTEM_ACTOR, note: "SMS STOP" });
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .collect();
    for (const lead of leads) {
      await withdrawLeadConsent(ctx, lead, { method: "sms_stop", actor: SYSTEM_ACTOR });
    }
    return { handled: true, leads: leads.length };
  },
});

// ─────────────────────────── admin register ───────────────────────────

export const list = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()), activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, { paginationOpts, search, activeOnly }) => {
    await requireStaff(ctx, "suppression.read");
    const term = search?.trim();
    if (term) {
      const phone = normalizeUsPhone(term);
      const email = normalizeEmail(term);
      const rows: Doc<"suppressionEntries">[] = [];
      if (phone) {
        rows.push(
          ...(await ctx.db
            .query("suppressionEntries")
            .withIndex("by_channel_value", (q) => q.eq("channel", "phone").eq("value", phone))
            .collect()),
        );
      }
      if (email) {
        rows.push(
          ...(await ctx.db
            .query("suppressionEntries")
            .withIndex("by_channel_value", (q) => q.eq("channel", "email").eq("value", email))
            .collect()),
        );
      }
      return { page: rows, isDone: true, continueCursor: "" };
    }
    if (activeOnly) {
      return await ctx.db
        .query("suppressionEntries")
        .withIndex("by_active", (q) => q.eq("active", true))
        .order("desc")
        .paginate(paginationOpts);
    }
    return await ctx.db.query("suppressionEntries").withIndex("by_createdAt").order("desc").paginate(paginationOpts);
  },
});

export const add = mutation({
  args: { contact: v.string(), note: v.string(), reason: v.union(v.literal("admin"), v.literal("complaint")) },
  handler: async (ctx, { contact, note, reason }) => {
    const staff = await requireStaff(ctx, "suppression.manage");
    const phone = normalizeUsPhone(contact);
    const email = normalizeEmail(contact);
    if (!phone && !email) throw invalid("Enter a valid US phone number or email address.");
    if (note.trim().length < 5) throw invalid("A note is required.");
    const actor = actorFromViewer(staff);
    const channel = phone ? "phone" : "email";
    const value = (phone ?? email)!;
    const id = await addSuppression(ctx, { channel, value, reason, note: note.trim(), actor });
    if (!id) throw invalid("That contact is already suppressed.");
    await writeAudit(ctx, actor, {
      action: "suppression.add",
      entityType: "suppression",
      entityId: id,
      summary: `Suppressed ${channel} ending ${value.slice(-4)}: ${note.trim()}`,
    });
    return id;
  },
});

export const lift = mutation({
  args: { entryId: v.id("suppressionEntries"), reason: v.string() },
  handler: async (ctx, { entryId, reason }) => {
    const staff = await requireStaff(ctx, "suppression.manage");
    const entry = await ctx.db.get(entryId);
    if (!entry) throw notFound("Suppression entry");
    if (!entry.active) throw invalid("This entry is already lifted.");
    if (reason.trim().length < 10) throw invalid("Explain why the suppression is being lifted (legal review required).");
    const actor = actorFromViewer(staff);
    await ctx.db.patch(entryId, { active: false, liftedAt: Date.now(), liftedBy: staff.userId, liftReason: reason.trim() });
    await writeAudit(ctx, actor, {
      action: "suppression.lift",
      entityType: "suppression",
      entityId: entryId,
      summary: `Lifted ${entry.channel} suppression ending ${entry.value.slice(-4)}: ${reason.trim()}`,
    });
  },
});
