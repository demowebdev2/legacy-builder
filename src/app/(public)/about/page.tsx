import type { Metadata } from "next";
import { api } from "@convex/_generated/api";
import { CmsSections } from "@/components/public/CmsSections";
import { Hero } from "@/components/public/Hero";
import { ButtonLink } from "@/components/ui/Button";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

const FALLBACK = {
  heroTitle: "About Legacy Builders",
  heroBody: "Legacy Builders connects consumers with licensed independent insurance agents across seven Southeast states.",
  badge: "Licensed agents only · 7 Southeast states",
  sections: [
    { heading: "Licensed agents only", body: "Every agent's licences are reviewed state by state before a single lead is released to them." },
    { heading: "Consent first", body: "Every request is recorded with the exact consent wording the consumer agreed to, and consent can be withdrawn at any time." },
  ],
  seoTitle: "About — Legacy Builders",
  seoDescription: "Legacy Builders connects consumers with licensed independent insurance agents.",
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPublic(api.cms.publicPage, { slug: "about" });
  const c = page?.content ?? FALLBACK;
  return pageMetadata({ title: c.seoTitle, description: c.seoDescription, path: "/about" });
}

export default async function AboutPage() {
  const page = await fetchPublic(api.cms.publicPage, { slug: "about" });
  const c = page?.content ?? FALLBACK;

  return (
    <>
      <Hero badge={c.badge || undefined} title={c.heroTitle} body={c.heroBody} />
      <div className="pw">
        <CmsSections sections={c.sections} />

        <div className="g g2" style={{ marginTop: c.sections.length ? "2.5rem" : 0 }}>
          <div className="card card-p">
            <div className="eyebrow" style={{ marginBottom: ".3rem" }}>
              If you need cover
            </div>
            <h2 className="h3" style={{ marginBottom: ".3rem" }}>
              Talk to a licensed agent in your state
            </h2>
            <p className="sm" style={{ marginBottom: "1rem" }}>
              Free, about two minutes, and you are never charged.
            </p>
            <ButtonLink href="/request" variant="gold">
              Get matched free
            </ButtonLink>
          </div>
          <div className="card card-p">
            <div className="eyebrow" style={{ marginBottom: ".3rem" }}>
              If you are an agent
            </div>
            <h2 className="h3" style={{ marginBottom: ".3rem" }}>
              Buy leads outright
            </h2>
            <p className="sm" style={{ marginBottom: "1rem" }}>
              From ten up. Two exclusive in every ten. No subscription and nothing expires.
            </p>
            <div className="b-row">
              <ButtonLink href="/for-agents" variant="out">
                For agents
              </ButtonLink>
              <ButtonLink href="/apply" variant="navy">
                Apply to join
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
