import { NextResponse } from "next/server";
import { api } from "@convex/_generated/api";
import { consumerRequestSchema, firstIssue, SPAM_MIN_FILL_MS, spamFieldsSchema } from "@/domain/schemas/consumerRequest";
import { clientIp, convexClient, convexErrorResponse, intakeSecret, jsonError, readJson, userAgent } from "../_lib/intake";

/**
 * Consumer request intake (website). Spam checks run here; validation runs here and again in Convex, which
 * also records the consent evidence (document version + hash, IP, user agent, page URL) and rate limits.
 * Request bodies are never logged.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return jsonError("Please reload the page and try again.");

  const spam = spamFieldsSchema.safeParse(body);
  if (!spam.success) return jsonError("Please reload the page and try again.");
  if (spam.data.company) return jsonError("We could not accept this request. Please reload the page and try again.");
  if (Date.now() - spam.data.startedAt < SPAM_MIN_FILL_MS) {
    return jsonError("That was very quick — please check your details and submit again.", 429);
  }

  const parsed = consumerRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(firstIssue(parsed.error));
  const r = parsed.data;

  const client = convexClient();
  if (!client) return jsonError("Requests cannot be taken on this deployment right now.", 503);

  try {
    const result = await client.mutation(api.intake.submitWebsiteRequest, {
      secret: intakeSecret(),
      ipAddress: clientIp(request),
      userAgent: userAgent(request),
      request: {
        coverageType: r.coverageType,
        additionalCoverageTypes: r.additionalCoverageTypes?.length ? r.additionalCoverageTypes : undefined,
        ageRange: r.ageRange,
        state: r.state,
        zip: r.zip,
        coverageAmount: r.coverageAmount || undefined,
        protecting: r.protecting || undefined,
        budgetRange: r.budgetRange,
        reason: r.reason,
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
        email: r.email,
        bestTimeToCall: r.bestTimeToCall || undefined,
        preferredContactMethod: r.preferredContactMethod,
        consentDocumentId: r.consentDocumentId,
        consentAccepted: r.consentAccepted,
        termsAccepted: r.termsAccepted,
        pageUrl: (r.pageUrl || request.headers.get("referer") || "").slice(0, 500) || undefined,
        marketingSource: r.marketingSource || undefined,
        gclid: r.gclid || undefined,
      },
    });
    return NextResponse.json({ reference: result.reference, token: result.token }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return convexErrorResponse(error);
  }
}
