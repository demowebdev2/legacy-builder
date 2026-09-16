import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { DISPUTE_REASONS } from "../src/domain/constants";
import { isWithinDisputeWindow } from "../src/domain/distribution";
import { roleHasPermission } from "../src/domain/permissions";
import { DAY, HOUR } from "../src/domain/time";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx, query } from "./_generated/server";
import { creditLeads, findLeadReturnCredit } from "./ledger";
import { writeAudit } from "./lib/audit";
import { type Actor, actorFromViewer, assertAccountWritable, canViewAssignment, requireAccountViewer, requireStaff, SYSTEM_ACTOR } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { notifyAccount, notifyStaff } from "./lib/notify";
import { loadDistributionSettings } from "./lib/settings";
import { disputeReasonV } from "./lib/validators";

/**
 * 72-hour dispute window from release. Upheld → a compensating DISPUTE_RETURN credit of the same lead
 * type. The original ASSIGNMENT debit is never edited or deleted.
 */

const reasonLabel = (key: string) => DISPUTE_REASONS.find((r) => r.key === key)?.label ?? key;

async function upholdDispute(ctx: MutationCtx, dispute: Doc<"disputes">, notes: string, actor: Actor, auto: boolean) {
  const lead = await ctx.db.get(dispute.leadId);
  const now = Date.now();
  if (await findLeadReturnCredit(ctx, dispute.assignmentId)) {
    throw invalid("This lead has already been returned to the balance (assignment revoked with return). Reject the dispute instead.");
  }
  const entryId = await creditLeads(ctx, {
    accountId: dispute.accountId,
    leadType: dispute.leadType,
    quantity: 1,
    entryType: "DISPUTE_RETURN",
    reason: `Dispute ${auto ? "auto-" : ""}upheld — ${reasonLabel(dispute.reason)} (${lead?.reference ?? "lead"})`,
    source: auto ? "system" : "admin",
    actor,
    relatedLeadId: dispute.leadId,
    relatedAssignmentId: dispute.assignmentId,
    relatedDisputeId: dispute._id,
  });
  await ctx.db.patch(dispute._id, {
    status: "upheld",
    decisionNotes: notes,
    decidedAt: now,
    decidedBy: actor.kind === "user" ? actor.userId : undefined,
    decidedByName: actor.kind === "user" ? actor.name : "System (auto-uphold)",
    autoDecided: auto,
    returnLedgerEntryId: entryId,
  });
  await notifyAccount(ctx, {
    accountId: dispute.accountId,
    type: "dispute",
    title: "Dispute upheld",
    body: `One ${dispute.leadType} lead has been returned to your balance for ${lead?.reference ?? "the lead"}. ${notes}`,
    link: `/agent/disputes/${dispute._id}`,
  });
  await writeAudit(ctx, actor, {
    action: auto ? "dispute.auto_uphold" : "dispute.uphold",
    entityType: "dispute",
    entityId: dispute._id,
    accountId: dispute.accountId,
    summary: `Dispute on ${lead?.reference} upheld (${reasonLabel(dispute.reason)}): ${notes}`,
    metadata: { ledgerEntryId: entryId },
  });
}

/**
 * Auto-uphold only when the system itself can verify the claim (assumption D11):
 *  - duplicate: the same account already holds another lead with the same phone/email in the dedup window
 *  - out_of_area: no verified licence for the lead state existed at the moment of release
 */
async function autoUpholdReason(ctx: MutationCtx, dispute: Doc<"disputes">, assignment: Doc<"leadAssignments">, lead: Doc<"leads">) {
  if (dispute.reason === "duplicate") {
    const { settings } = await loadDistributionSettings(ctx);
    const since = assignment.assignedAt - settings.dedupWindowDays * DAY;
    const others = await ctx.db
      .query("leadAssignments")
      .withIndex("by_account_assignedAt", (q) => q.eq("accountId", assignment.accountId).gte("assignedAt", since))
      .collect();
    for (const other of others) {
      if (other._id === assignment._id || other.revokedAt) continue;
      const otherLead = await ctx.db.get(other.leadId);
      if (otherLead && otherLead._id !== lead._id && (otherLead.phone === lead.phone || otherLead.email === lead.email)) {
        return `System check: you already held ${otherLead.reference} for the same consumer.`;
      }
    }
  }
  if (dispute.reason === "out_of_area") {
    const licenses = await ctx.db
      .query("licenses")
      .withIndex("by_account_state", (q) => q.eq("accountId", assignment.accountId).eq("state", lead.state))
      .collect();
    const coveredAtRelease = licenses.some(
      (l) => !l.memberId && l.verifiedAt != null && l.verifiedAt <= assignment.assignedAt && l.expiresAt > assignment.assignedAt && l.verificationStatus !== "failed",
    );
    if (!coveredAtRelease) return `System check: no verified ${lead.state} licence was in force at release — a distribution fault.`;
  }
  return null;
}

