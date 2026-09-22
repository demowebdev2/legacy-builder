import { DEFAULT_FORM_OPTIONS, type FormOptionGroup } from "../src/domain/referenceDefaults";
import { internalMutation } from "./_generated/server";
import { CMS_SEED_PAGES } from "./seed";

/**
 * One-off migrations run by hand against a deployment with `npx convex run migrations:<name>`.
 * Not wired to any schedule or trigger.
 */

/**
 * Replaces every formOptions row (per group) with the current DEFAULT_FORM_OPTIONS wording, and
 * refreshes the "Fixed index annuities" coverage type name. Safe to run more than once.
 */
export const refreshReferenceCopy = internalMutation({
  args: {},
  handler: async (ctx) => {
    let inserted = 0;
    let removed = 0;
    for (const [group, labels] of Object.entries(DEFAULT_FORM_OPTIONS) as Array<[FormOptionGroup, readonly string[]]>) {
      const existing = await ctx.db
        .query("formOptions")
        .withIndex("by_group", (q) => q.eq("group", group))
        .collect();
      for (const row of existing) {
        await ctx.db.delete(row._id);
        removed++;
      }
      for (const [i, label] of labels.entries()) {
        await ctx.db.insert("formOptions", { group, label, active: true, sortOrder: i });
        inserted++;
      }
    }

    const annuity = await ctx.db
      .query("coverageTypes")
      .withIndex("by_key", (q) => q.eq("key", "annuity"))
      .unique();
    if (annuity && annuity.name !== "Fixed index annuities") {
      await ctx.db.patch(annuity._id, { name: "Fixed index annuities" });
    }

    return { removed, inserted, annuityUpdated: !!annuity };
  },
});

/**
 * Pushes the current seed hero copy to CMS pages that no admin has edited yet (updatedByName is still "Seed").
 * Admin-edited pages are left untouched. Safe to run more than once.
 */
export const refreshCmsHeroCopy = internalMutation({
  args: {},
  handler: async (ctx) => {
    const updated: string[] = [];
    const skipped: string[] = [];
    for (const seed of CMS_SEED_PAGES) {
      const rows = await ctx.db
        .query("cmsPages")
        .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
        .collect();
      for (const row of rows) {
        if (row.updatedByName !== "Seed") {
          skipped.push(seed.slug);
          continue;
        }
        if (JSON.stringify(row.content) === JSON.stringify(seed.content)) continue;
        await ctx.db.patch(row._id, { content: seed.content, updatedAt: Date.now() });
        updated.push(seed.slug);
      }
    }
    return { updated, skipped };
  },
});
