import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { errorCode, errorMessage } from "@/lib/errors";

/**
 * Helpers for public route handlers that forward to Convex with the intake shared secret.
 * Never log request bodies — they contain consumer PII.
 */

export function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return (first || request.headers.get("x-real-ip")?.trim() || undefined)?.slice(0, 64);
}

export function userAgent(request: Request): string | undefined {
  return request.headers.get("user-agent")?.slice(0, 512) || undefined;
}

export function convexClient(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

export function intakeSecret(): string | undefined {
  return process.env.INTAKE_SHARED_SECRET || undefined;
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Maps a Convex error to a JSON error response (429 for rate limits, 400 otherwise). */
export function convexErrorResponse(error: unknown) {
  const code = errorCode(error);
  if (code === "RATE_LIMITED") return jsonError(errorMessage(error), 429);
  if (code === "FORBIDDEN" || code === "CONFIGURATION") {
    console.error("[intake] rejected by backend", code);
    return jsonError("We could not accept this right now. Please try again later.", 503);
  }
  if (code === "INVALID" || code === "CONFLICT" || code === "NOT_FOUND") return jsonError(errorMessage(error), 400);
  console.error("[intake] backend call failed", error instanceof Error ? error.name : "unknown");
  return jsonError("Something went wrong on our side. Please try again.", 500);
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