export const submit = mutation({
  args: { assignmentId: v.id("leadAssignments"), reason: disputeReasonV, details: v.optional(v.string()) },
  handler: async (ctx, { assignmentId, reason, details }) => {
    const viewer = await requireAccountViewer(ctx, "dispute");
    assertAccountWritable(viewer.account, "Raising disputes");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || assignment.revokedAt || !canViewAssignment(viewer, assignment)) throw notFound("Lead");
    const now = Date.now();
    if (now > assignment.disputeDeadlineAt || !isWithinDisputeWindow(assignment.assignedAt, now, (assignment.disputeDeadlineAt - assignment.assignedAt) / HOUR)) {
      throw invalid("The dispute window for this lead has closed.");
    }
    const existing = await ctx.db.query("disputes").withIndex("by_assignment", (q) => q.eq("assignmentId", assignmentId)).unique();
    if (existing) throw invalid("A dispute has already been raised on this lead.");
    const text = details?.trim();
    if (text && text.length > 2000) throw invalid("Please keep the details under 2,000 characters.");
    const lead = (await ctx.db.get(assignment.leadId))!;
    const disputeId = await ctx.db.insert("disputes", {
      assignmentId,
      leadId: assignment.leadId,
      accountId: assignment.accountId,
      leadType: assignment.leadType,
      reason,
      details: text || undefined,
      submittedAt: now,
      submittedBy: viewer.userId,
      status: "pending",
      autoDecided: false,
    });
    await ctx.db.insert("assignmentEvents", {
      assignmentId,
      leadId: assignment.leadId,
      accountId: assignment.accountId,
      kind: "dispute",
      note: `Dispute raised: ${reasonLabel(reason)}`,
      actorUserId: viewer.userId,
      actorName: viewer.name,
      at: now,
    });
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "dispute.submit",
      entityType: "dispute",
      entityId: disputeId,
      accountId: viewer.account._id,
      summary: `Dispute raised on ${lead.reference}: ${reasonLabel(reason)}`,
    });
    const dispute = (await ctx.db.get(disputeId))!;
    const autoNote = await autoUpholdReason(ctx, dispute, assignment, lead);
    if (autoNote) {
      await upholdDispute(ctx, dispute, autoNote, SYSTEM_ACTOR, true);
      return { disputeId, status: "upheld" as const };
    }
    await notifyStaff(ctx, {
      type: "dispute",
      title: `Dispute — ${lead.reference}`,
      body: `${viewer.account.name}: ${reasonLabel(reason)}.`,
      link: `/admin/disputes/${disputeId}`,
      relatedLeadId: lead._id,
    });
    return { disputeId, status: "pending" as const };
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "dispute");
    const rows = await ctx.db.query("disputes").withIndex("by_account", (q) => q.eq("accountId", viewer.account._id)).order("desc").collect();
    const visible = [];
    for (const d of rows) {
      const assignment = await ctx.db.get(d.assignmentId);
      if (!assignment || !canViewAssignment(viewer, assignment)) continue;
      const lead = await ctx.db.get(d.leadId);
      visible.push({ ...d, reference: lead?.reference ?? "—", consumerName: lead ? `${lead.firstName} ${lead.lastName}` : "—" });
    }
    const upheld = visible.filter((d) => d.status === "upheld").length;
    return {
      rows: visible,
      stats: {
        total: visible.length,
        upheld,
        pending: visible.filter((d) => d.status === "pending").length,
        upheldRate: visible.length ? Math.round((upheld / visible.length) * 100) : 0,
      },
    };
  },
});

export const myDispute = query({
  args: { disputeId: v.id("disputes") },
  handler: async (ctx, { disputeId }) => {
    const viewer = await requireAccountViewer(ctx, "dispute");
    const dispute = await ctx.db.get(disputeId);
    if (!dispute) return null;
    const assignment = await ctx.db.get(dispute.assignmentId);
    if (!assignment || !canViewAssignment(viewer, assignment)) return null;
    const lead = await ctx.db.get(dispute.leadId);
    const entry = dispute.returnLedgerEntryId ? await ctx.db.get(dispute.returnLedgerEntryId) : null;
    return {
      dispute,
      reasonLabel: reasonLabel(dispute.reason),
      reference: lead?.reference ?? "—",
      consumerName: lead ? `${lead.firstName} ${lead.lastName}` : "—",
      assignedAt: assignment.assignedAt,
      returnEntry: entry,
    };
  },
});

// ─────────────────────────── staff ───────────────────────────

