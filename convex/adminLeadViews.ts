import { v } from "convex/values";
import { roleHasPermission } from "../src/domain/permissions";
import { query } from "./_generated/server";
import { displayName, requireStaff } from "./lib/auth";

/**
 * Extra, read-only context for the admin lead detail screen that `leads.adminGet` does not carry:
 * the exact consent wording the consumer agreed to, the marketing source's display name and who
 * created a manual lead. Contains no consumer contact details.
 */
export const leadExtras = query({
  args: { leadId: v.id("leads") },
  handler: async (ctx, { leadId }) => {
    const staff = await requireStaff(ctx, "leads.read");
    const lead = await ctx.db.get(leadId);
    if (!lead) return null;
    const canSeePii = roleHasPermission(staff.role, "leads.pii");
    const consent = lead.consentId ? await ctx.db.get(lead.consentId) : null;
    const consentDoc = consent?.legalDocumentId ? await ctx.db.get(consent.legalDocumentId) : null;
    const source = lead.marketingSource
      ? await ctx.db
          .query("marketingSources")
          .withIndex("by_key", (q) => q.eq("key", lead.marketingSource!))
          .unique()
      : null;
    const creator = lead.createdBy ? await ctx.db.get(lead.createdBy) : null;
    return {
      // Staff-written manual evidence can mention the consumer, so it follows the PII permission.
      consentWording: consentDoc?.content ?? (canSeePii ? (consent?.evidence ?? null) : null),
      consentWordingTitle: consentDoc ? `${consentDoc.title} — version ${consentDoc.version}` : (consent?.versionLabel ?? null),
      consentPublishedAt: consentDoc?.publishedAt ?? null,
      marketingSourceName: source?.name ?? lead.marketingSource ?? null,
      createdByName: creator ? displayName(creator) : null,
      hasRawPayload: !!lead.rawPayloadId,
    };
  },
});
