import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import { normalizeEmail, normalizeUsPhone } from "@/domain/normalize";
import { firstIssue } from "@/domain/schemas/consumerRequest";
import { clientIp, convexClient, convexErrorResponse, intakeSecret, jsonError, readJson } from "../_lib/intake";

const contactSchema = z.object({
  audience: z.enum(["consumer", "agent", "other"], { error: "Tell us who you are." }),
  name: z.string().trim().min(1, "Enter your name.").max(120, "Name is too long."),
  email: z
    .string()
    .trim()
    .refine((v) => normalizeEmail(v) !== null, "Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .default("")
    .refine((v) => !v || normalizeUsPhone(v) !== null, "Enter a valid US phone number, or leave it blank."),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(4000, "Please keep your message under 4,000 characters."),
  company: z.string().max(0).optional().default(""),
});

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return jsonError("Please reload the page and try again.");
  // Honeypot: real visitors never see or fill this field. Pretend success so bots learn nothing.
  if (typeof body.company === "string" && body.company.length > 0) return NextResponse.json({ ok: true });
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const client = convexClient();
  if (!client) return jsonError("Messaging is not configured on this deployment.", 503);
  try {
    await client.mutation(api.support.submitContact, {
      secret: intakeSecret(),
      ipAddress: clientIp(request),
      audience: parsed.data.audience,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || undefined,
      message: parsed.data.message,
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return convexErrorResponse(error);
  }
}
