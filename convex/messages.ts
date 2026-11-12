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
/** Per thread, per side — a cap, not a rate limiter; the thread is already token- or account-gated. */
const MAX_MESSAGES_PER_THREAD = 500;

function cleanBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw invalid("Type a message first.");
  if (trimmed.length > MAX_BODY) throw invalid(`Keep messages under ${MAX_BODY} characters.`);
  return trimmed;
}

async function threadFor(ctx: QueryCtx, assignmentId: Id<"leadAssignments">) {
  return await ctx.db
    .query("leadMessages")
    .withIndex("by_assignment", (q) => q.eq("assignmentId", assignmentId))
    .collect();
}

const shape = (m: Doc<"leadMessages">) => ({
  id: m._id,
  fromAgent: m.fromAgent,
  senderName: m.senderName,
  body: m.body,
  createdAt: m.createdAt,
});

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
  input: { fromAgent: boolean; senderName: string; senderUserId?: Id<"users">; body: string },
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
      messages: (await threadFor(ctx, assignmentId)).map(shape),
      closed: closedReason(lead, assignment),
      consumerName: lead.firstName,
    };
  },
});

export const agentSend = mutation({
  args: { assignmentId: v.id("leadAssignments"), body: v.string() },
  handler: async (ctx, { assignmentId, body }) => {
    const viewer = await requireAccountViewer(ctx, "leads.work");
    assertAccountWritable(viewer.account, "Messaging consumers");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || !canViewAssignment(viewer, assignment)) throw notFound("Lead");
    const lead = await ctx.db.get(assignment.leadId);
    if (!lead) throw notFound("Lead");
    const closed = closedReason(lead, assignment);
    if (closed) throw invalid(closed);
    await insert(ctx, assignment, {
      fromAgent: true,
      senderName: viewer.account.businessName || viewer.account.name,
      senderUserId: viewer.userId,
      body: cleanBody(body),
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
        messages: (await threadFor(ctx, assignment._id)).map(shape),
      });
    }
    return threads;
  },
});

export const consumerSend = mutation({
  args: { reference: v.string(), token: v.string(), assignmentId: v.id("leadAssignments"), body: v.string() },
  handler: async (ctx, { reference, token, assignmentId, body }) => {
    const lead = await consumerLead(ctx, reference, token);
    if (!lead) throw notFound("Request");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || assignment.leadId !== lead._id) throw notFound("Conversation");
    const closed = closedReason(lead, assignment);
    if (closed) throw invalid(closed);
    const clean = cleanBody(body);
    await insert(ctx, assignment, { fromAgent: false, senderName: lead.firstName, body: clean });
    await notifyAccount(ctx, {
      accountId: assignment.accountId,
      type: "lead",
      title: `New message from ${lead.firstName} ${lead.lastName.slice(0, 1)}.`,
      body: clean.length > 140 ? `${clean.slice(0, 140)}…` : clean,
      link: `/agent/leads/${assignmentId}`,
      relatedLeadId: lead._id,
    });
  },
});
