import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { roleHasPermission } from "../src/domain/permissions";
import { maskEmail, maskPhone, normalizeEmail, normalizeName, normalizeStateCode, normalizeUsPhone, normalizeZip } from "../src/domain/normalize";
import { sha256Hex } from "../src/domain/reference";
import { DAY } from "../src/domain/time";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { runDistribution } from "./distribution/engine";
import { ingestLead } from "./intake";
import { getBalanceDoc } from "./ledger";
import { writeAudit } from "./lib/audit";
import { type AccountViewer, actorFromViewer, canViewAssignment, requireAccountViewer, requireStaff } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { loadCoverageTypes, loadDistributionSettings } from "./lib/settings";
import { withdrawLeadConsent } from "./suppression";
import { leadStatusV, leadTypeV } from "./lib/validators";

type Ctx = QueryCtx | MutationCtx;

async function coverageNames(ctx: Ctx): Promise<Map<string, string>> {
  return new Map((await loadCoverageTypes(ctx, true)).map((c) => [c.key, c.name]));
}

// ─────────────────────────── agent ───────────────────────────

const AGENT_SCAN_LIMIT = 1000;

async function visibleAssignments(ctx: Ctx, viewer: AccountViewer) {
  const rows = await ctx.db
    .query("leadAssignments")
    .withIndex("by_account_assignedAt", (q) => q.eq("accountId", viewer.account._id))
    .order("desc")
    .take(AGENT_SCAN_LIMIT);
  return rows.filter((a) => !a.revokedAt && canViewAssignment(viewer, a));
}

