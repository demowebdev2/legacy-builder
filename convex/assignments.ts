import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { roleHasPermission } from "../src/domain/permissions";
import { recipientTarget } from "../src/domain/distribution";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { refreshLeadAssignmentState, releaseLeadToAccount } from "./distribution/assignment";
import { runDistribution } from "./distribution/engine";
import { evaluateLead, scoreSnapshot, toEligibilityLead } from "./distribution/evaluate";
import { creditLeads, findLeadReturnCredit } from "./ledger";
import { currentLicenses, isLicenseUsable } from "./licenses";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, assertAccountWritable, canViewAssignment, requireAccountViewer, requireStaff } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { notifyAccount } from "./lib/notify";
import { loadDistributionSettings } from "./lib/settings";
import { assignmentStatusV } from "./lib/validators";
import { findActiveSuppression } from "./suppression";

// ─────────────────────────── agent work ───────────────────────────

export const updateStatus = mutation({
  args: { assignmentId: v.id("leadAssignments"), status: assignmentStatusV },
  handler: async (ctx, { assignmentId, status }) => {
    const viewer = await requireAccountViewer(ctx, "leads.work");
    assertAccountWritable(viewer.account, "Updating lead status");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || assignment.revokedAt || !canViewAssignment(viewer, assignment)) throw notFound("Lead");
    if (assignment.status === status) return;
    const now = Date.now();
    await ctx.db.patch(assignmentId, {
      status,
      statusUpdatedAt: now,
      contactedAt: assignment.contactedAt ?? (status !== "new" ? now : undefined),
    });
    await ctx.db.insert("assignmentEvents", {
      assignmentId,
      leadId: assignment.leadId,
      accountId: assignment.accountId,
      kind: "status",
      status,
      actorUserId: viewer.userId,
      actorName: viewer.name,
      at: now,
    });
  },
});

export const addNote = mutation({
  args: { assignmentId: v.id("leadAssignments"), note: v.string() },
  handler: async (ctx, { assignmentId, note }) => {
    const viewer = await requireAccountViewer(ctx, "leads.work");
    assertAccountWritable(viewer.account, "Adding notes");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || assignment.revokedAt || !canViewAssignment(viewer, assignment)) throw notFound("Lead");
    const text = note.trim();
    if (!text) throw invalid("Type a note first.");
    if (text.length > 2000) throw invalid("Notes are limited to 2,000 characters.");
    await ctx.db.insert("assignmentEvents", {
      assignmentId,
      leadId: assignment.leadId,
      accountId: assignment.accountId,
      kind: "note",
      note: text,
      actorUserId: viewer.userId,
      actorName: viewer.name,
      at: Date.now(),
    });
  },
});

/** Phase 1 agency handout: the principal gives a pooled lead to a verified producer licensed in the lead's state. */
export const handOut = mutation({
  args: { assignmentId: v.id("leadAssignments"), memberId: v.optional(v.id("agencyMembers")) },
  handler: async (ctx, { assignmentId, memberId }) => {
    const viewer = await requireAccountViewer(ctx, "leads.handout");
    assertAccountWritable(viewer.account, "Handing out leads");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || assignment.revokedAt || assignment.accountId !== viewer.account._id) throw notFound("Lead");
    if (assignment.ceaseContactAt) throw invalid("The consumer withdrew consent — this lead cannot be handed out.");
    const lead = (await ctx.db.get(assignment.leadId))!;
    let memberName = "the agency pool";
    if (memberId) {
      const member = await ctx.db.get(memberId);
      if (!member || member.accountId !== viewer.account._id) throw notFound("Seat");
      if (member.status !== "active" || member.seatRole === "billing_contact") throw invalid("That seat is not an active producer.");
      if (member.verificationStatus !== "verified") throw invalid(`${member.name} has not been verified yet.`);
      const licenses =
        member.seatRole === "principal"
          ? await currentLicenses(ctx, viewer.account._id)
          : await currentLicenses(ctx, viewer.account._id, member._id);
      if (!licenses.some((l) => l.state === lead.state && isLicenseUsable(l))) {
        throw invalid(`${member.name} does not hold a verified ${lead.state} licence.`);
      }
      memberName = member.name;
    }
    const now = Date.now();
    await ctx.db.patch(assignmentId, { producerMemberId: memberId, handedOutAt: memberId ? now : undefined, handedOutBy: memberId ? viewer.userId : undefined });
    await ctx.db.insert("assignmentEvents", {
      assignmentId,
      leadId: assignment.leadId,
      accountId: assignment.accountId,
      kind: "handout",
      note: memberId ? `Handed to ${memberName}` : "Returned to the agency pool",
      actorUserId: viewer.userId,
      actorName: viewer.name,
      at: now,
    });
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "assignment.handout",
      entityType: "leadAssignment",
      entityId: assignmentId,
      accountId: viewer.account._id,
      summary: `Lead ${lead.reference} ${memberId ? `handed to ${memberName}` : "returned to pool"}`,
    });
  },
});

