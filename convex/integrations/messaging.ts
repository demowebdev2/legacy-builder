import { v } from "convex/values";
import { maskEmail, maskPhone } from "../../src/domain/normalize";
import { internal } from "../_generated/api";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { sendEmail, sendSms } from "./providers";
import { templates } from "./templates";

/** Delivery log — every email/SMS attempt, including bypassed ones. */
export const logOutbound = internalMutation({
  args: {
    channel: v.union(v.literal("email"), v.literal("sms")),
    template: v.string(),
    to: v.string(),
    subject: v.optional(v.string()),
    bodyPreview: v.optional(v.string()),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("bypassed"), v.literal("failed")),
    provider: v.string(),
    providerMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
    leadId: v.optional(v.id("leads")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("outboundMessages", {
      ...args,
      createdAt: now,
      sentAt: args.status === "sent" ? now : undefined,
    });
  },
});

export const getDeliveryTarget = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const notification = await ctx.db.get(notificationId);
    if (!notification?.accountId) return null;
    const account = await ctx.db.get(notification.accountId);
    if (!account) return null;
    return {
      notification,
      email: account.email,
      phone: account.phone,
    };
  },
});

/** Fans an in-app notification out to the email / SMS channels it was created with. */
export const deliverNotification = internalAction({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const target = await ctx.runQuery(internal.integrations.messaging.getDeliveryTarget, { notificationId });
    if (!target) return;
    const { notification } = target;
    if (notification.channels.includes("email")) {
      const rendered = templates.notification(notification.title, notification.body, notification.link);
      const result = await sendEmail({ to: target.email, ...rendered, tag: notification.type });
      await ctx.runMutation(internal.integrations.messaging.logOutbound, {
        channel: "email",
        template: `notification:${notification.type}`,
        to: maskEmail(target.email),
        subject: rendered.subject,
        bodyPreview: notification.body.slice(0, 140),
        status: result.status,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        error: result.error,
        accountId: notification.accountId,
        leadId: notification.relatedLeadId,
      });
    }
    if (notification.channels.includes("sms")) {
      const body = `Legacy Builders: ${notification.title}. ${notification.body}`.slice(0, 300);
      const result = await sendSms({ to: target.phone, body });
      await ctx.runMutation(internal.integrations.messaging.logOutbound, {
        channel: "sms",
        template: `notification:${notification.type}`,
        to: maskPhone(target.phone),
        bodyPreview: body.slice(0, 140),
        status: result.status,
        provider: result.provider,
        providerMessageId: result.providerMessageId,
        error: result.error,
        accountId: notification.accountId,
        leadId: notification.relatedLeadId,
      });
    }
  },
});

/** Direct transactional email (consumers, invitations, receipts). */
export const sendTransactionalEmail = internalAction({
  args: {
    to: v.string(),
    template: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.string(),
    accountId: v.optional(v.id("accounts")),
    leadId: v.optional(v.id("leads")),
  },
  handler: async (ctx, args) => {
    const result = await sendEmail({ to: args.to, subject: args.subject, text: args.text, html: args.html, tag: args.template });
    await ctx.runMutation(internal.integrations.messaging.logOutbound, {
      channel: "email",
      template: args.template,
      to: maskEmail(args.to),
      subject: args.subject,
      bodyPreview: args.text.slice(0, 140),
      status: result.status,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      error: result.error,
      accountId: args.accountId,
      leadId: args.leadId,
    });
  },
});

export const sendTransactionalSms = internalAction({
  args: {
    to: v.string(),
    template: v.string(),
    body: v.string(),
    accountId: v.optional(v.id("accounts")),
    leadId: v.optional(v.id("leads")),
  },
  handler: async (ctx, args) => {
    const result = await sendSms({ to: args.to, body: args.body });
    await ctx.runMutation(internal.integrations.messaging.logOutbound, {
      channel: "sms",
      template: args.template,
      to: maskPhone(args.to),
      bodyPreview: args.body.slice(0, 140),
      status: result.status,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      error: result.error,
      accountId: args.accountId,
      leadId: args.leadId,
    });
  },
});
