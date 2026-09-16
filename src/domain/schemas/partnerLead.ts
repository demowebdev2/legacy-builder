import { z } from "zod";
import { REASON_MAX_LENGTH, REASON_MIN_LENGTH } from "../constants";

/**
 * Signed partner API payload. Partners must send consent evidence captured on their own form;
 * without it the lead is rejected (no consent, no lead).
 */
export const partnerLeadSchema = z.object({
  externalId: z.string().trim().min(1).max(120),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().min(3).max(254),
  phone: z.string().trim().min(7).max(30),
  state: z.string().trim().length(2),
  zip: z.string().trim().min(5).max(10),
  city: z.string().trim().max(80).optional(),
  coverageType: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(REASON_MIN_LENGTH).max(REASON_MAX_LENGTH),
  budgetRange: z.string().trim().max(120).optional(),
  ageRange: z.string().trim().max(120).optional(),
  bestTimeToCall: z.string().trim().max(120).optional(),
  consent: z.object({
    text: z.string().trim().min(20).max(5000),
    version: z.string().trim().min(1).max(120),
    agreedAt: z.string().datetime(),
    ipAddress: z.string().trim().max(64).optional(),
    userAgent: z.string().trim().max(512).optional(),
    pageUrl: z.string().trim().max(500).optional(),
  }),
});

export type PartnerLead = z.infer<typeof partnerLeadSchema>;

/** Default Meta Lead Ads form field names → our fields. Custom questions should use these keys. */
export const META_FIELD_MAP: Record<string, string> = {
  first_name: "firstName",
  last_name: "lastName",
  full_name: "fullName",
  email: "email",
  phone_number: "phone",
  state: "state",
  zip_code: "zip",
  post_code: "zip",
  city: "city",
  coverage_type: "coverageType",
  what_brings_you_here: "reason",
  reason: "reason",
  monthly_budget: "budgetRange",
  age_range: "ageRange",
  best_time_to_call: "bestTimeToCall",
};