// ─────────────────────────── staff ───────────────────────────

/** Every account evaluated against every rule (no short-circuit) so hard and soft failures are visible. */
export const manualCandidates = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    await requireStaff(ctx, "leads.manage");
    const lead = await ctx.db.get(leadId);
    if (!lead) return null;
    const { settings } = await loadDistributionSettings(ctx);
    const now = Date.now();
    const evaluation = await evaluateLead(ctx, await toEligibilityLead(ctx, lead), leadId, now, settings, { shortCircuit: false });
    const target = recipientTarget(lead.leadType, settings);
    const positions = new Map(evaluation.ranked.map((r, i) => [r.account._id, i + 1]));
    return {
      target,
      filled: evaluation.activeAssignments.length,
      candidates: evaluation.evaluated
        .map((e) => ({
          accountId: e.account._id,
          name: e.account.name,
          eligible: e.result.eligible,
          hardFailure: e.result.hardFailure,
          failures: e.result.trace.filter((t) => !t.pass).map((t) => ({ label: t.label, reason: t.reason ?? "" })),
          position: positions.get(e.account._id) ?? null,
          score: e.ranking?.score.total ?? null,
          balanceOfType: e.snapshot.balance[lead.leadType],
          waitedHours: e.snapshot.lastAssignedAt ? (now - e.snapshot.lastAssignedAt) / 3_600_000 : null,
        }))
        .sort((a, b) => Number(a.hardFailure) - Number(b.hardFailure) || (a.position ?? 999) - (b.position ?? 999)),
    };
  },
});

export const manualAssign = mutation({
  args: { leadId: v.id("leads"), accountId: v.id("accounts"), note: v.optional(v.string()) },
  handler: async (ctx, { leadId, accountId, note }) => {
    const staff = await requireStaff(ctx, "leads.manage");
    const lead = await ctx.db.get(leadId);
    if (!lead) throw notFound("Lead");
    if (!["queued", "unassigned_pending", "partially_assigned", "unassignable"].includes(lead.status)) {
      throw invalid(`A ${lead.status.replace(/_/g, " ")} lead cannot be assigned.`);
    }
    if (lead.withdrawnAt) throw invalid("The consumer withdrew consent.");
    if (await findActiveSuppression(ctx, { phone: lead.phone, email: lead.email })) throw invalid("This contact is suppressed.");
    const { settings, versionId } = await loadDistributionSettings(ctx);
    const now = Date.now();
    const evaluation = await evaluateLead(ctx, await toEligibilityLead(ctx, lead), leadId, now, settings, { shortCircuit: false });
    const target = recipientTarget(lead.leadType, settings);
    if (evaluation.activeAssignments.length >= target) {
      throw invalid(`This lead already has ${evaluation.activeAssignments.length} of ${target} recipient slots filled. Revoke one first.`);
    }
    const candidate = evaluation.evaluated.find((e) => e.account._id === accountId);
    if (!candidate) throw notFound("Account");
    // Hard compliance rules (licence, E&O, TPMO, balance, active status) are never bypassed.
    const hard = candidate.result.trace.filter((t) => !t.pass && HARD_KEYS.has(t.key));
    if (hard.length) throw invalid(`Cannot assign: ${hard.map((t) => t.reason).join("; ")}.`);
    const soft = candidate.result.trace.filter((t) => !t.pass && !HARD_KEYS.has(t.key));

    const actor = actorFromViewer(staff);
    const assignmentId = await releaseLeadToAccount(ctx, {
      lead,
      accountId,
      method: "manual",
      actor,
      now,
      disputeWindowHours: settings.disputeWindowHours,
      settingsVersionId: versionId,
      scoreSnapshot: candidate.ranking ? scoreSnapshot(candidate.ranking) : undefined,
    });
    await ctx.db.insert("distributionRuns", {
      leadId,
      trigger: "manual",
      startedAt: now,
      settingsVersionId: versionId ?? undefined,
      engineEnabled: settings.engineEnabled,
      slotsTarget: target,
      slotsFilledBefore: evaluation.activeAssignments.length,
      evaluatedCount: 1,
      eligibleCount: candidate.result.eligible ? 1 : 0,
      assignedCount: 1,
      outcome: evaluation.activeAssignments.length + 1 >= target ? "assigned" : "partial",
      reason: `Manual assignment to ${candidate.account.name}${soft.length ? ` (overrode: ${soft.map((s) => s.label).join(", ")})` : ""}${note ? ` — ${note}` : ""}`,
      actorUserId: staff.userId,
      trace: [
        {
          accountId,
          accountName: candidate.account.name,
          eligible: candidate.result.eligible,
          failedRule: candidate.result.failedRule?.label,
          rules: candidate.result.trace,
          score: candidate.ranking ? scoreSnapshot(candidate.ranking) : undefined,
          assigned: true,
        },
      ],
      traceTruncated: false,
    });
    await refreshLeadAssignmentState(ctx, leadId, now);
    return { assignmentId, overridden: soft.map((s) => s.label) };
  },
});

