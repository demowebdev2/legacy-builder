import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

type Channel = "in_app" | "email" | "sms";

/**
 * Creates an in-app notification and schedules email/SMS delivery.
 * - `compliance: true` (cease-contact notices) always uses every channel and ignores preferences.
 * - New-lead notices honour the account's email/SMS preferences.
 */
export async function notifyAccount(
  ctx: MutationCtx,
  input: {
    accountId: Id<"accounts">;
    type: Doc<"notifications">["type"];
    title: string;
    body: string;
    link?: string;
    channels?: Channel[];
    compliance?: boolean;
    relatedLeadId?: Id<"leads">;
  },
): Promise<Id<"notifications">> {
  let channels: Channel[] = input.channels ?? ["in_app", "email"];
  if (input.compliance) {
    channels = ["in_app", "email", "sms"];
  } else if (input.type === "lead") {
    const prefs = await ctx.db
      .query("agentPreferences")
      .withIndex("by_account", (q) => q.eq("accountId", input.accountId))
      .unique();
    channels = ["in_app"];
    if (prefs?.notifyEmailOnLead ?? true) channels.push("email");
    if (prefs?.notifySmsOnLead ?? true) channels.push("sms");
  }
  if (!channels.includes("in_app")) channels = ["in_app", ...channels];
  const id = await ctx.db.insert("notifications", {
    audience: "account",
    accountId: input.accountId,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link,
    channels,
    createdAt: Date.now(),
    relatedLeadId: input.relatedLeadId,
  });
  if (channels.some((c) => c !== "in_app")) {
    await ctx.scheduler.runAfter(0, internal.integrations.messaging.deliverNotification, { notificationId: id });
  }
  return id;
}

/** Staff feed (admin dashboard bell). */
export async function notifyStaff(
  ctx: MutationCtx,
  input: { type: Doc<"notifications">["type"]; title: string; body: string; link?: string; relatedLeadId?: Id<"leads"> },
): Promise<void> {
  await ctx.db.insert("notifications", {
    audience: "staff",
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link,
    channels: ["in_app"],
    createdAt: Date.now(),
    relatedLeadId: input.relatedLeadId,
  });
}
