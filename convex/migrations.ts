import { DEFAULT_FORM_OPTIONS, type FormOptionGroup } from "../src/domain/referenceDefaults";
import { internalMutation } from "./_generated/server";

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
