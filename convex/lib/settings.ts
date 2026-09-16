import { type DistributionSettings, mergeDistributionSettings } from "../../src/domain/distribution";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** Placeholder rates from the prototype — replaced by the first admin-saved pricing version. */
export interface PricingValues {
  standardRateCents: number;
  exclusiveRateCents: number;
  displayMode: "public" | "agent_only";
  acquisitionCostStandardCents: number;
  acquisitionCostExclusiveCents: number;
}

export const DEFAULT_PRICING: PricingValues = {
  standardRateCents: 2000,
  exclusiveRateCents: 5000,
  displayMode: "public",
  acquisitionCostStandardCents: 2287,
  acquisitionCostExclusiveCents: 4200,
};

export type PricingSnapshot = PricingValues & { versionId: Id<"pricingVersions"> | null; updatedAt: number | null };

export async function loadPricing(ctx: Ctx): Promise<PricingSnapshot> {
  const latest = await ctx.db.query("pricingVersions").withIndex("by_createdAt").order("desc").first();
  if (!latest) return { ...DEFAULT_PRICING, versionId: null, updatedAt: null };
  return {
    standardRateCents: latest.standardRateCents,
    exclusiveRateCents: latest.exclusiveRateCents,
    displayMode: latest.displayMode,
    acquisitionCostStandardCents: latest.acquisitionCostStandardCents,
    acquisitionCostExclusiveCents: latest.acquisitionCostExclusiveCents,
    versionId: latest._id,
    updatedAt: latest.createdAt,
  };
}

/** Orders must reference a concrete pricing version; create the default one on first use. */
export async function ensurePricingVersion(ctx: MutationCtx): Promise<Doc<"pricingVersions">> {
  const latest = await ctx.db.query("pricingVersions").withIndex("by_createdAt").order("desc").first();
  if (latest) return latest;
  const id = await ctx.db.insert("pricingVersions", {
    ...DEFAULT_PRICING,
    createdAt: Date.now(),
    createdByName: "System default",
    note: "Placeholder rates from the approved prototype",
  });
  return (await ctx.db.get(id))!;
}

export interface LoadedDistributionSettings {
  settings: DistributionSettings;
  versionId: Id<"distributionSettings"> | null;
}

export async function loadDistributionSettings(ctx: Ctx): Promise<LoadedDistributionSettings> {
  const latest = await ctx.db.query("distributionSettings").withIndex("by_createdAt").order("desc").first();
  if (!latest) return { settings: mergeDistributionSettings(null), versionId: null };
  const { _id, _creationTime, createdAt: _c, createdBy: _b, createdByName: _n, note: _note, ...stored } = latest;
  return { settings: mergeDistributionSettings(stored), versionId: _id };
}

export async function loadServicedStates(ctx: Ctx): Promise<Doc<"referenceStates">[]> {
  const rows = await ctx.db.query("referenceStates").collect();
  return rows.filter((s) => s.serviced).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function loadCoverageTypes(ctx: Ctx, includeInactive = false): Promise<Doc<"coverageTypes">[]> {
  const rows = await ctx.db.query("coverageTypes").collect();
  return rows.filter((c) => includeInactive || c.active).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function loadFormOptions(ctx: Ctx, group: Doc<"formOptions">["group"]): Promise<string[]> {
  const rows = await ctx.db
    .query("formOptions")
    .withIndex("by_group", (q) => q.eq("group", group))
    .collect();
  return rows.filter((r) => r.active).map((r) => r.label);
}

export async function getPublishedLegalDocument(ctx: Ctx, docType: Doc<"legalDocuments">["docType"]) {
  return await ctx.db
    .query("legalDocuments")
    .withIndex("by_type_status", (q) => q.eq("docType", docType).eq("status", "published"))
    .first();
}
