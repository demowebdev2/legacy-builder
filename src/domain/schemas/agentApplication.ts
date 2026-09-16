import { z } from "zod";
import { MAX_PRODUCER_SEATS, PASSWORD_MIN_LENGTH } from "../constants";
import { normalizeEmail, normalizeUsPhone } from "../normalize";
import { isValidPurchaseQuantity } from "../purchase";

const text = (label: string, max = 120) =>
  z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max);

export const entityStepSchema = z.object({
  entityType: z.enum(["individual", "agency"], { error: "Choose individual or agency." }),
});

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(128, "Password is too long.");

export const detailsStepSchema = z
  .object({
    entityType: z.enum(["individual", "agency"]),
    firstName: text("First name", 60),
    lastName: text("Last name", 60),
    email: z.string().trim().refine((v) => normalizeEmail(v) !== null, "Enter a valid email address."),
    phone: z.string().trim().refine((v) => normalizeUsPhone(v) !== null, "Enter a valid US mobile number."),
    businessName: z.string().trim().max(160).optional().default(""),
    ein: z.string().trim().optional().default(""),
    producerCount: z.string().trim().optional().default(""),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.password !== v.passwordConfirm) {
      ctx.addIssue({ code: "custom", path: ["passwordConfirm"], message: "Passwords do not match." });
    }
    if (v.entityType === "agency") {
      if (!v.businessName) ctx.addIssue({ code: "custom", path: ["businessName"], message: "Agency legal name is required." });
      if (!/^\d{2}-?\d{7}$/.test(v.ein)) ctx.addIssue({ code: "custom", path: ["ein"], message: "Enter a 9-digit EIN (00-0000000)." });
      if (!v.producerCount) ctx.addIssue({ code: "custom", path: ["producerCount"], message: "Choose how many producers." });
    }
  });

export const licenseEntrySchema = z.object({
  state: z.string().regex(/^[A-Z]{2}$/),
  licenseNumber: text("Licence number", 40),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the licence expiry date."),
});

export const licensingStepSchema = z.object({
  npn: z.string().trim().regex(/^\d{4,10}$/, "Enter your National Producer Number (digits only)."),
  residentState: z.string().regex(/^[A-Z]{2}$/, "Choose your resident state."),
  licenses: z.array(licenseEntrySchema).min(1, "Select at least one licensed state."),
  eoCarrier: text("E&O carrier", 120),
  eoPolicyNumber: z.string().trim().max(60).optional().default(""),
  eoExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the E&O expiry date."),
});

export const preferencesStepSchema = z.object({
  coverageTypes: z.array(z.string()).min(1, "Choose at least one product."),
  dailyPace: z.number().int().min(1).max(50),
  seats: z.number().int().min(1).max(MAX_PRODUCER_SEATS),
  requestTpmo: z.boolean(),
  tpmoAttested: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.coverageTypes.includes("medicare") && !v.requestTpmo) {
    ctx.addIssue({ code: "custom", path: ["requestTpmo"], message: "Medicare leads need TPMO approval — request it or remove Medicare." });
  }
  if (v.requestTpmo && !v.tpmoAttested) {
    ctx.addIssue({ code: "custom", path: ["tpmoAttested"], message: "Please confirm the Medicare TPMO attestation." });
  }
});

export const paymentStepSchema = z.object({
  quantity: z.number().refine(isValidPurchaseQuantity, "Choose a valid number of leads."),
  autoReload: z.boolean(),
  agreementDocumentId: z.string().min(1),
  agreeLicensed: z.literal(true, { error: "Please confirm your licensing." }),
  agreeContactLaw: z.literal(true, { error: "Please confirm telemarketing compliance." }),
  agreeTerms: z.literal(true, { error: "Please accept the purchase terms." }),
});
