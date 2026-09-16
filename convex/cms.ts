import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, requireStaff } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { cmsContentV } from "./lib/validators";

/** Structured CMS: page hero/SEO/sections, FAQs and media. No visual page builder by design. */

export const publicPage = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const page = await ctx.db.query("cmsPages").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!page || !page.publishedAt) return null;
    return { slug: page.slug, title: page.title, content: page.content, updatedAt: page.publishedAt };
  },
});

export const publicFaqs = query({
  args: { audience: v.optional(v.union(v.literal("consumer"), v.literal("agent"))) },
  handler: async (ctx, { audience }) => {
    const rows = audience
      ? await ctx.db.query("faqs").withIndex("by_audience", (q) => q.eq("audience", audience)).collect()
      : await ctx.db.query("faqs").collect();
    return rows
      .filter((f) => f.published)
      .sort((a, b) => a.audience.localeCompare(b.audience) || a.sortOrder - b.sortOrder)
      .map((f) => ({ id: f._id, audience: f.audience, question: f.question, answer: f.answer }));
  },
});

export const publicMedia = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("media").withIndex("by_uploadedAt").order("desc").take(200);
    return await Promise.all(
      rows.map(async (m) => ({
        id: m._id,
        filename: m.filename,
        altText: m.altText,
        url: m.storageId ? await ctx.storage.getUrl(m.storageId) : (m.externalUrl ?? null),
      })),
    );
  },
});

// ─────────────────────────── admin ───────────────────────────

export const adminPages = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "cms.manage");
    return (await ctx.db.query("cmsPages").collect()).sort((a, b) => a.title.localeCompare(b.title));
  },
});

export const savePage = mutation({
  args: { pageId: v.id("cmsPages"), content: cmsContentV, publish: v.boolean() },
  handler: async (ctx, { pageId, content, publish }) => {
    const staff = await requireStaff(ctx, "cms.manage");
    const page = await ctx.db.get(pageId);
    if (!page) throw notFound("Page");
    if (!content.heroTitle.trim()) throw invalid("A headline is required.");
    if (content.seoTitle.length > 70) throw invalid("Keep the title tag under 70 characters.");
    if (content.seoDescription.length > 200) throw invalid("Keep the meta description under 200 characters.");
    const now = Date.now();
    if (publish) {
      await ctx.db.patch(pageId, {
        content,
        draftContent: undefined,
        status: "published",
        version: page.version + 1,
        publishedAt: now,
        updatedAt: now,
        updatedBy: staff.userId,
        updatedByName: staff.name,
      });
    } else {
      await ctx.db.patch(pageId, { draftContent: content, status: "draft", updatedAt: now, updatedBy: staff.userId, updatedByName: staff.name });
    }
    await writeAudit(ctx, actorFromViewer(staff), {
      action: publish ? "cms.publish" : "cms.draft",
      entityType: "cmsPage",
      entityId: pageId,
      summary: `${publish ? "Published" : "Saved draft of"} /${page.slug}${publish ? ` (v${page.version + 1})` : ""}`,
      metadata: { before: page.content, after: content },
    });
  },
});

export const adminFaqs = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "cms.manage");
    return (await ctx.db.query("faqs").collect()).sort((a, b) => a.audience.localeCompare(b.audience) || a.sortOrder - b.sortOrder);
  },
});

export const saveFaq = mutation({
  args: {
    id: v.optional(v.id("faqs")),
    audience: v.union(v.literal("consumer"), v.literal("agent")),
    question: v.string(),
    answer: v.string(),
    published: v.boolean(),
    sortOrder: v.number(),
  },
  handler: async (ctx, { id, ...fields }) => {
    const staff = await requireStaff(ctx, "cms.manage");
    if (fields.question.trim().length < 5 || fields.answer.trim().length < 5) throw invalid("Question and answer are required.");
    const clean = { ...fields, question: fields.question.trim(), answer: fields.answer.trim(), updatedAt: Date.now(), updatedBy: staff.userId };
    let faqId = id;
    if (faqId) {
      if (!(await ctx.db.get(faqId))) throw notFound("FAQ");
      await ctx.db.patch(faqId, clean);
    } else {
      faqId = await ctx.db.insert("faqs", clean);
    }
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "cms.faq",
      entityType: "faq",
      entityId: faqId,
      summary: `${id ? "Updated" : "Added"} ${fields.audience} FAQ: ${clean.question}${clean.published ? "" : " (hidden)"}`,
    });
    return faqId;
  },
});

export const adminMedia = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "media.manage");
    const rows = await ctx.db.query("media").withIndex("by_uploadedAt").order("desc").take(500);
    return await Promise.all(rows.map(async (m) => ({ ...m, url: m.storageId ? await ctx.storage.getUrl(m.storageId) : (m.externalUrl ?? null) })));
  },
});

export const generateMediaUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "media.manage");
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveMedia = mutation({
  args: { storageId: v.id("_storage"), filename: v.string(), altText: v.string(), contentType: v.optional(v.string()), sizeBytes: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const staff = await requireStaff(ctx, "media.manage");
    // Alt text is required on upload — publishing is blocked without it.
    if (args.altText.trim().length < 3) throw invalid("Alt text is required.");
    if (args.contentType && !/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(args.contentType)) throw invalid("Upload an image file.");
    if (args.sizeBytes && args.sizeBytes > 8 * 1024 * 1024) throw invalid("Images must be under 8 MB.");
    const id = await ctx.db.insert("media", { ...args, altText: args.altText.trim(), uploadedAt: Date.now(), uploadedBy: staff.userId });
    await writeAudit(ctx, actorFromViewer(staff), { action: "media.upload", entityType: "media", entityId: id, summary: `Uploaded ${args.filename}` });
    return id;
  },
});

export const updateMediaAlt = mutation({
  args: { mediaId: v.id("media"), altText: v.string() },
  handler: async (ctx, { mediaId, altText }) => {
    const staff = await requireStaff(ctx, "media.manage");
    if (altText.trim().length < 3) throw invalid("Alt text is required.");
    await ctx.db.patch(mediaId, { altText: altText.trim() });
    await writeAudit(ctx, actorFromViewer(staff), { action: "media.alt", entityType: "media", entityId: mediaId, summary: "Alt text updated" });
  },
});
