import type { Metadata } from "next";
import { RequestConfirmation } from "@/components/forms/RequestConfirmation";

export const metadata: Metadata = {
  title: "Request received — Legacy Builders",
  robots: { index: false, follow: false },
};

export default async function RequestConfirmationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const reference = typeof params.ref === "string" ? params.ref.slice(0, 40) : "";
  const token = typeof params.t === "string" ? params.t.slice(0, 200) : "";
  return <RequestConfirmation reference={reference} token={token} />;
}