export const adminList = query({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(v.union(v.literal("pending"), v.literal("upheld"), v.literal("rejected"))) },
  handler: async (ctx, { paginationOpts, status }) => {
    const staff = await requireStaff(ctx, "disputes.read");
    const canSeePii = roleHasPermission(staff.role, "leads.pii");
    const page = status
      ? await ctx.db.query("disputes").withIndex("by_status", (q) => q.eq("status", status)).order("desc").paginate(paginationOpts)
      : await ctx.db.query("disputes").order("desc").paginate(paginationOpts);
    const now = Date.now();
    const rows = [];
    for (const d of page.page) {
      const lead = await ctx.db.get(d.leadId);
      const account = await ctx.db.get(d.accountId);
      rows.push({
        ...d,
        reasonLabel: reasonLabel(d.reason),
        reference: lead?.reference ?? "—",
        leadId: d.leadId,
        consumerName: lead ? (canSeePii ? `${lead.firstName} ${lead.lastName}` : `${lead.firstName.charAt(0)}. ${lead.lastName.charAt(0)}.`) : "—",
        accountName: account?.name ?? "—",
        slaRisk: d.status === "pending" && now - d.submittedAt > 40 * HOUR,
      });
    }
    return { ...page, page: rows };
  },
});

export const counts = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "disputes.read");
    const all = await ctx.db.query("disputes").collect();
    return {
      pending: all.filter((d) => d.status === "pending").length,
      upheld: all.filter((d) => d.status === "upheld").length,
      rejected: all.filter((d) => d.status === "rejected").length,
      all: all.length,
    };
  },
});

export const adminGet = query({
  args: { disputeId: v.id("disputes") },
  handler: async (ctx, { disputeId }) => {
    const staff = await requireStaff(ctx, "disputes.read");
    const dispute = await ctx.db.get(disputeId);
    if (!dispute) return null;
    const canSeePii = roleHasPermission(staff.role, "leads.pii");
    const lead = await ctx.db.get(dispute.leadId);
    const account = await ctx.db.get(dispute.accountId);
    const assignment = await ctx.db.get(dispute.assignmentId);
    const accountDisputes = await ctx.db.query("disputes").withIndex("by_account", (q) => q.eq("accountId", dispute.accountId)).collect();
    const accountAssignments = await ctx.db.query("leadAssignments").withIndex("by_account_assignedAt", (q) => q.eq("accountId", dispute.accountId)).collect();
    const live = accountAssignments.filter((a) => !a.revokedAt).length;
    return {
      dispute,
      reasonLabel: reasonLabel(dispute.reason),
      lead: lead
        ? {
            id: lead._id,
            reference: lead.reference,
            name: canSeePii ? `${lead.firstName} ${lead.lastName}` : `${lead.firstName.charAt(0)}. ${lead.lastName.charAt(0)}.`,
            state: lead.state,
            coverageType: lead.coverageType,
            leadType: lead.leadType,
            capturedAt: lead.capturedAt,
            duplicateOfLeadId: lead.duplicateOfLeadId ?? null,
          }
        : null,
      account: account ? { id: account._id, name: account.name } : null,
      assignment,
      accountDisputeRate: { disputes: accountDisputes.length, assignments: live, percent: live ? Math.round((accountDisputes.length / live) * 100) : 0 },
    };
  },
});

export const decide = mutation({
  args: { disputeId: v.id("disputes"), decision: v.union(v.literal("upheld"), v.literal("rejected")), notes: v.string() },
  handler: async (ctx, { disputeId, decision, notes }) => {
    const staff = await requireStaff(ctx, "disputes.decide");
    const dispute = await ctx.db.get(disputeId);
    if (!dispute) throw notFound("Dispute");
    if (dispute.status !== "pending") throw invalid("This dispute has already been decided.");
    const text = notes.trim();
    if (text.length < 5) throw invalid("Every decision needs a reason the agent can read.");
    const actor = actorFromViewer(staff);
    if (decision === "upheld") {
      await upholdDispute(ctx, dispute, text, actor, false);
      return;
    }
    const lead = await ctx.db.get(dispute.leadId);
    await ctx.db.patch(disputeId, { status: "rejected", decisionNotes: text, decidedAt: Date.now(), decidedBy: staff.userId, decidedByName: staff.name });
    await notifyAccount(ctx, {
      accountId: dispute.accountId,
      type: "dispute",
      title: "Dispute rejected",
      body: `${lead?.reference ?? "The lead"} stands: ${text}`,
      link: `/agent/disputes/${disputeId}`,
    });
    await writeAudit(ctx, actor, {
      action: "dispute.reject",
      entityType: "dispute",
      entityId: disputeId,
      accountId: dispute.accountId,
      summary: `Dispute on ${lead?.reference} rejected: ${text}`,
    });
  },
});
