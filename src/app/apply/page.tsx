import type { Metadata } from "next";
import { api } from "@convex/_generated/api";
import { ApplicationWizard } from "@/components/forms/application/ApplicationWizard";
import { isValidPurchaseQuantity } from "@/domain/purchase";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Apply to join — Legacy Builders",
  description: "Apply as a licensed individual producer or agency. No card is charged and no lead is released until your licence is verified.",
  path: "/apply",
});

export default async function ApplyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const qty = typeof params.qty === "string" ? Number(params.qty) : undefined;
  const reference = await fetchPublic(api.referenceData.publicData, {});
  return <ApplicationWizard initialQty={isValidPurchaseQuantity(qty) ? qty : undefined} initialReference={reference} />;
}
