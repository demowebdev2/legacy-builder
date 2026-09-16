import type { Metadata } from "next";
import { api } from "@convex/_generated/api";
import { PageIntro } from "@/components/public/Hero";
import { PricingPanel } from "@/components/public/PricingPanel";
import { Icon } from "@/components/ui/Icon";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

const FALLBACK = {
  heroTitle: "Agent pricing",
  heroBody:
    "Buy the leads you want, starting at ten and moving up in fives. Every ten is two exclusive and eight standard. Leads arrive one at a time as matching consumers come in, and they do not expire. No subscription, no call required.",
  seoTitle: "Agent pricing — Legacy Builders",
  seoDescription: "Buy from ten leads up, in steps of five. Two exclusive in every ten. Nothing expires.",
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPublic(api.cms.publicPage, { slug: "pricing" });
  const c = page?.content ?? FALLBACK;
  return pageMetadata({ title: c.seoTitle, description: c.seoDescription, path: "/pricing" });
}

const TICKS = ["Exclusive leads never shared", "2 exclusive in every 10", "Nothing expires", "Producer seats free"];

export default async function PricingPage() {
  const [page, rateCard] = await Promise.all([fetchPublic(api.cms.publicPage, { slug: "pricing" }), fetchPublic(api.pricing.publicRateCard, {})]);
  const c = page?.content ?? FALLBACK;

  return (
    <div className="pw">
      <PageIntro title={c.heroTitle || FALLBACK.heroTitle} body={c.heroBody || FALLBACK.heroBody}>
        <div className="row" style={{ gap: "1.2rem", justifyContent: "center", marginTop: "1.1rem", fontSize: ".85rem" }}>
          {TICKS.map((t) => (
            <span key={t} className="row" style={{ gap: ".35rem" }}>
              <Icon name="check" />
              {t}
            </span>
          ))}
        </div>
      </PageIntro>
      <PricingPanel initial={rateCard} />
    </div>
  );
}
