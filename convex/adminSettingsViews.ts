import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, requireStaff } from "./lib/auth";
import { invalid } from "./lib/errors";

/**
 * Admin → Settings → Compliance: data retention values (`retentionSettings`, a single row).
 * Consent artefacts are never deleted automatically (BD-10); these values drive review, not deletion.
 */

const RETENTION_DEFAULTS = {
  consentArtifactYears: 5,
  leadPiiMonthsAfterClosure: 36,
  leadVisibilityDaysAfterClosure: 90,
} as const;

/** Allowed ranges — kept deliberately narrow so a typo cannot shorten a legal retention period. */
const LIMITS = {
  consentArtifactYears: { min: 4, max: 15, label: "Consent artefact retention" },
  leadPiiMonthsAfterClosure: { min: 12, max: 120, label: "Lead PII retention" },
  leadVisibilityDaysAfterClosure: { min: 30, max: 365, label: "Lead visibility after cancellation" },
} as const;

export const retention = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "settings.read");
    const row = await ctx.db.query("retentionSettings").first();
    if (!row) return { ...RETENTION_DEFAULTS, updatedAt: null, updatedByName: null, isDefault: true };
    const user = row.updatedBy ? await ctx.db.get(row.updatedBy) : null;
    return {
      consentArtifactYears: row.consentArtifactYears,
      leadPiiMonthsAfterClosure: row.leadPiiMonthsAfterClosure,
      leadVisibilityDaysAfterClosure: row.leadVisibilityDaysAfterClosure,
      updatedAt: row.updatedAt,
      updatedByName: user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Staff" : null,
      isDefault: false,
    };
  },
});

export const updateRetention = mutation({
  args: {
    consentArtifactYears: v.number(),
    leadPiiMonthsAfterClosure: v.number(),
    leadVisibilityDaysAfterClosure: v.number(),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, "settings.manage");
    for (const key of Object.keys(LIMITS) as Array<keyof typeof LIMITS>) {
      const value = args[key];
      const limit = LIMITS[key];
      if (!Number.isInteger(value) || value < limit.min || value > limit.max) {
        throw invalid(`${limit.label} must be a whole number between ${limit.min} and ${limit.max}.`);
      }
    }
    const now = Date.now();
    const existing = await ctx.db.query("retentionSettings").first();
    const before = existing
      ? {
          consentArtifactYears: existing.consentArtifactYears,
          leadPiiMonthsAfterClosure: existing.leadPiiMonthsAfterClosure,
          leadVisibilityDaysAfterClosure: existing.leadVisibilityDaysAfterClosure,
        }
      : null;
    let id = existing?._id;
    if (id) {
      await ctx.db.patch(id, { ...args, updatedAt: now, updatedBy: staff.userId });
    } else {
      id = await ctx.db.insert("retentionSettings", { ...args, updatedAt: now, updatedBy: staff.userId });
    }
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "settings.retention",
      entityType: "retentionSettings",
      entityId: id,
      summary: `Retention: consent artefacts ${args.consentArtifactYears}y, lead PII ${args.leadPiiMonthsAfterClosure}mo after closure, visibility ${args.leadVisibilityDaysAfterClosure}d after cancellation`,
      metadata: { before, after: args },
    });
    return id;
  },
});
