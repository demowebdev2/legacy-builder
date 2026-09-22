import Link from "next/link";
import { LogoMark } from "@/components/ui/Logo";

/** (new) Footer in the prototype's navy vocabulary: legal links and consent withdrawal must be reachable. */
export function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="pft">
      <div className="pft-in">
        <div className="g g4">
          <div>
            <div className="row" style={{ marginBottom: ".7rem" }}>
              <LogoMark tone="dark" />
              <b style={{ color: "#fff", fontFamily: "var(--fh)" }}>Legacy Builders</b>
            </div>
            <p className="xs" style={{ color: "#A9BED4" }}>Connecting families with licensed independent insurance agents who can explain their options.</p>
            <p className="xs" style={{ marginTop: ".5rem" }}>
              <a href="mailto:support@thelegacybuildersllc.com" style={{ color: "#8FA6BD" }}>
                support@thelegacybuildersllc.com
              </a>
            </p>
          </div>
          <div>
            <h4>If you need coverage</h4>
            <Link href="/request">Get covered today</Link>
            <Link href="/coverage-options">Coverage options</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/contact">Contact us</Link>
            <Link href="/request/withdraw">Withdraw consent</Link>
          </div>
          <div>
            <h4>Company</h4>
            <Link href="/about">About us</Link>
            <Link href="/for-agents">For agents</Link>
            <Link href="/apply">Apply to join</Link>
            <Link href="/auth/login">Agent login</Link>
          </div>
          <div>
            <h4>Legal</h4>
            <Link href="/legal/privacy-policy">Privacy policy</Link>
            <Link href="/legal/terms-of-use">Terms of use</Link>
            <Link href="/legal/consumer-consent">Consumer consent</Link>
            <Link href="/legal/do-not-sell">Do not sell or share</Link>
          </div>
        </div>
        <p className="xs" style={{ marginTop: "1.3rem", lineHeight: 1.65, color: "#7E97AF", maxWidth: "92ch" }}>
          Legacy Builders, LLC is a lead generation and matching service. It is not an insurance company, insurance agency, or insurance producer, and it
          does not sell, solicit, or negotiate insurance. All policies are sold by licensed independent agents. Submitting a request does not create an
          obligation to purchase and does not guarantee coverage or eligibility. Products and availability vary by state. We are not connected with or
          endorsed by the United States government or the federal Medicare program.
        </p>
        <div className="legal row-b">
          <span>© {year} Legacy Builders, LLC. All rights reserved.</span>
          <span>legacybuildersleads.com</span>
        </div>
      </div>
    </footer>
  );
}
