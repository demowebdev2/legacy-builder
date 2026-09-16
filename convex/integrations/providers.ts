import { maskEmail, maskPhone } from "../../src/domain/normalize";
import { emailMode, isProductionDeployment, readEnv, smsMode } from "../lib/env";

/**
 * Provider adapters. The rest of the codebase never calls Postmark or Twilio directly — it calls
 * these functions, which fall back to a console "bypass" when credentials are not configured.
 */

export interface DeliveryResult {
  status: "sent" | "bypassed" | "failed";
  provider: string;
  providerMessageId?: string;
  error?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  tag?: string;
}

export async function sendEmail(message: EmailMessage): Promise<DeliveryResult> {
  if (emailMode() === "console") {
    // Full body only outside production so password-reset codes are usable in development.
    const body = isProductionDeployment() ? "[body hidden]" : message.text;
    console.log(`[email:bypass] to=${maskEmail(message.to)} subject="${message.subject}"\n${body}`);
    return { status: "bypassed", provider: "console" };
  }
  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": readEnv("POSTMARK_SERVER_TOKEN") ?? "",
      },
      body: JSON.stringify({
        From: readEnv("EMAIL_FROM") ?? "Legacy Builders <no-reply@legacybuilders.com>",
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
        HtmlBody: message.html,
        Tag: message.tag,
        MessageStream: readEnv("POSTMARK_MESSAGE_STREAM") ?? "outbound",
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { MessageID?: string; Message?: string; ErrorCode?: number };
    if (!response.ok || (data.ErrorCode && data.ErrorCode !== 0)) {
      return { status: "failed", provider: "postmark", error: data.Message ?? `HTTP ${response.status}` };
    }
    return { status: "sent", provider: "postmark", providerMessageId: data.MessageID };
  } catch (error) {
    return { status: "failed", provider: "postmark", error: error instanceof Error ? error.message : String(error) };
  }
}

export interface SmsMessage {
  to: string;
  body: string;
}

export async function sendSms(message: SmsMessage): Promise<DeliveryResult> {
  if (smsMode() === "console") {
    console.log(`[sms:bypass] to=${maskPhone(message.to)} "${message.body}"`);
    return { status: "bypassed", provider: "console" };
  }
  const sid = readEnv("TWILIO_ACCOUNT_SID") ?? "";
  const token = readEnv("TWILIO_AUTH_TOKEN") ?? "";
  const form = new URLSearchParams({ To: message.to, Body: message.body });
  const messagingService = readEnv("TWILIO_MESSAGING_SERVICE_SID");
  if (messagingService) form.set("MessagingServiceSid", messagingService);
  else form.set("From", readEnv("TWILIO_FROM_NUMBER") ?? "");
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${token}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const data = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!response.ok) return { status: "failed", provider: "twilio", error: data.message ?? `HTTP ${response.status}` };
    return { status: "sent", provider: "twilio", providerMessageId: data.sid };
  } catch (error) {
    return { status: "failed", provider: "twilio", error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Twilio request validation: HMAC-SHA1 over the full webhook URL followed by each POST parameter
 * name+value sorted by name, base64 encoded, compared to X-Twilio-Signature.
 */
export async function isValidTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
): Promise<boolean> {
  const token = readEnv("TWILIO_AUTH_TOKEN");
  if (!token || !signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return timingSafeEqual(expected, signature);
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
