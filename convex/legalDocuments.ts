import { v } from "convex/values";
import { LEGAL_DOCUMENT_TYPES } from "../src/domain/referenceDefaults";
import { sha256Hex } from "../src/domain/reference";
import { mutation, query } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, requireStaff } from "./lib/auth";
import { forbidden, invalid, notFound } from "./lib/errors";
import { getPublishedLegalDocument } from "./lib/settings";
import { legalDocTypeV } from "./lib/validators";

/**
 * Legal documents are versioned rows. A published version is never edited, deleted or rolled back — a
 * correction publishes a superseding version. Publishing requires an ADMIN who did not author the draft.
 */

export const published = query({
  args: { docType: legalDocTypeV },
  handler: async (ctx, { docType }) => {
    const doc = await getPublishedLegalDocument(ctx, docType);
    if (!doc) return null;
    return { id: doc._id, docType: doc.docType, slug: doc.slug, title: doc.title, version: doc.version, content: doc.content, contentHash: doc.contentHash, publishedAt: doc.publishedAt ?? null };
  },
});

export const publishedBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const doc = await ctx.db.query("legalDocuments").withIndex("by_slug_status", (q) => q.eq("slug", slug).eq("status", "published")).first();
    if (!doc) return null;
    return { id: doc._id, title: doc.title, version: doc.version, content: doc.content, publishedAt: doc.publishedAt ?? null };
  },
});

export const adminList = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "legal.draft");
    const rows = await ctx.db.query("legalDocuments").collect();
    const consents = await ctx.db.query("consents").collect();
    return LEGAL_DOCUMENT_TYPES.map((t) => {
      const versions = rows.filter((r) => r.docType === t.docType).sort((a, b) => b.version - a.version);
      return {
        ...t,
        current: versions.find((r) => r.status === "published") ?? null,
        pending: versions.find((r) => r.status === "pending_approval" || r.status === "draft") ?? null,
        versions: versions.map((r) => ({
          id: r._id,
          version: r.version,
          status: r.status,
          createdAt: r.createdAt,
          createdByName: r.createdByName,
          publishedAt: r.publishedAt ?? null,
          publishedByName: r.publishedByName ?? null,
          contentHash: r.contentHash,
          consentsLinked: consents.filter((c) => c.legalDocumentId === r._id || c.termsDocumentId === r._id || c.privacyDocumentId === r._id).length,
        })),
      };
    });
  },
});

export const get = query({
  args: { documentId: v.id("legalDocuments") },
  handler: async (ctx, { documentId }) => {
    await requireStaff(ctx, "legal.draft");
    return await ctx.db.get(documentId);
  },
});

export const createDraft = mutation({
  args: { docType: legalDocTypeV, content: v.string() },
  handler: async (ctx, { docType, content }) => {
    const staff = await requireStaff(ctx, "legal.draft");
    const text = content.trim();
    if (text.length < 20) throw invalid("The document text is too short.");
    const meta = LEGAL_DOCUMENT_TYPES.find((t) => t.docType === docType)!;
    const versions = await ctx.db.query("legalDocuments").withIndex("by_type_version", (q) => q.eq("docType", docType)).collect();
    const open = versions.find((d) => d.status === "draft" || d.status === "pending_approval");
    const contentHash = await sha256Hex(text);
    if (open) {
      if (open.status === "pending_approval") throw invalid("A version is awaiting approval. Approve or withdraw it first.");
      await ctx.db.patch(open._id, { content: text, contentHash, createdAt: Date.now(), createdBy: staff.userId, createdByName: staff.name });
      await writeAudit(ctx, actorFromViewer(staff), { action: "legal.draft", entityType: "legalDocument", entityId: open._id, summary: `Updated draft ${meta.title} v${open.version}` });
      return open._id;
    }
    const nextVersion = Math.max(0, ...versions.map((d) => d.version)) + 1;
    const id = await ctx.db.insert("legalDocuments", {
      docType,
      slug: meta.slug,
      title: meta.title,
      version: nextVersion,
      content: text,
      contentHash,
      status: "draft",
      createdAt: Date.now(),
      createdBy: staff.userId,
      createdByName: staff.name,
    });
    await writeAudit(ctx, actorFromViewer(staff), { action: "legal.draft", entityType: "legalDocument", entityId: id, summary: `Drafted ${meta.title} v${nextVersion}` });
    return id;
  },
});

export const submitForApproval = mutation({
  args: { documentId: v.id("legalDocuments") },
  handler: async (ctx, { documentId }) => {
    const staff = await requireStaff(ctx, "legal.draft");
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.status !== "draft") throw notFound("Draft");
    await ctx.db.patch(documentId, { status: "pending_approval", submittedAt: Date.now(), submittedBy: staff.userId });
    await writeAudit(ctx, actorFromViewer(staff), { action: "legal.submit", entityType: "legalDocument", entityId: documentId, summary: `Submitted ${doc.title} v${doc.version} for approval` });
  },
});

export const withdrawDraft = mutation({
  args: { documentId: v.id("legalDocuments") },
  handler: async (ctx, { documentId }) => {
    const staff = await requireStaff(ctx, "legal.draft");
    const doc = await ctx.db.get(documentId);
    if (!doc || (doc.status !== "pending_approval" && doc.status !== "draft")) throw notFound("Draft");
    await ctx.db.patch(documentId, { status: "draft", submittedAt: undefined, submittedBy: undefined });
    await writeAudit(ctx, actorFromViewer(staff), { action: "legal.withdraw", entityType: "legalDocument", entityId: documentId, summary: `Returned ${doc.title} v${doc.version} to draft` });
  },
});

export const publish = mutation({
  args: { documentId: v.id("legalDocuments") },
  handler: async (ctx, { documentId }) => {
    const staff = await requireStaff(ctx, "legal.publish");
    const doc = await ctx.db.get(documentId);
    if (!doc || doc.status !== "pending_approval") throw invalid("Only a version awaiting approval can be published.");
    if (doc.createdBy === staff.userId || doc.submittedBy === staff.userId) {
      throw forbidden("Four-eyes rule: a different admin must approve and publish this version.");
    }
    const now = Date.now();
    const current = await getPublishedLegalDocument(ctx, doc.docType);
    if (current) await ctx.db.patch(current._id, { status: "superseded", supersededAt: now });
    await ctx.db.patch(documentId, { status: "published", publishedAt: now, publishedBy: staff.userId, publishedByName: staff.name });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "legal.publish",
      entityType: "legalDocument",
      entityId: documentId,
      summary: `Published ${doc.title} v${doc.version}${current ? ` (supersedes v${current.version})` : ""}`,
      metadata: { contentHash: doc.contentHash },
    });
  },
});
