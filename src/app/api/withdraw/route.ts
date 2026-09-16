import { NextResponse } from "next/server";
import { api } from "@convex/_generated/api";
import { firstIssue, withdrawalSchema } from "@/domain/schemas/consumerRequest";
import { clientIp, convexClient, convexErrorResponse, intakeSecret, jsonError, readJson, userAgent } from "../_lib/intake";

/** Consent withdrawal by reference number + the email or mobile used. Matching happens in Convex. */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return jsonError("Please reload the page and try again.");
  const parsed = withdrawalSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error));

  const client = convexClient();
  if (!client) return jsonError("Withdrawals cannot be taken on this deployment right now. Please contact us directly.", 503);
  try {
    const result = await client.action(api.intake.withdrawConsent, {
      secret: intakeSecret(),
      reference: parsed.data.reference,
      contact: parsed.data.contact,
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
    });
    return NextResponse.json({ reference: result.reference, alreadyWithdrawn: result.alreadyWithdrawn }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return convexErrorResponse(error);
  }
}
