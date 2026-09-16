import "server-only";
import { fetchQuery } from "convex/nextjs";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { unstable_rethrow } from "next/navigation";

/**
 * Server-side Convex reads for public, SEO-rendered pages. Fails soft (returns null) so a marketing
 * page still renders its prototype defaults if the backend is unreachable — but never swallows
 * Next.js control-flow errors (dynamic rendering, redirects, notFound).
 */
export async function fetchPublic<Q extends FunctionReference<"query", "public">>(
  query: Q,
  args: Q["_args"],
): Promise<FunctionReturnType<Q> | null> {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return null;
  try {
    return await fetchQuery(query, args);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[convex] public fetch failed", error instanceof Error ? error.message : error);
    return null;
  }
}
