import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { DAY } from "../src/domain/time";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { currentEoPolicy } from "./eoPolicies";
import { getBalanceDoc, summarizeBalance } from "./ledger";
import { currentLicenses, isLicenseUsable, refreshMemberVerification, verifiedStates } from "./licenses";
import { writeAudit } from "./lib/audit";
import { type Actor, actorFromViewer, requireAccountViewer, requireStaff } from "./lib/auth";
import { invalid, notFound } from "./lib/errors";
import { notifyAccount } from "./lib/notify";
import { tpmoState } from "./tpmo";

type Ctx = QueryCtx | MutationCtx;

export async function accountMetrics(ctx: Ctx, account: Doc<"accounts">) {
  const now = Date.now();
  const balance = summarizeBalance(await getBalanceDoc(ctx, account._id));
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_account", (q) => q.eq("accountId", account._id))
    .collect();
  const paid = orders.filter((o) => o.status === "paid" || o.status === "partially_refunded" || o.status === "refunded");
  const recent = await ctx.db
    .query("leadAssignments")
    .withIndex("by_account_assignedAt", (q) => q.eq("accountId", account._id).gte("assignedAt", now - 90 * DAY))
    .collect();
  const live = recent.filter((a) => !a.revokedAt);
  const contacted = live.filter((a) => a.contactedAt != null || a.status !== "new").length;
  return {
    balance,
    orderCount: paid.length,
    spendCents: paid.reduce((s, o) => s + o.totalCents - o.refundedCents, 0),
    leadsBought: paid.reduce((s, o) => s + o.quantity, 0),
    leads30d: live.filter((a) => a.assignedAt >= now - 30 * DAY).length,
    contactRate: live.length ? contacted / live.length : null,
    declinedOpen: orders.filter((o) => o.status === "failed" && !o.declineResolvedAt).length,
  };
}

// ─────────────────────────── staff queries ───────────────────────────

export const adminStats = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "accounts.read");
    const all = await ctx.db.query("accounts").collect();
    const balances = await ctx.db.query("accountBalances").collect();
    return {
      total: all.length,
      active: all.filter((a) => a.status === "active").length,
      needsAttention: all.filter((a) => ["pending_verification", "action_required", "suspended", "blocked"].includes(a.status) || a.declinedPurchaseOutstanding).length,
      pending: all.filter((a) => a.status === "pending_verification").map((a) => ({ id: a._id, name: a.name })),
      leadsUnworked: balances.reduce((s, b) => s + b.exclusive + b.standard, 0),
    };
  },
});

export const adminList = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    status: v.optional(v.string()),
    type: v.optional(v.union(v.literal("individual"), v.literal("agency"))),
    balance: v.optional(v.union(v.literal("low"), v.literal("empty"))),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx, "accounts.read");
    const status = args.status as Doc<"accounts">["status"] | undefined;
    let page: { page: Doc<"accounts">[]; isDone: boolean; continueCursor: string };
    if (args.search?.trim()) {
      const results = await ctx.db
        .query("accounts")
        .withSearchIndex("search", (q) => {
          let s = q.search("searchText", args.search!.trim());
          if (status) s = s.eq("status", status);
          if (args.type) s = s.eq("type", args.type);
          return s;
        })
        .take(50);
      page = { page: results, isDone: true, continueCursor: "" };
    } else if (status) {
      page = await ctx.db.query("accounts").withIndex("by_status", (q) => q.eq("status", status)).order("desc").paginate(args.paginationOpts);
    } else {
      page = await ctx.db.query("accounts").order("desc").paginate(args.paginationOpts);
    }
    const rows = [];
    for (const account of page.page) {
      if (args.type && account.type !== args.type) continue;
      const metrics = await accountMetrics(ctx, account);
      if (args.balance === "empty" && metrics.balance.total !== 0) continue;
      if (args.balance === "low" && !(metrics.balance.total > 0 && metrics.balance.total <= 5)) continue;
      rows.push({
        id: account._id,
        name: account.name,
        email: account.email,
        type: account.type,
        status: account.status,
        declinedPurchaseOutstanding: account.declinedPurchaseOutstanding,
        lastAssignedAt: account.lastAssignedAt ?? null,
        ...metrics,
      });
    }
    return { ...page, page: rows };
  },
});

