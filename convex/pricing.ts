import { v } from "convex/values";
import { quoteBundle } from "../src/domain/purchase";
import { mutation, query } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, getViewer, isAccountRole, isStaffRole, requireStaff } from "./lib/auth";
import { invalid } from "./lib/errors";
import { loadPricing } from "./lib/settings";

/**
 * Pricing is versioned; every change inserts a new row (history is kept). Rates on existing orders are
 * frozen on the order itself. Minimum, increment and mix are fixed rules and cannot be edited here.
 */

async function activeBundles(ctx: Parameters<typeof loadPricing>[0]) {
  const rows = await ctx.db
    .query("bundles")
    .withIndex("by_active_sort", (q) => q.eq("active", true))
    .collect();
  return rows;
}

/** Public rate card. Honours the PUBLIC / AGENT-ONLY visibility setting (BD-7). */
export const publicRateCard = query({
  args: {},
  handler: async (ctx) => {
    const pricing = await loadPricing(ctx);
    const viewer = await getViewer(ctx);
    const privileged = !!viewer && (isAccountRole(viewer.user.role) || isStaffRole(viewer.user.role));
    if (pricing.displayMode === "agent_only" && !privileged) {
      return { visible: false as const, displayMode: pricing.displayMode };
    }
    const rates = { standardRateCents: pricing.standardRateCents, exclusiveRateCents: pricing.exclusiveRateCents };
    const bundles = await activeBundles(ctx);
    return {
      visible: true as const,
      displayMode: pricing.displayMode,
      ...rates,
      bundles: bundles.map((b) => ({ id: b._id, name: b.name, quantity: b.quantity, discountPercent: b.discountPercent, blurb: b.blurb, featured: b.featured, quote: quoteBundle(b, rates) })),
    };
  },
});

export const agentRateCard = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer || (!isAccountRole(viewer.user.role) && !isStaffRole(viewer.user.role))) return null;
    const pricing = await loadPricing(ctx);
    const rates = { standardRateCents: pricing.standardRateCents, exclusiveRateCents: pricing.exclusiveRateCents };
    const bundles = await activeBundles(ctx);
    return {
      ...rates,
      bundles: bundles.map((b) => ({ id: b._id, name: b.name, quantity: b.quantity, discountPercent: b.discountPercent, blurb: b.blurb, featured: b.featured, quote: quoteBundle(b, rates) })),
    };
  },
});

export const adminPricing = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "pricing.manage");
    const pricing = await loadPricing(ctx);
    const history = await ctx.db.query("pricingVersions").withIndex("by_createdAt").order("desc").take(25);
    const bundles = (await ctx.db.query("bundles").collect()).sort((a, b) => a.sortOrder - b.sortOrder);
    const orders = await ctx.db.query("orders").withIndex("by_kind", (q) => q.eq("kind", "bundle")).collect();
    const balances = await ctx.db.query("accountBalances").collect();
    return {
      pricing,
      history,
      bundles: bundles.map((b) => ({
        ...b,
        sold: orders.filter((o) => o.bundleId === b._id && (o.status === "paid" || o.status === "partially_refunded")).length,
        quote: quoteBundle(b, pricing),
      })),
      outstandingLeads: balances.reduce((s, b) => s + b.exclusive + b.standard, 0),
    };
  },
});

export const updatePricing = mutation({
  args: {
    standardRateCents: v.number(),
    exclusiveRateCents: v.number(),
    displayMode: v.union(v.literal("public"), v.literal("agent_only")),
    acquisitionCostStandardCents: v.number(),
    acquisitionCostExclusiveCents: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, "pricing.manage");
    for (const [key, value] of Object.entries(args)) {
      if (key.endsWith("Cents") && (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > 1_000_000)) {
        throw invalid("Rates and costs must be positive amounts under $10,000.");
      }
    }
    const previous = await loadPricing(ctx);
    const id = await ctx.db.insert("pricingVersions", {
      ...args,
      note: args.note?.trim() || undefined,
      createdAt: Date.now(),
      createdBy: staff.userId,
      createdByName: staff.name,
    });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "pricing.update",
      entityType: "pricingVersion",
      entityId: id,
      summary: `Rate card: standard ${previous.standardRateCents}→${args.standardRateCents}¢, exclusive ${previous.exclusiveRateCents}→${args.exclusiveRateCents}¢, visibility ${args.displayMode}`,
      metadata: { previous, next: args },
    });
    return id;
  },
});

export const upsertBundle = mutation({
  args: {
    id: v.optional(v.id("bundles")),
    name: v.string(),
    quantity: v.number(),
    discountPercent: v.number(),
    blurb: v.string(),
    featured: v.boolean(),
    active: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, { id, ...fields }) => {
    const staff = await requireStaff(ctx, "pricing.manage");
    const pricing = await loadPricing(ctx);
    try {
      quoteBundle({ name: fields.name, quantity: fields.quantity, discountPercent: fields.discountPercent }, pricing);
    } catch (error) {
      throw invalid(error instanceof Error ? error.message : "Invalid bundle.");
    }
    if (fields.discountPercent > 50) throw invalid("Bundle discounts above 50% need finance sign-off outside the platform.");
    const now = Date.now();
    const clean = { ...fields, name: fields.name.trim(), blurb: fields.blurb.trim(), updatedAt: now, updatedBy: staff.userId };
    let bundleId = id;
    let before = null;
    if (bundleId) {
      before = await ctx.db.get(bundleId);
      if (!before) throw invalid("Bundle not found.");
      await ctx.db.patch(bundleId, clean);
    } else {
      bundleId = await ctx.db.insert("bundles", { ...clean, createdAt: now });
    }
    await writeAudit(ctx, actorFromViewer(staff), {
      action: id ? "bundle.update" : "bundle.create",
      entityType: "bundle",
      entityId: bundleId,
      summary: `${clean.name}: ${clean.quantity} leads at ${clean.discountPercent}% off${clean.active ? "" : " (inactive)"}`,
      metadata: { before },
    });
    return bundleId;
  },
});
