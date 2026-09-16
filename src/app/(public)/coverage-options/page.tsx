import type { Metadata } from "next";
import Image from "next/image";
import { api } from "@convex/_generated/api";
import { CmsSections } from "@/components/public/CmsSections";
import { Hero } from "@/components/public/Hero";
import { Reveal } from "@/components/public/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Icon, isIconName } from "@/components/ui/Icon";
import { DEFAULT_COVERAGE_TYPES } from "@/domain/referenceDefaults";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

const FALLBACK = {
  heroTitle: "What are you looking for?",
  heroBody: "Seven types of cover. Pick the closest — an agent will help you narrow it down.",
  badge: "",
  sections: [] as Array<{ heading: string; body: string }>,
  seoTitle: "Coverage options — Legacy Builders",
  seoDescription:
    "Life, mortgage protection, final expense, retirement, Medicare, annuities and health insurance — matched with a licensed agent in your state.",
};

/** Short, factual explanations per coverage key. Admin-managed descriptions come from reference data. */
const EXPLAINERS: Record<string, string> = {
  life: "Term or whole life cover that pays out to the people who depend on your income.",
  mortgage: "Cover designed to help your family keep the home if you die before the mortgage is paid off.",
  final: "A smaller policy intended to cover funeral costs and final bills.",
  retirement: "Planning for an income once you stop working.",
  medicare: "Plans that fill the gaps in Original Medicare. Discussed only by agents approved to market Medicare products.",
  annuity: "A contract that aims to grow savings with protection against market losses.",
  health: "Health insurance for individuals and families.",
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPublic(api.cms.publicPage, { slug: "coverage-options" });
  const c = page?.content ?? FALLBACK;
  return pageMetadata({ title: c.seoTitle, description: c.seoDescription, path: "/coverage-options" });
}

export default async function CoverageOptionsPage() {
  const [page, reference] = await Promise.all([fetchPublic(api.cms.publicPage, { slug: "coverage-options" }), fetchPublic(api.referenceData.publicData, {})]);
  const c = page?.content ?? FALLBACK;
  const coverage = reference?.coverageTypes?.length
    ? reference.coverageTypes
    : DEFAULT_COVERAGE_TYPES.map((t) => ({ ...t, imageUrl: `https://picsum.photos/seed/lb-${t.key}/420/260` as string | null }));

  return (
    <>
      <Hero badge={c.badge || undefined} title={c.heroTitle} body={c.heroBody}>
        <div className="b-row" style={{ marginTop: "1.6rem" }}>
          <ButtonLink href="/request" variant="gold" size="lg">
            Get matched free
          </ButtonLink>
          <ButtonLink href="/how-it-works" variant="out" size="lg" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>
            How it works
          </ButtonLink>
        </div>
      </Hero>

      <div className="pw">
        <div className="g g3">
          {coverage.map((p, i) => (
            <Reveal key={p.key} index={i} className="card hoverlift coverage-card">
              {p.imageUrl ? (
                <Image
                  src={p.imageUrl}
                  alt=""
                  width={420}
                  height={260}
                  sizes="(max-width: 820px) 100vw, 33vw"
                  style={{ aspectRatio: "16/10", objectFit: "cover", width: "100%", height: "auto" }}
                />
              ) : null}
              <div className="card-p stack" style={{ gap: ".55rem", flex: 1 }}>
                <div className="row" style={{ gap: ".6rem", flexWrap: "nowrap" }}>
                  <span className="iconsm" aria-hidden="true">
                    <Icon name={isIconName(p.icon) ? p.icon : "shield"} />
                  </span>
                  <h2 className="h3">{p.name}</h2>
                </div>
                <p className="sm" style={{ flex: 1 }}>
                  {EXPLAINERS[p.key] ?? p.cardDescription}
                </p>
                <div>
                  <ButtonLink href={`/request?coverage=${p.key}`} variant="out" size="s" iconRight="arrow" aria-label={`Get matched for ${p.name.toLowerCase()}`}>
                    Get matched
                  </ButtonLink>
                </div>
              </div>
            </Reveal>
          ))}
          <Reveal index={coverage.length} className="card card-p coverage-card">
            <div className="row" style={{ gap: ".6rem", flexWrap: "nowrap", marginBottom: ".55rem" }}>
              <span className="iconsm" aria-hidden="true">
                <Icon name="arrow" />
              </span>
              <h2 className="h3">I am not sure</h2>
            </div>
            <p className="sm" style={{ marginBottom: ".9rem", flex: 1 }}>
              That is fine. Tell us a little about yourself and what is bringing you here, and a licensed agent will help you work out what fits.
            </p>
            <div>
              <ButtonLink href="/request?coverage=unsure" variant="navy" size="s" iconRight="arrow">
                Help me work it out
              </ButtonLink>
            </div>
          </Reveal>
        </div>

        <CmsSections sections={c.sections} style={{ marginTop: "2.5rem" }} />

        <div style={{ marginTop: "2.5rem", maxWidth: 760 }}>
          <Alert kind="n">
            Legacy Builders is not an insurance carrier and does not sell insurance. We connect you with licensed independent agents, who can explain the options
            available in your state.
          </Alert>
        </div>
      </div>
    </>
  );
}