const HARD_KEYS = new Set(["account_status", "state_license", "eo_cover", "medicare_tpmo", "balance", "not_already_holding"]);

export const revoke = mutation({
  args: {
    assignmentId: v.id("leadAssignments"),
    reason: v.string(),
    returnLead: v.boolean(),
    requeue: v.boolean(),
  },
  handler: async (ctx, { assignmentId, reason, returnLead, requeue }) => {
    const staff = await requireStaff(ctx, "leads.manage");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment) throw notFound("Assignment");
    if (assignment.revokedAt) throw invalid("Already revoked.");
    if (reason.trim().length < 5) throw invalid("A reason is required.");
    if (returnLead && (await findLeadReturnCredit(ctx, assignmentId))) {
      throw invalid("This lead has already been returned to the balance (dispute upheld). Revoke it without returning the lead.");
    }
    const lead = (await ctx.db.get(assignment.leadId))!;
    const now = Date.now();
    const actor = actorFromViewer(staff);
    // The row is kept; revocation stamps it.
    await ctx.db.patch(assignmentId, { revokedAt: now, revokedBy: staff.userId, revokedReason: reason.trim(), ceaseContactAt: assignment.ceaseContactAt ?? now });
    await ctx.db.insert("assignmentEvents", {
      assignmentId,
      leadId: lead._id,
      accountId: assignment.accountId,
      kind: "revoked",
      note: reason.trim(),
      actorUserId: staff.userId,
      actorName: staff.name,
      at: now,
    });
    let returnEntryId: Id<"leadBalanceLedger"> | undefined;
    if (returnLead) {
      returnEntryId = await creditLeads(ctx, {
        accountId: assignment.accountId,
        leadType: assignment.leadType,
        quantity: 1,
        entryType: "REVOCATION_RETURN",
        reason: `Assignment of ${lead.reference} revoked — ${reason.trim()}`,
        source: "admin",
        actor,
        relatedLeadId: lead._id,
        relatedAssignmentId: assignmentId,
      });
    }
    await notifyAccount(ctx, {
      accountId: assignment.accountId,
      type: "compliance",
      title: "Lead withdrawn — cease contact",
      body: `Lead ${lead.reference} has been withdrawn: ${reason.trim()}. Please cease contact.${returnLead ? " One lead has been returned to your balance." : ""}`,
      link: "/agent/leads",
      compliance: true,
      relatedLeadId: lead._id,
    });
    await writeAudit(ctx, actor, {
      action: "assignment.revoke",
      entityType: "lead",
      entityId: lead._id,
      accountId: assignment.accountId,
      summary: `Revoked ${lead.reference} from account: ${reason.trim()}${returnLead ? " (lead returned)" : ""}`,
      metadata: { assignmentId, returnEntryId },
    });
    await refreshLeadAssignmentState(ctx, lead._id, now);
    let requeueResult = null;
    if (requeue) {
      const result = await runDistribution(ctx, lead._id, { trigger: "requeue", actor });
      requeueResult = { outcome: result.outcome, assigned: result.assigned.map((a) => a.accountName) };
    }
    return { requeue: requeueResult };
  },
});

export const log = query({
  args: { paginationOpts: paginationOptsValidator, accountId: v.optional(v.id("accounts")) },
  handler: async (ctx, { paginationOpts, accountId }) => {
    const staff = await requireStaff(ctx, "distribution.read");
    const canSeePii = roleHasPermission(staff.role, "leads.pii");
    const page = accountId
      ? await ctx.db.query("leadAssignments").withIndex("by_account_assignedAt", (q) => q.eq("accountId", accountId)).order("desc").paginate(paginationOpts)
      : await ctx.db.query("leadAssignments").withIndex("by_assignedAt").order("desc").paginate(paginationOpts);
    const rows = [];
    for (const a of page.page) {
      const lead = await ctx.db.get(a.leadId);
      const account = await ctx.db.get(a.accountId);
      rows.push({
        ...a,
        reference: lead?.reference ?? "—",
        consumerName: lead ? (canSeePii ? `${lead.firstName} ${lead.lastName}` : `${lead.firstName.charAt(0)}. ${lead.lastName.charAt(0)}.`) : "—",
        coverageType: lead?.coverageType ?? "",
        accountName: account?.name ?? "—",
      });
    }
    return { ...page, page: rows };
  },
});

