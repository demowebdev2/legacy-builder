import { v } from "convex/values";
import { normalizeLeadReference, sha256Hex } from "../src/domain/reference";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, type QueryCtx, query } from "./_generated/server";
import { assertAccountWritable, canViewAssignment, requireAccountViewer } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { notifyAccount } from "./lib/notify";

/**
 * One chat thread per lead assignment: the agent holding it and the consumer who submitted the lead.
 * Reactive queries give both sides live updates. The consumer is authenticated by the reference +
 * one-time token from their confirmation link, the same pair `intake.confirmation` checks.
 */

export const MAX_BODY = 2000;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
/** Per thread, per side — a cap, not a rate limiter; the thread is already token- or account-gated. */
const MAX_MESSAGES_PER_THREAD = 500;

function cleanBody(body: string, hasAttachment: boolean): string {
  const trimmed = body.trim();
  if (!trimmed && !hasAttachment) throw invalid("Type a message first.");
  if (trimmed.length > MAX_BODY) throw invalid(`Keep messages under ${MAX_BODY} characters.`);
  return trimmed;
}

/**
 * Size always comes from the stored file, never the client. The type comes from the stored metadata
 * when present, falling back to the declared one — both ultimately come from the upload request, so
 * neither is more trusted; the allowlist is what keeps anything but images and PDFs out.
 */
async function checkedAttachment(
  ctx: MutationCtx,
  storageId: Id<"_storage"> | undefined,
  name: string | undefined,
  declaredType: string | undefined,
) {
  if (!storageId) return undefined;
  const meta = await ctx.db.system.get(storageId);
  if (!meta) throw invalid("That file is no longer available. Please attach it again.");
  // No cleanup of a rejected upload here: this mutation throws, and that rolls the delete back with it.
  if (meta.size > MAX_ATTACHMENT_BYTES) throw invalid("Images must be 10 MB or smaller.");
  const type = meta.contentType ?? declaredType ?? "";
  if (!ALLOWED_ATTACHMENT_TYPES.includes(type)) throw invalid("Only image files can be attached.");
  return { storageId, name: (name ?? "attachment").trim().slice(0, 120) || "attachment", type, size: meta.size };
}

async function threadFor(ctx: QueryCtx, assignmentId: Id<"leadAssignments">) {
  return await ctx.db
    .query("leadMessages")
    .withIndex("by_assignment", (q) => q.eq("assignmentId", assignmentId))
    .collect();
}

async function shape(ctx: QueryCtx, m: Doc<"leadMessages">) {
  return {
    id: m._id,
    fromAgent: m.fromAgent,
    senderName: m.senderName,
    body: m.body,
    createdAt: m.createdAt,
    attachment: m.attachment
      ? { name: m.attachment.name, type: m.attachment.type, size: m.attachment.size, url: await ctx.storage.getUrl(m.attachment.storageId) }
      : null,
  };
}

const shapeAll = async (ctx: QueryCtx, rows: Doc<"leadMessages">[]) => await Promise.all(rows.map((m) => shape(ctx, m)));

/** Closed when the lead is withdrawn, the assignment revoked, or a cease-contact notice landed. */
function closedReason(lead: Doc<"leads">, assignment: Doc<"leadAssignments">): string | null {
  if (lead.withdrawnAt) return "This conversation is closed because consent was withdrawn.";
  if (assignment.revokedAt) return "This lead is no longer assigned, so the conversation is closed.";
  if (assignment.ceaseContactAt) return "The consumer asked not to be contacted, so the conversation is closed.";
  return null;
}

async function insert(
  ctx: MutationCtx,
  assignment: Doc<"leadAssignments">,
  input: {
    fromAgent: boolean;
    senderName: string;
    senderUserId?: Id<"users">;
    body: string;
    attachment?: { storageId: Id<"_storage">; name: string; type: string; size: number };
  },
) {
  const existing = await threadFor(ctx, assignment._id);
  if (existing.length >= MAX_MESSAGES_PER_THREAD) throw invalid("This conversation has reached its message limit.");
  return await ctx.db.insert("leadMessages", {
    assignmentId: assignment._id,
    leadId: assignment.leadId,
    fromAgent: input.fromAgent,
    senderName: input.senderName,
    senderUserId: input.senderUserId,
    body: input.body,
    attachment: input.attachment,
    createdAt: Date.now(),
  });
}

// ─────────────────────────── agent side ───────────────────────────