export const adminGet = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    await requireStaff(ctx, "accounts.read");
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    const prefs = await ctx.db
      .query("agentPreferences")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .unique();
    const members = await ctx.db
      .query("agencyMembers")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    const disputes = await ctx.db
      .query("disputes")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    const openingOrder = account.openingOrderId ? await ctx.db.get(account.openingOrderId) : null;
    const licenses = await currentLicenses(ctx, accountId);
    const now = Date.now();
    const dayStart = now - DAY;
    const today = await ctx.db
      .query("leadAssignments")
      .withIndex("by_account_assignedAt", (q) => q.eq("accountId", accountId).gte("assignedAt", dayStart))
      .collect();
    return {
      account,
      preferences: prefs,
      members,
      metrics: await accountMetrics(ctx, account),
      disputes: { total: disputes.length, upheld: disputes.filter((d) => d.status === "upheld").length, pending: disputes.filter((d) => d.status === "pending").length },
      openingOrder,
      licenses,
      verifiedLicenseStates: licenses.filter((l) => isLicenseUsable(l, now)).map((l) => l.state),
      eo: await currentEoPolicy(ctx, accountId),
      tpmo: await tpmoState(ctx, accountId),
      releasedLast24h: today.filter((a) => !a.revokedAt).length,
    };
  },
});

/** Verification queue: applications plus outstanding licence / E&O / TPMO reviews. */
export const verificationQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx, "licenses.verify");
    const applications = [];
    for (const status of ["pending_verification", "action_required"] as const) {
      const rows = await ctx.db.query("accounts").withIndex("by_status", (q) => q.eq("status", status)).collect();
      for (const account of rows) {
        const order = account.openingOrderId ? await ctx.db.get(account.openingOrderId) : null;
        const licenses = await currentLicenses(ctx, account._id);
        applications.push({
          id: account._id,
          name: account.name,
          type: account.type,
          status: account.status,
          appliedAt: account.appliedAt,
          openingQuantity: account.openingQuantity,
          orderStatus: order?.status ?? null,
          orderTotalCents: order?.totalCents ?? 0,
          states: licenses.map((l) => ({ state: l.state, status: l.verificationStatus })),
        });
      }
    }
    return applications.sort((a, b) => a.appliedAt - b.appliedAt);
  },
});

// ─────────────────────────── staff mutations ───────────────────────────

async function loadForChange(ctx: MutationCtx, accountId: Id<"accounts">) {
  const account = await ctx.db.get(accountId);
  if (!account) throw notFound("Account");
  return account;
}

async function changeStatus(
  ctx: MutationCtx,
  account: Doc<"accounts">,
  actor: Actor,
  next: Doc<"accounts">["status"],
  reason: string,
  extra: Partial<Doc<"accounts">> = {},
) {
  await ctx.db.patch(account._id, {
    status: next,
    statusReason: reason,
    statusChangedAt: Date.now(),
    statusChangedBy: actor.kind === "user" ? actor.userId : undefined,
    ...extra,
  });
  await writeAudit(ctx, actor, {
    action: `account.${next}`,
    entityType: "account",
    entityId: account._id,
    accountId: account._id,
    summary: `${account.name}: ${account.status} → ${next}${reason ? ` — ${reason}` : ""}`,
  });
}

