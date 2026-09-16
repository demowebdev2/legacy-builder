import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { getBalanceDoc } from "./ledger";
import { SYSTEM_ACTOR } from "./lib/auth";
import { createOrderRecord } from "./orders";

/**
 * Auto-reload: when the total balance falls to the agent's threshold, buy the configured quantity at
 * the current rate. Runs after a debit, inside the same transaction that created the debit; the
 * charge itself happens in a scheduled action. A declined card does not credit leads and does not
 * retry automatically — the agent (or finance) retries.
 */
export async function maybeTriggerAutoReload(ctx: MutationCtx, accountId: Id<"accounts">): Promise<Id<"orders"> | null> {
  const prefs = await ctx.db
    .query("agentPreferences")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .unique();
  if (!prefs?.autoReloadEnabled) return null;
  const account = await ctx.db.get(accountId);
  if (!account || account.status !== "active" || account.declinedPurchaseOutstanding) return null;
  if (prefs.autoReloadPendingOrderId) {
    const pending = await ctx.db.get(prefs.autoReloadPendingOrderId);
    if (pending && pending.status === "requires_payment") return null;
  }
  const balance = await getBalanceDoc(ctx, accountId);
  const total = (balance?.exclusive ?? 0) + (balance?.standard ?? 0);
  if (total > prefs.autoReloadThreshold) return null;

  const order = await createOrderRecord(ctx, {
    account,
    kind: "auto_reload",
    quantity: prefs.autoReloadQuantity,
    label: "Auto-reload",
    actor: SYSTEM_ACTOR,
  });
  await ctx.db.patch(prefs._id, { autoReloadPendingOrderId: order._id });
  if (order.provider === "stripe") {
    await ctx.scheduler.runAfter(0, internal.stripeActions.chargeAutoReload, { orderId: order._id });
  } else {
    await ctx.scheduler.runAfter(0, internal.payments.mockChargeAutoReload, { orderId: order._id });
  }
  return order._id;
}
