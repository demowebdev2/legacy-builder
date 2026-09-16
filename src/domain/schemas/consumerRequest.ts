import { z } from "zod";
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from "../constants";
import { normalizeEmail, normalizeUsPhone, normalizeZip } from "../normalize";

/**
 * Consumer request validation shared by the wizard (per step), the Next.js route handler and the
 * Convex intake mutation. Option values (age range, budget…) are validated against live reference
 * data on the server; here we only check shape.
 */

const requiredText = (label: string, max = 120) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);

export const coverageStepSchema = z.object({
  coverageType: requiredText("Please choose what you need help with", 40),
});

export const aboutStepSchema = z.object({
  ageRange: requiredText("Age range"),
  state: z.string().regex(/^[A-Z]{2}$/, "Please choose your state."),
  zip: z
    .string()
    .trim()
    .refine((v) => normalizeZip(v) !== null, "Enter a 5-digit ZIP code."),
  coverageAmount: z.string().trim().max(120).optional().default(""),
  protecting: z.string().trim().max(120).optional().default(""),
  budgetRange: requiredText("Monthly budget"),
});

export const reasonStepSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(REASON_MIN_LENGTH, `Please tell us a little more (at least ${REASON_MIN_LENGTH} characters).`)
    .max(REASON_MAX_LENGTH, `Please keep this under ${REASON_MAX_LENGTH} characters.`),
});

export const contactStepSchema = z.object({
  firstName: requiredText("First name", 60),
  lastName: requiredText("Last name", 60),
  phone: z
    .string()
    .trim()
    .refine((v) => normalizeUsPhone(v) !== null, "Enter a valid US mobile number."),
  email: z
    .string()
    .trim()
    .refine((v) => normalizeEmail(v) !== null, "Enter a valid email address."),
  bestTimeToCall: z.string().trim().max(120).optional().default(""),
  preferredContactMethod: requiredText("Preferred contact method"),
});

export const consentStepSchema = z.object({
  consentDocumentId: z.string().min(1, "Consent wording is missing — please reload the page."),
  consentAccepted: z.literal(true, { error: "Please agree to be contacted so an agent can reach you." }),
  termsAccepted: z.literal(true, { error: "Please accept the Privacy Policy and Terms of Use." }),
});

export const consumerRequestSchema = coverageStepSchema
  .extend(aboutStepSchema.shape)
  .extend(reasonStepSchema.shape)
  .extend(contactStepSchema.shape)
  .extend(consentStepSchema.shape)
  .extend({
    pageUrl: z.string().max(500).optional().default(""),
    marketingSource: z.string().max(60).optional(),
    gclid: z.string().max(200).optional(),
  });

export type ConsumerRequestInput = z.input<typeof consumerRequestSchema>;
export type ConsumerRequest = z.output<typeof consumerRequestSchema>;

/** Spam controls checked by the route handler before anything reaches Convex. */
export const SPAM_MIN_FILL_MS = 4000;
export const spamFieldsSchema = z.object({
  /** honeypot — must be empty */
  company: z.string().max(0).optional().default(""),
  /** client timestamp when the wizard was opened */
  startedAt: z.number().int().positive(),
});

export const withdrawalSchema = z.object({
  reference: z.string().trim().min(6, "Enter your reference number."),
  contact: z.string().trim().min(3, "Enter the email address or mobile number you used."),
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
