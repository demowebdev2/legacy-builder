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
            <p className="xs" style={{ color: "#A9BED4" }}>
              Free matching with licensed independent insurance agents across seven Southeast states.
            </p>
          </div>
          <div>
            <h4>If you need cover</h4>
            <Link href="/request">Get matched free</Link>
            <Link href="/coverage-options">Coverage options</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/request/withdraw">Withdraw consent</Link>
          </div>
          <div>
            <h4>If you are an agent</h4>
            <Link href="/for-agents">For agents</Link>
            <Link href="/pricing">Agent pricing</Link>
            <Link href="/apply">Apply to join</Link>
            <Link href="/auth/login">Agent login</Link>
          </div>
          <div>
            <h4>Company</h4>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/legal/privacy-policy">Privacy policy</Link>
            <Link href="/legal/terms-of-use">Terms of use</Link>
            <Link href="/legal/do-not-sell">Do not sell my information</Link>
          </div>
        </div>
        <div className="legal">© {year} Legacy Builders, LLC. Legacy Builders is not an insurance carrier and does not sell insurance.</div>
      </div>
    </footer>
  );
}
