import type { Metadata } from "next";
import Link from "next/link";
import { WithdrawForm } from "@/components/forms/WithdrawForm";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Withdraw consent — Legacy Builders",
  description: "Stop all contact about a request you made through Legacy Builders, using your reference number.",
  path: "/request/withdraw",
});

export default async function WithdrawPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const reference = typeof params.ref === "string" ? params.ref.slice(0, 40) : undefined;
  return (
    <div className="pw pw-n">
      <h1 className="h2" style={{ marginBottom: ".3rem" }}>
        Withdraw your consent
      </h1>
      <p className="sm" style={{ marginBottom: "1.3rem" }}>
        Changed your mind? Enter the reference number from your confirmation email and the email address or mobile number you gave us. All contact about that
        request stops straight away.
      </p>
      <WithdrawForm initialReference={reference} />
      <p className="xs" style={{ marginTop: "1rem" }}>
        Lost your reference number? Reply STOP to any text message from us, or{" "}
        <Link className="link" href="/contact">
          contact us
        </Link>{" "}
        and we will help.
      </p>
    </div>
  );
}