export const reject = mutation({
  args: { accountId: v.id("accounts"), reason: v.string(), message: v.optional(v.string()) },
  handler: async (ctx, { accountId, reason, message }) => {
    const staff = await requireStaff(ctx, "accounts.manage");
    const account = await loadForChange(ctx, accountId);
    if (account.status !== "pending_verification" && account.status !== "action_required") throw invalid("Only applications can be rejected.");
    if (!reason.trim()) throw invalid("Choose a rejection reason.");
    const actor = actorFromViewer(staff);
    await changeStatus(ctx, account, actor, "rejected", [reason.trim(), message?.trim()].filter(Boolean).join(". "));
    const order = account.openingOrderId ? await ctx.db.get(account.openingOrderId) : null;
    if (order && order.status !== "paid") {
      await ctx.db.patch(order._id, { status: "canceled", canceledAt: Date.now() });
      if (order.provider === "stripe") {
        await ctx.scheduler.runAfter(0, internal.stripeActions.cancelOpeningAuthorization, { orderId: order._id });
      }
    }
    await notifyAccount(ctx, {
      accountId,
      type: "account",
      title: "Application not approved",
      body: `${reason.trim()}.${message?.trim() ? ` ${message.trim()}` : ""} The card authorisation has been released and nothing was charged.`,
      link: "/apply/pending",
    });
  },
});

export const requestAction = mutation({
  args: { accountId: v.id("accounts"), message: v.string() },
  handler: async (ctx, { accountId, message }) => {
    const staff = await requireStaff(ctx, "accounts.manage");
    const account = await loadForChange(ctx, accountId);
    if (account.status !== "pending_verification" && account.status !== "action_required") throw invalid("Only applications can be sent back.");
    if (message.trim().length < 10) throw invalid("Tell the applicant exactly what is needed.");
    await changeStatus(ctx, account, actorFromViewer(staff), "action_required", message.trim());
    await notifyAccount(ctx, {
      accountId,
      type: "account",
      title: "Action needed on your application",
      body: message.trim(),
      link: "/apply/pending",
    });
  },
});

export const suspend = mutation({
  args: { accountId: v.id("accounts"), reason: v.string() },
  handler: async (ctx, { accountId, reason }) => {
    const staff = await requireStaff(ctx, "accounts.manage");
    const account = await loadForChange(ctx, accountId);
    if (account.status !== "active") throw invalid("Only active accounts can be suspended.");
    if (reason.trim().length < 5) throw invalid("A reason is required.");
    await changeStatus(ctx, account, actorFromViewer(staff), "suspended", reason.trim());
    await notifyAccount(ctx, {
      accountId,
      type: "account",
      title: "Account suspended",
      body: `${reason.trim()} No new leads will be released. Your balance is frozen, not forfeited.`,
      link: "/agent",
    });
  },
});

export const block = mutation({
  args: { accountId: v.id("accounts"), reason: v.string(), note: v.string() },
  handler: async (ctx, { accountId, reason, note }) => {
    const staff = await requireStaff(ctx, "accounts.manage");
    const account = await loadForChange(ctx, accountId);
    if (account.status === "blocked") throw invalid("Account is already blocked.");
    if (note.trim().length < 5) throw invalid("A block needs a written note.");
    await changeStatus(ctx, account, actorFromViewer(staff), "blocked", `${reason}. ${note.trim()}`, { qualityHold: true });
    const prefs = await ctx.db.query("agentPreferences").withIndex("by_account", (q) => q.eq("accountId", accountId)).unique();
    if (prefs?.autoReloadEnabled) await ctx.db.patch(prefs._id, { autoReloadEnabled: false });
    await notifyAccount(ctx, {
      accountId,
      type: "account",
      title: "Your account has been blocked",
      body: `${reason}. Existing leads stay visible; no new leads will be released and your balance is frozen.`,
      link: "/agent",
    });
  },
});

export const restore = mutation({
  args: { accountId: v.id("accounts"), note: v.string() },
  handler: async (ctx, { accountId, note }) => {
    const staff = await requireStaff(ctx, "accounts.manage");
    const account = await loadForChange(ctx, accountId);
    if (account.status !== "suspended" && account.status !== "blocked" && account.status !== "closed") {
      throw invalid("Only suspended, blocked or closed accounts can be restored.");
    }
    if (note.trim().length < 3) throw invalid("A note is required.");
    await changeStatus(ctx, account, actorFromViewer(staff), "active", note.trim(), {
      qualityHold: account.status === "blocked" ? false : account.qualityHold,
      closureRequestedAt: account.status === "closed" ? undefined : account.closureRequestedAt,
    });
    await notifyAccount(ctx, {
      accountId,
      type: "account",
      title: "Account restored",
      body: "Lead flow resumes on the next distribution run. Your balance is exactly as you left it.",
      link: "/agent",
    });
  },
});

