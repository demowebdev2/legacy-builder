import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAccountViewer } from "./lib/auth";

/**
 * Read models for agent portal screens that the domain modules do not already expose.
 * Everything is scoped to the caller's own account — no account id is ever accepted from the client.
 */

/** Payment attempts, captures and refunds on the caller's orders (Billing & purchases → payments table). */
export const myPayments = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const viewer = await requireAccountViewer(ctx, "purchase", { allowPending: true });
    const page = await ctx.db
      .query("payments")
      .withIndex("by_account", (q) => q.eq("accountId", viewer.account._id))
      .order("desc")
      .paginate(paginationOpts);
    const orders = new Map<Id<"orders">, Doc<"orders"> | null>();
    const rows = [];
    for (const p of page.page) {
      if (!orders.has(p.orderId)) orders.set(p.orderId, await ctx.db.get(p.orderId));
      const order = orders.get(p.orderId);
      rows.push({
        id: p._id,
        orderId: p.orderId,
        orderNumber: order?.orderNumber ?? "—",
        orderLabel: order?.label ?? "",
        quantity: order?.quantity ?? 0,
        kind: p.kind,
        status: p.status,
        amountCents: p.amountCents,
        documentNumber: p.documentNumber ?? null,
        cardBrand: p.cardBrand ?? null,
        cardLast4: p.cardLast4 ?? null,
        failureMessage: p.failureMessage ?? null,
        reason: p.reason ?? null,
        createdAt: p.createdAt,
      });
    }
    return { ...page, page: rows };
  },
});
