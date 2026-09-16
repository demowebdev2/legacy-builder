import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { normalizeEmail, normalizeName, normalizeUsPhone } from "../src/domain/normalize";
import { sha256Hex } from "../src/domain/reference";
import { HOUR } from "../src/domain/time";
import { mutation, query } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { actorFromViewer, requireAccountViewer, requireStaff } from "./lib/auth";
import { readEnv, isProductionDeployment } from "./lib/env";
import { appError, invalid, notFound } from "./lib/errors";
import { notifyAccount, notifyStaff } from "./lib/notify";
import { enforceRateLimit } from "./lib/rateLimit";
import { timingSafeEqual } from "./integrations/providers";

const TICKET_CATEGORIES = ["A lead I cannot work", "Billing or invoice", "Licence or E&O", "Buying leads or my balance", "Something else"];

export const myTickets = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "support", { allowPending: true });
    return await ctx.db.query("supportTickets").withIndex("by_account", (q) => q.eq("accountId", viewer.account._id)).order("desc").take(50);
  },
});

export const openTicket = mutation({
  args: { category: v.string(), message: v.string(), kind: v.optional(v.union(v.literal("general"), v.literal("data_export"))) },
  handler: async (ctx, { category, message, kind }) => {
    const viewer = await requireAccountViewer(ctx, "support", { allowPending: true });
    await enforceRateLimit(ctx, `ticket:${viewer.userId}`, { max: 10, windowMs: HOUR });
    const ticketKind = kind ?? "general";
    if (ticketKind === "general" && !TICKET_CATEGORIES.includes(category)) throw invalid("Choose what this is about.");
    if (message.trim().length < 10) throw invalid("Tell us a little more.");
    const id = await ctx.db.insert("supportTickets", {
      accountId: viewer.account._id,
      userId: viewer.userId,
      kind: ticketKind,
      category: ticketKind === "data_export" ? "Data export" : category,
      message: message.trim().slice(0, 4000),
      status: "open",
      createdAt: Date.now(),
    });
    await notifyStaff(ctx, { type: "system", title: `Support — ${viewer.account.name}`, body: category, link: "/admin/support" });
    return id;
  },
});

export const adminTickets = query({
  args: { paginationOpts: paginationOptsValidator, status: v.optional(v.union(v.literal("open"), v.literal("answered"), v.literal("closed"))) },
  handler: async (ctx, { paginationOpts, status }) => {
    await requireStaff(ctx, "support.manage");
    const page = status
      ? await ctx.db.query("supportTickets").withIndex("by_status", (q) => q.eq("status", status)).order("desc").paginate(paginationOpts)
      : await ctx.db.query("supportTickets").order("desc").paginate(paginationOpts);
    const rows = [];
    for (const t of page.page) rows.push({ ...t, accountName: (await ctx.db.get(t.accountId))?.name ?? "—" });
    return { ...page, page: rows };
  },
});

export const respond = mutation({
  args: { ticketId: v.id("supportTickets"), response: v.string(), close: v.boolean() },
  handler: async (ctx, { ticketId, response, close }) => {
    const staff = await requireStaff(ctx, "support.manage");
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) throw notFound("Ticket");
    if (response.trim().length < 3) throw invalid("Write a response.");
    await ctx.db.patch(ticketId, { response: response.trim(), respondedBy: staff.userId, respondedAt: Date.now(), status: close ? "closed" : "answered" });
    await notifyAccount(ctx, { accountId: ticket.accountId, type: "system", title: "Support replied", body: response.trim().slice(0, 300), link: "/agent/support" });
    await writeAudit(ctx, actorFromViewer(staff), { action: "support.respond", entityType: "supportTicket", entityId: ticketId, accountId: ticket.accountId, summary: `Responded to ${ticket.category}` });
  },
});

// ─────────────────────────── public contact form ───────────────────────────

export const submitContact = mutation({
  args: {
    secret: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    audience: v.union(v.literal("consumer"), v.literal("agent"), v.literal("other")),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const expected = readEnv("INTAKE_SHARED_SECRET");
    if (expected ? !args.secret || !timingSafeEqual(args.secret, expected) : isProductionDeployment()) {
      throw appError("FORBIDDEN", "Invalid request.");
    }
    const ipKey = args.ipAddress ? await sha256Hex(args.ipAddress) : "unknown";
    await enforceRateLimit(ctx, `contact:${ipKey}`, { max: args.ipAddress ? 5 : 50, windowMs: HOUR });
    const name = normalizeName(args.name);
    const email = normalizeEmail(args.email);
    if (!name) throw invalid("Enter your name.");
    if (!email) throw invalid("Enter a valid email address.");
    if (args.message.trim().length < 10) throw invalid("Tell us a little more.");
    const phone = args.phone ? (normalizeUsPhone(args.phone) ?? undefined) : undefined;
    await ctx.db.insert("contactMessages", {
      audience: args.audience,
      name,
      email,
      phone,
      message: args.message.trim().slice(0, 4000),
      status: "new",
      createdAt: Date.now(),
    });
    await notifyStaff(ctx, { type: "system", title: `Contact form — ${args.audience}`, body: `${name}: ${args.message.trim().slice(0, 120)}`, link: "/admin/support?tab=contact" });
    return { ok: true };
  },
});

export const contactMessages = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireStaff(ctx, "support.manage");
    return await ctx.db.query("contactMessages").order("desc").paginate(paginationOpts);
  },
});

export const markContactHandled = mutation({
  args: { messageId: v.id("contactMessages") },
  handler: async (ctx, { messageId }) => {
    const staff = await requireStaff(ctx, "support.manage");
    await ctx.db.patch(messageId, { status: "handled", handledBy: staff.userId });
  },
});
