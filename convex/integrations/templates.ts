import { siteUrl } from "../lib/env";

/** Reusable transactional templates in the Legacy Builders navy/gold style. */

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export function layout(options: { heading: string; paragraphs: string[]; cta?: { label: string; url: string }; footnote?: string }): string {
  const paragraphs = options.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#16232F">${escapeHtml(p)}</p>`)
    .join("");
  const cta = options.cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(options.cta.url)}" style="background:#0B2440;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">${escapeHtml(options.cta.label)}</a></p>`
    : "";
  const footnote = options.footnote
    ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#8494A3">${escapeHtml(options.footnote)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F5F7F9;font-family:Inter,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7F9;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #E2E8ED;border-radius:12px;overflow:hidden">
<tr><td style="background:#071A2F;padding:18px 24px;color:#ffffff;font-weight:700;font-size:16px">Legacy Builders <span style="color:#E8C26A">·</span></td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 16px;font-size:20px;color:#0B2440">${escapeHtml(options.heading)}</h1>${paragraphs}${cta}${footnote}</td></tr>
</table></td></tr></table></body></html>`;
}

function build(subject: string, heading: string, paragraphs: string[], cta?: { label: string; url: string }, footnote?: string): RenderedEmail {
  const text = [heading, "", ...paragraphs, ...(cta ? ["", `${cta.label}: ${cta.url}`] : []), ...(footnote ? ["", footnote] : [])].join("\n");
  return { subject, text, html: layout({ heading, paragraphs, cta, footnote }) };
}

export const templates = {
  notification(title: string, body: string, link?: string): RenderedEmail {
    return build(title, title, [body], link ? { label: "Open Legacy Builders", url: siteUrl() + link } : undefined);
  },

  passwordReset(code: string): RenderedEmail {
    return build(
      "Your Legacy Builders password reset code",
      "Reset your password",
      [`Your verification code is ${code}.`, "It expires in 15 minutes. If you did not ask to reset your password, you can ignore this email."],
      { label: "Enter the code", url: siteUrl() + "/auth/verify" },
    );
  },

  consumerRequestReceived(reference: string): RenderedEmail {
    return build(
      `Your request ${reference} has been received`,
      "You are all set",
      [
        `We have your request. Your reference number is ${reference}.`,
        "A licensed agent in your state will contact you, usually within one business day. There is no cost to you.",
        "You can withdraw consent at any time using your reference number, or by replying STOP to any text message.",
      ],
      { label: "Withdraw consent", url: siteUrl() + "/request/withdraw" },
    );
  },

  consumerMatched(reference: string, agentNames: string[]): RenderedEmail {
    return build(
      `Your request ${reference} has been matched`,
      "Your licensed agent" + (agentNames.length > 1 ? "s" : ""),
      [
        `Your request ${reference} was released to: ${agentNames.join(", ")}.`,
        "Expect a call or message from them soon. You can withdraw consent at any time.",
      ],
      { label: "Withdraw consent", url: siteUrl() + "/request/withdraw" },
    );
  },

  producerInvitation(agencyName: string, url: string): RenderedEmail {
    return build(
      `You have been invited to ${agencyName} on Legacy Builders`,
      "Join your agency",
      [
        `${agencyName} has added you as a producer seat. Seats are free.`,
        "Accept the invitation to create your login. Your licences are reviewed before any lead can be handed to you.",
      ],
      { label: "Accept invitation", url },
      "This invitation expires in 7 days.",
    );
  },

  staffInvitation(role: string, url: string): RenderedEmail {
    return build(
      "You have been invited to the Legacy Builders back office",
      "Staff invitation",
      [`You have been invited with the ${role} role. Two-factor authentication is required for staff accounts.`],
      { label: "Accept invitation", url },
      "This invitation expires in 7 days.",
    );
  },

  receipt(orderNumber: string, lines: string[], total: string): RenderedEmail {
    return build(
      `Receipt ${orderNumber} — Legacy Builders`,
      "Thank you for your purchase",
      [...lines, `Total paid: ${total}.`, "These leads are in your balance now and do not expire."],
      { label: "View your balance", url: siteUrl() + "/agent/balance" },
    );
  },
};
