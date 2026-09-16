import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, requireStaff } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { formOptionGroupV, leadTypeV } from "./lib/validators";

/** Public reference data for forms and marketing pages. Nothing here is sensitive. */
export const publicData = query({
  args: {},
  handler: async (ctx) => {
    const states = (await ctx.db.query("referenceStates").collect()).sort((a, b) => a.sortOrder - b.sortOrder);
    const coverage = (await ctx.db.query("coverageTypes").collect()).filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder);
    const options = (await ctx.db.query("formOptions").collect()).filter((o) => o.active).sort((a, b) => a.sortOrder - b.sortOrder);
    const leadTypes = await ctx.db.query("leadTypeLabels").collect();
    const grouped: Record<string, string[]> = {};
    for (const o of options) (grouped[o.group] ??= []).push(o.label);
    return {
      states: states.map((s) => ({ code: s.code, name: s.name, serviced: s.serviced })),
      servicedStates: states.filter((s) => s.serviced).map((s) => ({ code: s.code, name: s.name })),
      coverageTypes: coverage.map((c) => ({
        key: c.key,
        name: c.name,
        icon: c.icon,
        cardDescription: c.cardDescription,
        wizardDescription: c.wizardDescription,
        requiresTpmo: c.requiresTpmo,
        imageUrl: c.imageUrl ?? null,
      })),
      leadTypes: leadTypes.map((l) => ({ key: l.key, name: l.name, description: l.description })),
      formOptions: grouped,
    };
  },
});

export const adminData = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "settings.read");
    return {
      states: (await ctx.db.query("referenceStates").collect()).sort((a, b) => a.sortOrder - b.sortOrder),
      coverageTypes: (await ctx.db.query("coverageTypes").collect()).sort((a, b) => a.sortOrder - b.sortOrder),
      marketingSources: (await ctx.db.query("marketingSources").collect()).sort((a, b) => a.sortOrder - b.sortOrder),
      formOptions: (await ctx.db.query("formOptions").collect()).sort((a, b) => a.group.localeCompare(b.group) || a.sortOrder - b.sortOrder),
      leadTypes: await ctx.db.query("leadTypeLabels").collect(),
    };
  },
});

export const partnerSource = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    if (!key) return null;
    const source = await ctx.db
      .query("marketingSources")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return source && source.active && source.channel === "partner" ? source : null;
  },
});

export const setStateServiced = mutation({
  args: { stateId: v.id("referenceStates"), serviced: v.boolean() },
  handler: async (ctx, { stateId, serviced }) => {
    const staff = await requireStaff(ctx, "settings.manage");
    const row = await ctx.db.get(stateId);
    if (!row) throw notFound("State");
    await ctx.db.patch(stateId, { serviced });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "reference.state",
      entityType: "referenceState",
      entityId: stateId,
      summary: `${row.name} ${serviced ? "added to" : "removed from"} serviced states`,
    });
  },
});

export const upsertCoverageType = mutation({
  args: {
    id: v.optional(v.id("coverageTypes")),
    key: v.string(),
    name: v.string(),
    icon: v.string(),
    cardDescription: v.string(),
    wizardDescription: v.string(),
    requiresTpmo: v.boolean(),
    imageUrl: v.optional(v.string()),
    active: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, { id, ...fields }) => {
    const staff = await requireStaff(ctx, "settings.manage");
    if (!/^[a-z_]{2,30}$/.test(fields.key)) throw invalid("Key must be lowercase letters and underscores.");
    if (!fields.name.trim()) throw invalid("Name is required.");
    if (id) {
      const row = await ctx.db.get(id);
      if (!row) throw notFound("Coverage type");
      if (row.key !== fields.key) throw invalid("Keys cannot change — leads and preferences reference them.");
      await ctx.db.patch(id, fields);
    } else {
      const clash = await ctx.db.query("coverageTypes").withIndex("by_key", (q) => q.eq("key", fields.key)).unique();
      if (clash) throw invalid("That key already exists.");
      id = await ctx.db.insert("coverageTypes", fields);
    }
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "reference.coverage",
      entityType: "coverageType",
      entityId: id,
      summary: `Coverage type ${fields.name} saved${fields.requiresTpmo ? " (requires TPMO)" : ""}`,
    });
    return id;
  },
});

export const upsertMarketingSource = mutation({
  args: {
    id: v.optional(v.id("marketingSources")),
    key: v.string(),
    name: v.string(),
    channel: v.string(),
    defaultLeadType: v.optional(leadTypeV),
    active: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, { id, ...fields }) => {
    const staff = await requireStaff(ctx, "settings.manage");
    if (!/^[a-z0-9_]{2,40}$/.test(fields.key)) throw invalid("Key must be lowercase letters, digits and underscores.");
    if (id) {
      const row = await ctx.db.get(id);
      if (!row) throw notFound("Marketing source");
      if (row.key !== fields.key) throw invalid("Keys cannot change.");
      await ctx.db.patch(id, fields);
    } else {
      const clash = await ctx.db.query("marketingSources").withIndex("by_key", (q) => q.eq("key", fields.key)).unique();
      if (clash) throw invalid("That key already exists.");
      id = await ctx.db.insert("marketingSources", fields);
    }
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "reference.marketing_source",
      entityType: "marketingSource",
      entityId: id,
      summary: `Marketing source ${fields.name} saved`,
    });
    return id;
  },
});

export const upsertFormOption = mutation({
  args: { id: v.optional(v.id("formOptions")), group: formOptionGroupV, label: v.string(), active: v.boolean(), sortOrder: v.number() },
  handler: async (ctx, { id, ...fields }) => {
    const staff = await requireStaff(ctx, "settings.manage");
    if (!fields.label.trim()) throw invalid("Label is required.");
    if (id) {
      const row = await ctx.db.get(id);
      if (!row) throw notFound("Option");
      await ctx.db.patch(id, { ...fields, label: fields.label.trim() });
    } else {
      id = await ctx.db.insert("formOptions", { ...fields, label: fields.label.trim() });
    }
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "reference.form_option",
      entityType: "formOption",
      entityId: id,
      summary: `${fields.group.replace("_", " ")} option "${fields.label.trim()}" ${fields.active ? "saved" : "deactivated"}`,
    });
    return id;
  },
});
