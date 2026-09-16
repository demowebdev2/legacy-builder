import type { Metadata } from "next";
import { InviteAcceptance } from "@/components/auth/InviteAcceptance";

export const metadata: Metadata = {
  title: "Accept invitation — Legacy Builders",
  robots: { index: false, follow: false },
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const type = typeof query.type === "string" ? query.type : "";
  return <InviteAcceptance token={decodeURIComponent(token).slice(0, 200)} type={type} />;
}