export const close = mutation({
  args: { accountId: v.id("accounts"), note: v.string() },
  handler: async (ctx, { accountId, note }) => {
    const staff = await requireStaff(ctx, "accounts.manage");
    const account = await loadForChange(ctx, accountId);
    if (account.status === "closed" || account.status === "rejected") throw invalid("Account is already closed.");
    if (note.trim().length < 5) throw invalid("A note is required.");
    await changeStatus(ctx, account, actorFromViewer(staff), "closed", note.trim());
    const prefs = await ctx.db.query("agentPreferences").withIndex("by_account", (q) => q.eq("accountId", accountId)).unique();
    if (prefs?.autoReloadEnabled) await ctx.db.patch(prefs._id, { autoReloadEnabled: false });
    await notifyAccount(ctx, {
      accountId,
      type: "account",
      title: "Account closed",
      body: "No new leads will be released. Leads already released stay readable. Any remaining balance is frozen and can be restored if the account reopens.",
      link: "/agent",
    });
  },
});

export const setQualityHold = mutation({
  args: { accountId: v.id("accounts"), hold: v.boolean(), reason: v.string() },
  handler: async (ctx, { accountId, hold, reason }) => {
    const staff = await requireStaff(ctx, "accounts.manage");
    const account = await loadForChange(ctx, accountId);
    if (reason.trim().length < 5) throw invalid("A reason is required.");
    await ctx.db.patch(accountId, { qualityHold: hold });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: hold ? "account.hold_on" : "account.hold_off",
      entityType: "account",
      entityId: accountId,
      accountId,
      summary: `${account.name}: quality hold ${hold ? "applied" : "lifted"} — ${reason.trim()}`,
    });
  },
});

export const updateOperationalDetails = mutation({
  args: { accountId: v.id("accounts"), timezone: v.optional(v.string()), city: v.optional(v.string()) },
  handler: async (ctx, { accountId, timezone, city }) => {
    const staff = await requireStaff(ctx, "accounts.manage");
    const account = await loadForChange(ctx, accountId);
    if (timezone) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      } catch {
        throw invalid("Unknown timezone.");
      }
    }
    await ctx.db.patch(accountId, { timezone: timezone ?? account.timezone, city: city?.trim() || account.city });
    await writeAudit(ctx, actorFromViewer(staff), {
      action: "account.update",
      entityType: "account",
      entityId: accountId,
      accountId,
      summary: `Operational details updated (timezone ${timezone ?? account.timezone})`,
    });
  },
});

// ─────────────────────────── approval (called by accountActions.approve) ───────────────────────────

export const getApprovalContext = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    const order = account.openingOrderId ? await ctx.db.get(account.openingOrderId) : null;
    const states = await verifiedStates(ctx, accountId);
    const eo = await currentEoPolicy(ctx, accountId);
    return { account, order, verifiedStates: [...states], eoOk: !!eo && eo.verificationStatus === "verified" && eo.expiresAt > Date.now() };
  },
});

