import { v } from "convex/values";
import { DISPUTE_REASONS } from "../src/domain/constants";
import { roleHasPermission } from "../src/domain/permissions";
import { query } from "./_generated/server";
import { requireStaff } from "./lib/auth";

/**
 * Read-only, per-account views used by Admin → Accounts → account detail (Purchases, Finance and
 * Disputes tabs). Queries only — nothing here writes, so there is nothing to audit.
 */

const reasonLabel = (key: string) => DISPUTE_REASONS.find((r) => r.key === key)?.label ?? key;

/** Every order for one account, newest first, with its payment attempts, captures and refunds. */
export const ordersForAccount = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    await requireStaff(ctx, "payments.read");
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .order("desc")
      .take(500);
    const rows = [];
    for (const order of orders) {
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .order("desc")
        .collect();
      rows.push({
        ...order,
        refundableCents: Math.max(0, order.totalCents - order.refundedCents),
        payments,
      });
    }
    return rows;
  },
});

/** Disputes raised by one account, newest first. Consumer names follow the viewer's PII permission. */
export const disputesForAccount = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const staff = await requireStaff(ctx, "disputes.read");
    const canSeePii = roleHasPermission(staff.role, "leads.pii");
    const disputes = await ctx.db
      .query("disputes")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .order("desc")
      .take(500);
    const rows = [];
    for (const d of disputes) {
      const lead = await ctx.db.get(d.leadId);
      rows.push({
        ...d,
        reasonLabel: reasonLabel(d.reason),
        reference: lead?.reference ?? "—",
        consumerName: lead ? (canSeePii ? `${lead.firstName} ${lead.lastName}` : `${lead.firstName.charAt(0)}. ${lead.lastName.charAt(0)}.`) : "—",
      });
    }
    return rows;
  },
});
