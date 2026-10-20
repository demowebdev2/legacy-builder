import type { Metadata } from "next";
import { api } from "@convex/_generated/api";
import { CmsSections } from "@/components/public/CmsSections";
import { Hero } from "@/components/public/Hero";
import { ButtonLink } from "@/components/ui/Button";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

const FALLBACK = {
  heroTitle: "About Legacy Builders",
  heroBody: "We believe insurance is about more than policies. It is about protecting families, preserving dreams, and creating security for generations to come.",
  badge: "Protecting families since day one",
  sections: [
    { heading: "Why we built Legacy Builders", body: "We are two women, two moms, and two business partners who know firsthand what is at stake. Our own families and children are the reason we take protection so seriously. We have seen how the right coverage can carry a family through life's hardest moments, and how the lack of it can leave loved ones struggling. That is why we built Legacy Builders: to help as many families as possible find the security we want for our own." },
    { heading: "What we do", body: "We connect life, health, annuity, and mortgage protection professionals with individuals and families seeking guidance during life's most important moments. To us, every lead represents a person, a story, and an opportunity to make a lasting difference. We treat each one the way we would want our own families treated: with care, honesty, and respect." },
  ],
  seoTitle: "About — Legacy Builders",
  seoDescription: "Legacy Builders was built by two moms to connect families with licensed life, health, annuity and mortgage protection professionals.",
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