export const finalizeApproval = internalMutation({
  args: { accountId: v.id("accounts"), staffUserId: v.id("users"), note: v.optional(v.string()) },
  handler: async (ctx, { accountId, staffUserId, note }) => {
    const account = await ctx.db.get(accountId);
    const staffUser = await ctx.db.get(staffUserId);
    if (!account || !staffUser) throw notFound("Account");
    if (account.status === "active") return;
    const now = Date.now();
    const actor: Actor = {
      kind: "user",
      userId: staffUserId,
      name: [staffUser.firstName, staffUser.lastName].filter(Boolean).join(" ") || staffUser.email || "Staff",
      role: staffUser.role ?? "ADMIN",
    };
    const verified = await verifiedStates(ctx, accountId);
    const prefs = await ctx.db.query("agentPreferences").withIndex("by_account", (q) => q.eq("accountId", accountId)).unique();
    const dropped = prefs ? prefs.states.filter((s) => !verified.has(s)) : [];
    if (prefs) await ctx.db.patch(prefs._id, { states: prefs.states.filter((s) => verified.has(s)), updatedAt: now });

    await ctx.db.patch(accountId, { status: "active", approvedAt: now, approvedBy: staffUserId, statusReason: note, statusChangedAt: now, statusChangedBy: staffUserId });
    const members = await ctx.db.query("agencyMembers").withIndex("by_account", (q) => q.eq("accountId", accountId)).collect();
    for (const member of members.filter((m) => m.seatRole === "principal")) {
      await ctx.db.patch(member._id, { status: "active" });
      await refreshMemberVerification(ctx, member._id, staffUserId);
    }
    await writeAudit(ctx, actor, {
      action: "account.approve",
      entityType: "account",
      entityId: accountId,
      accountId,
      summary: `${account.name} approved; eligible states ${[...verified].join(", ") || "none"}${dropped.length ? `; dropped ${dropped.join(", ")}` : ""}`,
    });
    const balance = summarizeBalance(await getBalanceDoc(ctx, accountId));
    await notifyAccount(ctx, {
      accountId,
      type: "account",
      title: "Welcome to Legacy Builders",
      body: `Your account is verified and active. ${balance.exclusive} exclusive and ${balance.standard} standard leads are in your balance and do not expire. ${
        dropped.length ? `${dropped.join(", ")} could not be verified and ${dropped.length === 1 ? "is" : "are"} not yet eligible.` : "All requested states are eligible."
      }`,
      link: "/agent",
    });
  },
});

export const recordCaptureFailure = internalMutation({
  args: { accountId: v.id("accounts"), staffUserId: v.id("users"), message: v.string() },
  handler: async (ctx, { accountId, staffUserId, message }) => {
    const account = await ctx.db.get(accountId);
    if (!account) return;
    await ctx.db.patch(accountId, {
      status: "action_required",
      statusReason: `Payment could not be captured: ${message}. Please update your card.`,
      statusChangedAt: Date.now(),
      statusChangedBy: staffUserId,
    });
    await writeAudit(ctx, { kind: "system", name: "Approval" }, {
      action: "account.capture_failed",
      entityType: "account",
      entityId: accountId,
      accountId,
      summary: `Opening purchase capture failed: ${message}`,
    });
    await notifyAccount(ctx, {
      accountId,
      type: "billing",
      title: "We could not take your opening payment",
      body: `${message}. Update your card on the application page and we will complete your approval.`,
      link: "/apply/pending",
    });
  },
});

/** Agent-side: request closure (BD-8 — no automatic cash refund; handled by staff). */
export const requestClosure = mutation({
  args: { reason: v.string(), note: v.optional(v.string()) },
  handler: async (ctx, { reason, note }) => {
    const viewer = await requireAccountViewer(ctx, "purchase");
    if (viewer.account.closureRequestedAt) throw invalid("A closure request is already open.");
    const now = Date.now();
    await ctx.db.patch(viewer.account._id, { closureRequestedAt: now });
    await ctx.db.insert("supportTickets", {
      accountId: viewer.account._id,
      userId: viewer.userId,
      kind: "closure_request",
      category: "Account closure",
      message: `Reason: ${reason}${note?.trim() ? `\n${note.trim()}` : ""}`,
      status: "open",
      createdAt: now,
    });
    await writeAudit(ctx, actorFromViewer(viewer), {
      action: "account.closure_requested",
      entityType: "account",
      entityId: viewer.account._id,
      accountId: viewer.account._id,
      summary: `Closure requested: ${reason}`,
    });
  },
});