export const myLeads = query({
  args: {
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    coverageType: v.optional(v.string()),
    state: v.optional(v.string()),
    leadType: v.optional(leadTypeV),
    handout: v.optional(v.union(v.literal("pool"), v.literal("handed"))),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await requireAccountViewer(ctx, "leads.read");
    const assignments = await visibleAssignments(ctx, viewer);
    const names = await coverageNames(ctx);
    const joined = [];
    for (const a of assignments) {
      const lead = await ctx.db.get(a.leadId);
      if (lead) joined.push({ a, lead });
    }
    const counts: Record<string, number> = { all: joined.length, new: 0, contacted: 0, qualified: 0, sold: 0, lost: 0 };
    for (const { a } of joined) counts[a.status] = (counts[a.status] ?? 0) + 1;

    const q = args.search?.trim().toLowerCase();
    const filtered = joined.filter(({ a, lead }) => {
      if (args.status && args.status !== "all" && a.status !== args.status) return false;
      if (args.coverageType && lead.coverageType !== args.coverageType) return false;
      if (args.state && lead.state !== args.state) return false;
      if (args.leadType && lead.leadType !== args.leadType) return false;
      if (args.handout === "pool" && a.producerMemberId) return false;
      if (args.handout === "handed" && !a.producerMemberId) return false;
      if (q) {
        const hay = `${lead.firstName} ${lead.lastName} ${lead.reference} ${lead.city ?? ""} ${lead.phone} ${lead.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const offset = Math.max(0, Math.trunc(args.offset ?? 0));
    const limit = Math.min(Math.max(1, Math.trunc(args.limit ?? 25)), 100);
    const page = filtered.slice(offset, offset + limit).map(({ a, lead }) => ({
      assignmentId: a._id,
      status: a.status,
      assignedAt: a.assignedAt,
      openedAt: a.openedAt ?? null,
      ceaseContact: !!a.ceaseContactAt,
      producerMemberId: a.producerMemberId ?? null,
      reference: lead.reference,
      name: `${lead.firstName} ${lead.lastName}`,
      coverageType: lead.coverageType,
      coverageName: names.get(lead.coverageType) ?? lead.coverageType,
      coverageAmount: lead.coverageAmount ?? null,
      city: lead.city ?? null,
      state: lead.state,
      leadType: a.leadType,
    }));
    return { page, total: filtered.length, counts, offset, limit, states: [...new Set(joined.map((j) => j.lead.state))].sort() };
  },
});

export const myLead = query({
  args: { assignmentId: v.id("leadAssignments") },
  handler: async (ctx, { assignmentId }) => {
    const viewer = await requireAccountViewer(ctx, "leads.read");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || assignment.revokedAt || !canViewAssignment(viewer, assignment)) return { forbidden: true as const };
    const lead = await ctx.db.get(assignment.leadId);
    if (!lead) return { forbidden: true as const };
    const consent = lead.consentId ? await ctx.db.get(lead.consentId) : null;
    const consentDoc = consent?.legalDocumentId ? await ctx.db.get(consent.legalDocumentId) : null;
    const events = await ctx.db
      .query("assignmentEvents")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", assignmentId))
      .order("desc")
      .collect();
    const dispute = await ctx.db
      .query("disputes")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", assignmentId))
      .unique();
    const balance = await getBalanceDoc(ctx, viewer.account._id);
    const names = await coverageNames(ctx);
    const allHolders = await ctx.db
      .query("leadAssignments")
      .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
      .collect();
    const otherHolders = allHolders.filter((h) => !h.revokedAt && h.accountId !== viewer.account._id).length;
    const producer = assignment.producerMemberId ? await ctx.db.get(assignment.producerMemberId) : null;
    const ceased = !!assignment.ceaseContactAt;

    return {
      forbidden: false as const,
      assignment: {
        id: assignment._id,
        status: assignment.status,
        assignedAt: assignment.assignedAt,
        method: assignment.method,
        openedAt: assignment.openedAt ?? null,
        contactedAt: assignment.contactedAt ?? null,
        disputeDeadlineAt: assignment.disputeDeadlineAt,
        ceaseContactAt: assignment.ceaseContactAt ?? null,
        leadType: assignment.leadType,
        producerMemberId: assignment.producerMemberId ?? null,
        producerName: producer?.name ?? null,
      },
      lead: {
        reference: lead.reference,
        firstName: lead.firstName,
        lastName: lead.lastName,
        // After a cease-contact notice the agent keeps the record but not the means to contact.
        phone: ceased ? maskPhone(lead.phone) : lead.phone,
        email: ceased ? maskEmail(lead.email) : lead.email,
        state: lead.state,
        zip: lead.zip,
        city: lead.city ?? null,
        coverageType: lead.coverageType,
        coverageName: names.get(lead.coverageType) ?? lead.coverageType,
        coverageUndetermined: lead.coverageUndetermined,
        coverageAmount: lead.coverageAmount ?? null,
        protecting: lead.protecting ?? null,
        ageRange: lead.ageRange ?? null,
        budgetRange: lead.budgetRange ?? null,
        reason: lead.reason,
        bestTimeToCall: lead.bestTimeToCall ?? null,
        preferredContactMethod: lead.preferredContactMethod ?? null,
        capturedAt: lead.capturedAt,
        withdrawn: !!lead.withdrawnAt,
      },
      consent: consent
        ? {
            versionLabel: consent.versionLabel,
            agreedAt: consent.agreedAt,
            ipAddress: consent.ipAddress ?? null,
            pageUrl: consent.pageUrl ?? null,
            userAgent: consent.userAgent ?? null,
            contentHash: consent.contentHash,
            method: consent.method,
            wording: consentDoc?.content ?? consent.evidence ?? null,
            wordingTitle: consentDoc ? `${consentDoc.title} — version ${consentDoc.version}` : consent.versionLabel,
            publishedAt: consentDoc?.publishedAt ?? null,
          }
        : null,
      events: events.map((e) => ({ kind: e.kind, status: e.status ?? null, note: e.note ?? null, actorName: e.actorName, at: e.at })),
      dispute,
      balanceOfType: balance ? balance[assignment.leadType] : 0,
      otherHolders,
      canHandOut: viewer.role === "AGENCY_PRINCIPAL",
      now: Date.now(),
    };
  },
});

export const markOpened = mutation({
  args: { assignmentId: v.id("leadAssignments") },
  handler: async (ctx, { assignmentId }) => {
    const viewer = await requireAccountViewer(ctx, "leads.read");
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment || !canViewAssignment(viewer, assignment) || assignment.openedAt) return;
    const now = Date.now();
    await ctx.db.patch(assignmentId, { openedAt: now });
    await ctx.db.insert("assignmentEvents", {
      assignmentId,
      leadId: assignment.leadId,
      accountId: assignment.accountId,
      kind: "opened",
      actorUserId: viewer.userId,
      actorName: viewer.name,
      at: now,
    });
  },
});

// ─────────────────────────── staff ───────────────────────────

function piiView(lead: Doc<"leads">, canSeePii: boolean) {
  return {
    name: canSeePii ? `${lead.firstName} ${lead.lastName}` : `${lead.firstName.charAt(0)}. ${lead.lastName.charAt(0)}.`,
    phone: canSeePii ? lead.phone : maskPhone(lead.phone),
    email: canSeePii ? lead.email : maskEmail(lead.email),
  };
}

async function holderNames(ctx: Ctx, leadId: Id<"leads">) {
  const rows = await ctx.db
    .query("leadAssignments")
    .withIndex("by_lead", (q) => q.eq("leadId", leadId))
    .collect();
  const out: string[] = [];
  for (const r of rows.filter((x) => !x.revokedAt)) out.push((await ctx.db.get(r.accountId))?.name ?? "—");
  return out;
}

export const adminList = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(leadStatusV),
    coverageType: v.optional(v.string()),
    state: v.optional(v.string()),
    leadType: v.optional(leadTypeV),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, "leads.read");
    const canSeePii = roleHasPermission(staff.role, "leads.pii");
    let page: { page: Doc<"leads">[]; isDone: boolean; continueCursor: string };
    if (args.search?.trim()) {
      const results = await ctx.db
        .query("leads")
        .withSearchIndex("search", (q) => {
          let s = q.search("searchText", args.search!.trim());
          if (args.status) s = s.eq("status", args.status);
          if (args.state) s = s.eq("state", args.state);
          if (args.coverageType) s = s.eq("coverageType", args.coverageType);
          if (args.leadType) s = s.eq("leadType", args.leadType);
          return s;
        })
        .take(50);
      page = { page: results, isDone: true, continueCursor: "" };
    } else if (args.status) {
      page = await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", args.status!)).order("desc").paginate(args.paginationOpts);
    } else {
      page = await ctx.db.query("leads").withIndex("by_capturedAt").order("desc").paginate(args.paginationOpts);
    }
    const names = await coverageNames(ctx);
    const rows = [];
    for (const lead of page.page) {
      if (args.coverageType && lead.coverageType !== args.coverageType) continue;
      if (args.state && lead.state !== args.state) continue;
      if (args.leadType && lead.leadType !== args.leadType) continue;
      rows.push({
        id: lead._id,
        reference: lead.reference,
        ...piiView(lead, canSeePii),
        coverageName: names.get(lead.coverageType) ?? lead.coverageType,
        city: lead.city ?? null,
        state: lead.state,
        leadType: lead.leadType,
        status: lead.status,
        source: lead.source,
        capturedAt: lead.capturedAt,
        assignedCount: lead.assignedCount,
        recipientTarget: lead.recipientTarget,
        holders: await holderNames(ctx, lead._id),
      });
    }
    return { ...page, page: rows };
  },
});

export const unassigned = query({
  args: {},
  handler: async (ctx) => {
    const staff = await requireStaff(ctx, "leads.read");
    const canSeePii = roleHasPermission(staff.role, "leads.pii");
    const names = await coverageNames(ctx);
    const pricing = await ctx.db.query("pricingVersions").withIndex("by_createdAt").order("desc").first();
    const cost = (type: "exclusive" | "standard") =>
      type === "exclusive" ? (pricing?.acquisitionCostExclusiveCents ?? 4200) : (pricing?.acquisitionCostStandardCents ?? 2287);
    const rows = [];
    for (const status of ["unassigned_pending", "unassignable", "partially_assigned"] as const) {
      const leads = await ctx.db.query("leads").withIndex("by_status", (q) => q.eq("status", status)).collect();
      for (const lead of leads) {
        const lastRun = await ctx.db
          .query("distributionRuns")
          .withIndex("by_lead", (q) => q.eq("leadId", lead._id))
          .order("desc")
          .first();
        rows.push({
          id: lead._id,
          reference: lead.reference,
          name: piiView(lead, canSeePii).name,
          coverageName: names.get(lead.coverageType) ?? lead.coverageType,
          city: lead.city ?? null,
          state: lead.state,
          leadType: lead.leadType,
          status: lead.status,
          capturedAt: lead.capturedAt,
          assignedCount: lead.assignedCount,
          recipientTarget: lead.recipientTarget,
          nextRetryAt: lead.nextRetryAt ?? null,
          retryAttempt: lead.retryAttempt,
          reason: lastRun?.reason ?? "Pending first attempt",
          acquisitionCostCents: cost(lead.leadType),
        });
      }
    }
    const { settings } = await loadDistributionSettings(ctx);
    rows.sort((a, b) => a.capturedAt - b.capturedAt);
    return {
      rows,
      retrySchedule: settings.retryScheduleMinutes,
      adminAlertAfterMinutes: settings.adminAlertAfterMinutes,
      unassignableAfterMinutes: settings.unassignableAfterMinutes,
    };
  },
});

/** Admin lead detail without contact PII; PII is fetched via `revealContact` so every view is audited. */
export const adminGet = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const staff = await requireStaff(ctx, "leads.read");
    const lead = await ctx.db.get(leadId);
    if (!lead) return null;
    const canSeePii = roleHasPermission(staff.role, "leads.pii");
    const names = await coverageNames(ctx);
    const assignments = await ctx.db.query("leadAssignments").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect();
    const assignmentRows = [];
    for (const a of assignments.sort((x, y) => x.assignedAt - y.assignedAt)) {
      const account = await ctx.db.get(a.accountId);
      const balance = await getBalanceDoc(ctx, a.accountId);
      assignmentRows.push({
        ...a,
        accountName: account?.name ?? "—",
        balanceOfType: balance ? balance[a.leadType] : 0,
      });
    }
    const runs = await ctx.db.query("distributionRuns").withIndex("by_lead", (q) => q.eq("leadId", leadId)).order("desc").take(20);
    const consent = lead.consentId ? await ctx.db.get(lead.consentId) : null;
    const withdrawals = await ctx.db.query("consentWithdrawals").withIndex("by_lead", (q) => q.eq("leadId", leadId)).collect();
    const duplicateOf = lead.duplicateOfLeadId ? await ctx.db.get(lead.duplicateOfLeadId) : null;
    const pricing = await ctx.db.query("pricingVersions").withIndex("by_createdAt").order("desc").first();
    const { settings } = await loadDistributionSettings(ctx);
    return {
      lead: {
        ...lead,
        firstName: canSeePii ? lead.firstName : lead.firstName.charAt(0) + ".",
        lastName: canSeePii ? lead.lastName : lead.lastName.charAt(0) + ".",
        phone: maskPhone(lead.phone),
        email: maskEmail(lead.email),
        confirmationTokenHash: undefined,
        searchText: undefined,
        coverageName: names.get(lead.coverageType) ?? lead.coverageType,
      },
      canSeePii,
      assignments: assignmentRows,
      runs: runs.map((r) => ({ ...r })),
      // Contact snapshots are PII; the unmasked values are only available through the audited `revealContact`.
      consent: consent ? { ...consent, phoneSnapshot: maskPhone(consent.phoneSnapshot), emailSnapshot: maskEmail(consent.emailSnapshot) } : null,
      withdrawals,
      duplicateOfReference: duplicateOf?.reference ?? null,
      acquisitionCostCents:
        lead.leadType === "exclusive" ? (pricing?.acquisitionCostExclusiveCents ?? 4200) : (pricing?.acquisitionCostStandardCents ?? 2287),
      standardRecipientCount: settings.standardRecipientCount,
      engineEnabled: settings.engineEnabled,
    };
  },
});

export const revealContact = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const staff = await requireStaff(ctx, "leads.pii");
    const lead = await ctx.db.get(leadId);
    if (!lead) throw notFound("Lead");
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "lead.pii_view",
      entityType: "lead",
      entityId: leadId,
      summary: `Viewed consumer contact details for ${lead.reference}`,
    });
    return { phone: lead.phone, email: lead.email, firstName: lead.firstName, lastName: lead.lastName, zip: lead.zip };
  },
});

export const revealRawPayload = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const staff = await requireStaff(ctx, "leads.pii");
    const lead = await ctx.db.get(leadId);
    if (!lead?.rawPayloadId) throw notFound("Raw payload");
    const raw = await ctx.db.get(lead.rawPayloadId);
    if (!raw) throw notFound("Raw payload");
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "lead.raw_payload_view",
      entityType: "lead",
      entityId: leadId,
      summary: `Viewed raw ${raw.source} payload for ${lead.reference}`,
    });
    return { source: raw.source, receivedAt: raw.receivedAt, payload: raw.payload, contentHash: raw.contentHash, signatureVerified: raw.signatureVerified };
  },
});

export const createManual = mutation({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    email: v.string(),
    state: v.string(),
    zip: v.string(),
    city: v.optional(v.string()),
    coverageType: v.string(),
    leadType: leadTypeV,
    reason: v.string(),
    budgetRange: v.optional(v.string()),
    consentEvidence: v.string(),
    consentAgreedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, "leads.manage");
    const phone = normalizeUsPhone(args.phone);
    const email = normalizeEmail(args.email);
    const state = normalizeStateCode(args.state);
    const zip = normalizeZip(args.zip);
    if (!normalizeName(args.firstName) || !normalizeName(args.lastName)) throw invalid("Consumer name is required.");
    if (!phone) throw invalid("Enter a valid US phone number.");
    if (!email) throw invalid("Enter a valid email.");
    if (!state) throw invalid("Choose a state.");
    if (!zip) throw invalid("Enter a 5-digit ZIP.");
    if (args.reason.trim().length < 10) throw invalid("Record what is bringing the consumer to Legacy Builders (at least 10 characters).");
    // Manual entry still requires a consent record — there is no admin override for a missing one.
    if (args.consentEvidence.trim().length < 20) throw invalid("Describe the consent evidence (where, when and how consent was given).");
    if (args.consentAgreedAt > Date.now()) throw invalid("Consent cannot be in the future.");
    const coverage = await loadCoverageTypes(ctx);
    if (!coverage.some((c) => c.key === args.coverageType)) throw invalid("Choose a product.");
    const actor = actorFromViewer(staff);
    const result = await ingestLead(
      ctx,
      {
        source: "admin",
        marketingSource: undefined,
        firstName: normalizeName(args.firstName),
        lastName: normalizeName(args.lastName),
        email,
        phone,
        state,
        zip,
        city: args.city?.trim() || undefined,
        coverageType: args.coverageType,
        coverageUndetermined: false,
        budgetRange: args.budgetRange,
        reason: args.reason.trim(),
        leadTypeOverride: args.leadType,
        processingNote: "Created manually in admin.",
      },
      {
        versionLabel: "Manual entry — evidence recorded by staff",
        contentHash: await sha256Hex(args.consentEvidence.trim()),
        agreedAt: args.consentAgreedAt,
        method: "admin_manual",
        evidence: args.consentEvidence.trim(),
        recordedBy: staff.userId,
        userAgent: "Admin console",
      },
      { actor, createdBy: staff.userId },
    );
    return result;
  },
});

export const requeue = mutation({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const staff = await requireStaff(ctx, "leads.manage");
    const lead = await ctx.db.get(leadId);
    if (!lead) throw notFound("Lead");
    if (!["queued", "unassigned_pending", "partially_assigned", "unassignable"].includes(lead.status)) {
      throw invalid(`A ${lead.status.replace(/_/g, " ")} lead cannot be re-queued.`);
    }
    if (lead.status === "unassignable") {
      await ctx.db.patch(leadId, { status: "unassigned_pending", retryAttempt: 0, retryBaseAt: undefined, adminAlertedAt: undefined, unassignableAt: undefined });
    }
    const actor = actorFromViewer(staff);
    const result = await runDistribution(ctx, leadId, { trigger: "requeue", actor });
    await writeAudit(ctx, actor, {
      action: "lead.requeue",
      entityType: "lead",
      entityId: leadId,
      summary: `Re-queued ${lead.reference}: ${result.outcome}${result.assigned.length ? ` → ${result.assigned.map((a) => a.accountName).join(", ")}` : ""}`,
    });
    return { outcome: result.outcome, assigned: result.assigned.map((a) => a.accountName), reason: result.reason ?? null };
  },
});

export const suppressLead = mutation({
  args: { leadId: v.id("leads"), note: v.string() },
  handler: async (ctx, { leadId, note }) => {
    const staff = await requireStaff(ctx, "suppression.manage");
    const lead = await ctx.db.get(leadId);
    if (!lead) throw notFound("Lead");
    if (note.trim().length < 5) throw invalid("A note is required.");
    return await withdrawLeadConsent(ctx, lead, { method: "admin", actor: actorFromViewer(staff), note: note.trim() });
  },
});

export const updateDetails = mutation({
  args: {
    leadId: v.id("leads"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    city: v.optional(v.string()),
    zip: v.optional(v.string()),
    bestTimeToCall: v.optional(v.string()),
    leadType: v.optional(leadTypeV),
  },
  handler: async (ctx, { leadId, ...fields }) => {
    const staff = await requireStaff(ctx, "leads.manage");
    const lead = await ctx.db.get(leadId);
    if (!lead) throw notFound("Lead");
    const patch: Partial<Doc<"leads">> = {};
    const changes: Record<string, [unknown, unknown]> = {};
    const set = <K extends keyof Doc<"leads">>(key: K, value: Doc<"leads">[K]) => {
      if (value !== lead[key]) {
        patch[key] = value;
        changes[key as string] = [key === "firstName" || key === "lastName" ? "[redacted]" : lead[key], value];
      }
    };
    if (fields.firstName !== undefined) set("firstName", normalizeName(fields.firstName));
    if (fields.lastName !== undefined) set("lastName", normalizeName(fields.lastName));
    if (fields.city !== undefined) set("city", fields.city.trim() || undefined);
    if (fields.zip !== undefined) {
      const zip = normalizeZip(fields.zip);
      if (!zip) throw invalid("Enter a 5-digit ZIP.");
      set("zip", zip);
    }
    if (fields.bestTimeToCall !== undefined) set("bestTimeToCall", fields.bestTimeToCall || undefined);
    if (fields.leadType !== undefined && fields.leadType !== lead.leadType) {
      if (lead.assignedCount > 0) throw invalid("The grade cannot change after the lead has been released.");
      const { settings } = await loadDistributionSettings(ctx);
      set("leadType", fields.leadType);
      patch.recipientTarget = fields.leadType === "exclusive" ? 1 : settings.standardRecipientCount;
    }
    if (!Object.keys(patch).length) return;
    await ctx.db.patch(leadId, patch);
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "lead.edit",
      entityType: "lead",
      entityId: leadId,
      summary: `Edited ${lead.reference}: ${Object.keys(changes).join(", ")}`,
      metadata: { changes },
    });
  },
});

export const recentReasons = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    await requireStaff(ctx, "reports.read");
    const since = Date.now() - (days ?? 30) * DAY;
    const leads = await ctx.db.query("leads").withIndex("by_capturedAt", (q) => q.gte("capturedAt", since)).order("desc").take(200);
    const names = await coverageNames(ctx);
    return leads.map((l) => ({ reference: l.reference, reason: l.reason, coverageName: names.get(l.coverageType) ?? l.coverageType, state: l.state, capturedAt: l.capturedAt }));
  },
});
