/**
 * Provider mode resolution. Every external integration has a bypass mode so the platform runs
 * end-to-end before credentials exist. Bypass is visible in Admin → Settings → Integrations.
 */

export type EmailMode = "postmark" | "console";
export type SmsMode = "twilio" | "console";
export type PaymentsMode = "stripe" | "mock";

const env = (name: string): string | undefined => {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
};

export function isProductionDeployment(): boolean {
  return env("APP_ENV") === "production";
}

export function siteUrl(): string {
  return (env("SITE_URL") ?? "http://localhost:3000").replace(/\/$/, "");
}

export function emailMode(): EmailMode {
  return env("EMAIL_PROVIDER") === "postmark" && env("POSTMARK_SERVER_TOKEN") ? "postmark" : "console";
}

export function smsMode(): SmsMode {
  const configured =
    env("SMS_PROVIDER") === "twilio" &&
    env("TWILIO_ACCOUNT_SID") &&
    env("TWILIO_AUTH_TOKEN") &&
    (env("TWILIO_FROM_NUMBER") || env("TWILIO_MESSAGING_SERVICE_SID"));
  return configured ? "twilio" : "console";
}

export function paymentsMode(): PaymentsMode {
  return env("PAYMENTS_PROVIDER") === "stripe" && env("STRIPE_SECRET_KEY") ? "stripe" : "mock";
}

/** Mock payments are refused on a production deployment unless explicitly allowed. */
export function mockPaymentsAllowed(): boolean {
  return !isProductionDeployment() || env("ALLOW_PAYMENT_BYPASS") === "true";
}

export function staffMfaRequired(): boolean {
  const flag = env("REQUIRE_STAFF_2FA");
  if (flag === "true") return true;
  if (flag === "false") return false;
  return isProductionDeployment();
}

export function readEnv(name: string): string | undefined {
  return env(name);
}

export function integrationStatus() {
  return {
    email: { mode: emailMode(), fromAddress: env("EMAIL_FROM") ?? null },
    sms: { mode: smsMode(), from: env("TWILIO_FROM_NUMBER") ?? env("TWILIO_MESSAGING_SERVICE_SID") ?? null },
    payments: {
      mode: paymentsMode(),
      webhookConfigured: !!env("STRIPE_WEBHOOK_SECRET"),
      bypassAllowed: mockPaymentsAllowed(),
    },
    meta: { configured: !!env("META_APP_SECRET") && !!env("META_VERIFY_TOKEN"), graphToken: !!env("META_PAGE_ACCESS_TOKEN") },
    partnerApi: { configured: !!env("PARTNER_API_SIGNING_SECRET") },
    intake: { configured: !!env("INTAKE_SHARED_SECRET") },
    staffMfaRequired: staffMfaRequired(),
    production: isProductionDeployment(),
  };
}
