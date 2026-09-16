import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { CheckList } from "@/components/ui/Display";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "Application received — Legacy Builders",
  robots: { index: false, follow: false },
};

/** Prototype `P.apply` step 6, with the demo "open the admin portal" copy replaced by the real next steps. */
export default function ApplicationSuccessPage() {
  return (
    <div className="pw pw-n">
      <div className="card card-p tc" style={{ padding: "2.5rem 1.5rem" }}>
        <div className="empty" style={{ padding: 0 }}>
          <div className="ic" style={{ background: "var(--amber-wash)", color: "var(--amber)" }}>
            <Icon name="clock" />
          </div>
        </div>
        <Badge tone="a" className="mt-2.5">
          Pending verification
        </Badge>
        <h1 className="h2" style={{ margin: ".9rem 0 .5rem" }}>
          Application received
        </h1>
        <p className="sm" style={{ maxWidth: "48ch", margin: "0 auto 1.2rem" }}>
          We are checking your producer number and licences. Most applications are decided within one business day. Your card has been authorised but{" "}
          <b>not charged</b>.
        </p>
        <div className="card card-p" style={{ maxWidth: 540, margin: "0 auto", textAlign: "left", boxShadow: "none", background: "var(--soft)" }}>
          <h2 className="h4" style={{ marginBottom: ".6rem" }}>
            What happens next
          </h2>
          <CheckList
            items={[
              { text: "Our licensing team reviews your producer number, each state licence and your E&O cover." },
              { text: "We email you when a decision is made, or if we need anything else from you." },
              { text: "Once approved, your card is charged for the opening purchase and the leads are added to your balance." },
              { text: "If we cannot verify you, the authorisation is released and nothing is taken." },
            ]}
          />
          <p className="xs" style={{ marginTop: "-.4rem" }}>
            You can check progress at any time by signing in with the email and password you just created.
          </p>
        </div>
        <div className="b-row" style={{ justifyContent: "center", marginTop: "1.4rem" }}>
          <ButtonLink href="/" variant="out">
            Back to home
          </ButtonLink>
          <ButtonLink href="/apply/pending" variant="navy" iconRight="arrow">
            View application status
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
