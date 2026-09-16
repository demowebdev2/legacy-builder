import type { Metadata } from "next";
import { api } from "@convex/_generated/api";
import { AGENT_STEPS, CONSUMER_STEPS, NumberedSteps } from "@/components/public/AgentExplainer";
import { CmsSections } from "@/components/public/CmsSections";
import { Hero } from "@/components/public/Hero";
import { JsonLd } from "@/components/public/JsonLd";
import { ButtonLink } from "@/components/ui/Button";
import { CheckList } from "@/components/ui/Display";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

const FALLBACK = {
  heroTitle: "How Legacy Builders works",
  heroBody: "Two sides, one straightforward exchange. Here is exactly what happens on each.",
  badge: "",
  sections: [] as Array<{ heading: string; body: string }>,
  seoTitle: "How it works — Legacy Builders",
  seoDescription: "Free for consumers. Leads you buy outright, for agents.",
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPublic(api.cms.publicPage, { slug: "how-it-works" });
  const c = page?.content ?? FALLBACK;
  return pageMetadata({ title: c.seoTitle, description: c.seoDescription, path: "/how-it-works" });
}

export default async function HowItWorksPage() {
  const page = await fetchPublic(api.cms.publicPage, { slug: "how-it-works" });
  const c = page?.content ?? FALLBACK;

  const howTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Get matched with a licensed insurance agent",
    step: CONSUMER_STEPS.map(([name, text], i) => ({ "@type": "HowToStep", position: i + 1, name, text })),
  };

  return (
    <>
      <JsonLd data={howTo} />
      <Hero badge={c.badge || undefined} title={c.heroTitle} body={c.heroBody} />

      <div className="pw">
        <section aria-labelledby="hiw-consumers">
          <div className="row-b" style={{ marginBottom: "1.2rem", alignItems: "flex-end" }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: ".3rem" }}>
                If you need cover
              </div>
              <h2 id="hiw-consumers" className="h2" style={{ marginBottom: ".3rem" }}>
                Free, about two minutes, and you are never charged
              </h2>
              <p className="sm">Tell us what you are looking for and we find a licensed agent who can help.</p>
            </div>
            <ButtonLink href="/request" variant="gold">
              Get matched free
            </ButtonLink>
          </div>
          <NumberedSteps steps={CONSUMER_STEPS} />
          <div className="card card-p plist-flush" style={{ marginTop: "1rem" }}>
            <CheckList
              items={[
                { text: "Always free for you — agents pay for access to the platform." },
                { text: "Only agents holding an active licence in your state, working the product you asked about." },
                { text: "Consent is recorded with the exact wording you agreed to, and you can withdraw it at any time." },
              ]}
            />
          </div>
        </section>

        <hr className="hr" style={{ margin: "3rem 0" }} />

        <section aria-labelledby="hiw-agents">
          <div className="row-b" style={{ marginBottom: "1.2rem", alignItems: "flex-end" }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: ".3rem" }}>
                If you are an agent
              </div>
              <h2 id="hiw-agents" className="h2" style={{ marginBottom: ".3rem" }}>
                Leads you buy outright
              </h2>
              <p className="sm">No subscription, no expiry — a lead is drawn from your balance only when it is released to you.</p>
            </div>
            <div className="b-row">
              <ButtonLink href="/pricing" variant="out">
                Agent pricing
              </ButtonLink>
              <ButtonLink href="/apply" variant="navy">
                Apply to join
              </ButtonLink>
            </div>
          </div>
          <NumberedSteps steps={AGENT_STEPS} />
        </section>

        <CmsSections sections={c.sections} style={{ marginTop: "2.5rem" }} />
      </div>
    </>
  );
}