export const agentThread = query({
  args: { assignmentId: v.id("leadAssignments") },
  handler: async (ctx, { assignmentId }) => {
    const viewer = await requireAccountViewer(ctx, "leads.read");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || !canViewAssignment(viewer, assignment)) return null;
    const lead = await ctx.db.get(assignment.leadId);
    if (!lead) return null;
    return {
      messages: await shapeAll(ctx, await threadFor(ctx, assignmentId)),
      closed: closedReason(lead, assignment),
      consumerName: lead.firstName,
    };
  },
});

export const agentUploadUrl = mutation({
  args: { assignmentId: v.id("leadAssignments") },
  handler: async (ctx, { assignmentId }) => {
    const viewer = await requireAccountViewer(ctx, "leads.work");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || !canViewAssignment(viewer, assignment)) throw notFound("Lead");
    return await ctx.storage.generateUploadUrl();
  },
});

export const agentSend = mutation({
  args: {
    assignmentId: v.id("leadAssignments"),
    body: v.string(),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    attachmentType: v.optional(v.string()),
  },
  handler: async (ctx, { assignmentId, body, attachmentId, attachmentName, attachmentType }) => {
    const viewer = await requireAccountViewer(ctx, "leads.work");
    assertAccountWritable(viewer.account, "Messaging consumers");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || !canViewAssignment(viewer, assignment)) throw notFound("Lead");
    const lead = await ctx.db.get(assignment.leadId);
    if (!lead) throw notFound("Lead");
    const closed = closedReason(lead, assignment);
    if (closed) throw invalid(closed);
    const attachment = await checkedAttachment(ctx, attachmentId, attachmentName, attachmentType);
    await insert(ctx, assignment, {
      fromAgent: true,
      senderName: viewer.account.businessName || viewer.account.name,
      senderUserId: viewer.userId,
      body: cleanBody(body, !!attachment),
      attachment,
    });
  },
});

// ─────────────────────────── consumer side ───────────────────────────

async function consumerLead(ctx: QueryCtx, reference: string, token: string) {
  const lead = await ctx.db
    .query("leads")
    .withIndex("by_reference", (q) => q.eq("reference", normalizeLeadReference(reference)))
    .unique();
  if (!lead?.confirmationTokenHash || lead.confirmationTokenHash !== (await sha256Hex(token))) return null;
  return lead;
}

/** One thread per agent currently holding the lead. */
export const consumerThreads = query({
  args: { reference: v.string(), token: v.string() },
  handler: async (ctx, { reference, token }) => {
    const lead = await consumerLead(ctx, reference, token);
    if (!lead) return null;
    const assignments = await ctx.db
      .query("leadAssignments")
      .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
      .collect();
    const threads = [];
    for (const assignment of assignments.filter((a) => !a.revokedAt)) {
      const account = await ctx.db.get(assignment.accountId);
      if (!account) continue;
      threads.push({
        assignmentId: assignment._id,
        agentName: account.businessName || account.name,
        closed: closedReason(lead, assignment),
        messages: await shapeAll(ctx, await threadFor(ctx, assignment._id)),
      });
    }
    return threads;
  },
});

export const consumerUploadUrl = mutation({
  args: { reference: v.string(), token: v.string() },
  handler: async (ctx, { reference, token }) => {
    if (!(await consumerLead(ctx, reference, token))) throw notFound("Request");
    return await ctx.storage.generateUploadUrl();
  },
});

export const consumerSend = mutation({
  args: {
    reference: v.string(),
    token: v.string(),
    assignmentId: v.id("leadAssignments"),
    body: v.string(),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    attachmentType: v.optional(v.string()),
  },
  handler: async (ctx, { reference, token, assignmentId, body, attachmentId, attachmentName, attachmentType }) => {
    const lead = await consumerLead(ctx, reference, token);
    if (!lead) throw notFound("Request");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || assignment.leadId !== lead._id) throw notFound("Conversation");
    const closed = closedReason(lead, assignment);
    if (closed) throw invalid(closed);
    const attachment = await checkedAttachment(ctx, attachmentId, attachmentName, attachmentType);
    const clean = cleanBody(body, !!attachment);
    await insert(ctx, assignment, { fromAgent: false, senderName: lead.firstName, body: clean, attachment });
    await notifyAccount(ctx, {
      accountId: assignment.accountId,
      type: "lead",
      title: `New message from ${lead.firstName} ${lead.lastName.slice(0, 1)}.`,
      body: clean ? (clean.length > 140 ? `${clean.slice(0, 140)}…` : clean) : "Sent a photo.",
      link: `/agent/leads/${assignmentId}`,
      relatedLeadId: lead._id,
    });
  },
});
