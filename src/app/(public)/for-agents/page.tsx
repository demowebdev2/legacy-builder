import type { Metadata } from "next";
import { api } from "@convex/_generated/api";
import { AGENT_STEPS, BuyingTerms, EXCLUSIVE_BLURB, NumberedSteps, STANDARD_BLURB } from "@/components/public/AgentExplainer";
import { CmsSections } from "@/components/public/CmsSections";
import { FaqList } from "@/components/public/FaqList";
import { Hero } from "@/components/public/Hero";
import { Reveal } from "@/components/public/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { CheckList } from "@/components/ui/Display";
import { Icon } from "@/components/ui/Icon";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

const FALLBACK = {
  heroTitle: "Leads you can actually work, at a price you can see.",
  heroBody: "Buy the leads you want, from ten up. Two exclusive in every ten. No subscription, no expiry — a lead is drawn down only when it is released to you.",
  badge: "For licensed producers",
  sections: [] as Array<{ heading: string; body: string }>,
  seoTitle: "For agents — Legacy Builders",
  seoDescription: "Buy from ten leads up. Two exclusive in every ten. 72-hour disputes.",
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPublic(api.cms.publicPage, { slug: "for-agents" });
  const c = page?.content ?? FALLBACK;
  return pageMetadata({ title: c.seoTitle, description: c.seoDescription, path: "/for-agents" });
}

export default async function ForAgentsPage() {
  const [page, faqs] = await Promise.all([fetchPublic(api.cms.publicPage, { slug: "for-agents" }), fetchPublic(api.cms.publicFaqs, { audience: "agent" })]);
  const c = page?.content ?? FALLBACK;

  return (
    <>
      <Hero badge={c.badge || undefined} title={c.heroTitle} body={c.heroBody}>
        <div className="b-row" style={{ marginTop: "1.6rem" }}>
          <ButtonLink href="/apply" variant="gold" size="lg">
            Apply to join
          </ButtonLink>
          <ButtonLink href="/pricing" variant="out" size="lg" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>
            Agent pricing
          </ButtonLink>
        </div>
        <div className="row" style={{ gap: "1.4rem", marginTop: "1.8rem", color: "#A9BED4", fontSize: ".85rem" }}>
          {["No subscription", "Nothing expires", "Producer seats free"].map((t) => (
            <span key={t} className="row" style={{ gap: ".4rem" }}>
              <Icon name="check" />
              {t}
            </span>
          ))}
        </div>
      </Hero>

      <div className="pw">
        <div className="g g-2-1" style={{ alignItems: "start" }}>
          <Reveal className="card card-p">
            <h2 className="h3" style={{ marginBottom: ".8rem" }}>
              What you are buying
            </h2>
            <div className="g g2">
              <div className="crd">
                <div className="t">Exclusive</div>
                <div className="v">
                  2 <small>in every 10</small>
                </div>
                <div className="xs">{EXCLUSIVE_BLURB}</div>
              </div>
              <div className="crd">
                <div className="t">Standard</div>
                <div className="v">
                  8 <small>in every 10</small>
                </div>
                <div className="xs">{STANDARD_BLURB}</div>
              </div>
            </div>
            <hr className="hr" />
            <BuyingTerms />
          </Reveal>

          <Reveal index={1} className="card card-p">
            <h2 className="h3" style={{ marginBottom: ".8rem" }}>
              Before your first lead
            </h2>
            <CheckList
              items={[
                { text: "Apply as an individual producer or as an agency." },
                { text: "Your producer number and state licences are reviewed by our licensing team, with evidence of E&O cover." },
                { text: "Your card is authorised at application and only charged once your licence is verified." },
                { text: "Choose your products, licensed states and daily pace — nothing outside them reaches you." },
              ]}
            />
            <div className="stack" style={{ gap: ".5rem" }}>
              <ButtonLink href="/pricing" variant="navy" full>
                See pricing
              </ButtonLink>
              <ButtonLink href="/apply" variant="out" full>
                Apply to join
              </ButtonLink>
            </div>
          </Reveal>
        </div>

        <h2 className="h2" style={{ margin: "2.5rem 0 1rem" }}>
          How it works for agents
        </h2>
        <NumberedSteps steps={AGENT_STEPS} />

        <CmsSections sections={c.sections} style={{ marginTop: "2.5rem" }} />

        {faqs && faqs.length > 0 && (
          <section aria-labelledby="agent-faqs" style={{ marginTop: "2.5rem" }}>
            <h2 id="agent-faqs" className="h2" style={{ marginBottom: "1rem" }}>
              Questions agents ask
            </h2>
            <FaqList items={faqs} />
          </section>
        )}

        <div className="card card-p row-b" style={{ marginTop: "2.5rem" }}>
          <div>
            <h2 className="h3" style={{ marginBottom: ".2rem" }}>
              Ready to start?
            </h2>
            <p className="sm">Pick a number of leads, apply, and we review your licences before anything is charged.</p>
          </div>
          <div className="b-row">
            <ButtonLink href="/pricing" variant="out">
              Agent pricing
            </ButtonLink>
            <ButtonLink href="/apply" variant="gold" iconRight="arrow">
              Apply to join
            </ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
