import type { Metadata } from "next";
import { PublicFooter } from "@/components/layouts/PublicFooter";
import { PublicHeader } from "@/components/layouts/PublicHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";

export const metadata: Metadata = {
  title: "Page not found — Legacy Builders",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="pub">
      <PublicHeader />
      <main id="main">
        <div className="pw pw-n">
          <div className="card">
            <EmptyState
              icon="search"
              title="We could not find that page"
              action={
                <div className="b-row" style={{ justifyContent: "center" }}>
                  <ButtonLink href="/" variant="out">
                    Back to home
                  </ButtonLink>
                  <ButtonLink href="/request" variant="navy">
                    Get matched free
                  </ButtonLink>
                </div>
              }
            >
              The link may be out of date, or the page may have moved. Try the home page, or contact us if you think something is broken.
            </EmptyState>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
