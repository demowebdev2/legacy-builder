import type { Metadata } from "next";
import { api } from "@convex/_generated/api";
import { RequestWizard } from "@/components/forms/RequestWizard";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Get matched with a licensed agent — Legacy Builders",
  description: "Free, about two minutes, and you are never charged. Tell us what cover you need and a licensed agent in your state will contact you.",
  path: "/request",
});

export default async function RequestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const coverage = typeof params.coverage === "string" ? params.coverage.slice(0, 40) : undefined;
  const state = typeof params.state === "string" ? params.state.slice(0, 2).toUpperCase() : undefined;
  const [reference, consent] = await Promise.all([
    fetchPublic(api.referenceData.publicData, {}),
    fetchPublic(api.legalDocuments.published, { docType: "consumer_consent" }),
  ]);
  return <RequestWizard initialCoverage={coverage} initialState={state} initialReference={reference} initialConsent={consent} />;
}
