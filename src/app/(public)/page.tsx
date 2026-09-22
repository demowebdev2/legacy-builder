import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { Hero } from "@/components/public/Hero";
import { Reveal } from "@/components/public/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { DEFAULT_COVERAGE_TYPES } from "@/domain/referenceDefaults";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";


const FALLBACK = {
  heroTitle: "Find a licensed insurance agent, free.",
  heroBody:
    "Tell us what cover you are looking for. We match you with a licensed independent agent in your state — usually within a business day. No cost, no obligation, no pressure.",
  badge: "Licensed agents only · 7 Southeast states",
  seoTitle: "Legacy Builders — Find a licensed insurance agent",
  seoDescription: "Tell us what cover you need. We match you with a licensed independent insurance agent in your state. Free, no obligation.",
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPublic(api.cms.publicPage, { slug: "home" });
  const c = page?.content ?? FALLBACK;
  return pageMetadata({ title: c.seoTitle, description: c.seoDescription, path: "/" });
}

const STEPS = [
  ["Answer a few short questions", "Product, location, what is bringing you here, contact details, consent. Two minutes."],
  ["We check who can help", "An agent licensed in your state, working your product, with room to take a new client that day."],
  ["A licensed agent contacts you", "Usually within a business day. Say the word and all contact stops."],
] as const;

export default async function HomePage() {
  const [page, reference] = await Promise.all([fetchPublic(api.cms.publicPage, { slug: "home" }), fetchPublic(api.referenceData.publicData, {})]);
  const c = page?.content ?? FALLBACK;
  const coverage = reference?.coverageTypes?.length
    ? reference.coverageTypes
    : DEFAULT_COVERAGE_TYPES.map((t) => ({ ...t, imageUrl: `https://picsum.photos/seed/lb-${t.key}/420/260` }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Legacy Builders",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    description: c.seoDescription,
    areaServed: ["AL", "FL", "GA", "MS", "NC", "SC", "TN"].map((s) => ({ "@type": "State", name: s })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Hero badge={c.badge || undefined} title={c.heroTitle} emphasis="free." body={c.heroBody}>
        <div className="b-row" style={{ marginTop: "1.6rem" }}>
          <ButtonLink href="/request" variant="gold" size="lg">
            Get matched free
          </ButtonLink>
          <ButtonLink href="/for-agents" variant="out" size="lg" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>
            For agents
          </ButtonLink>
        </div>
        <div className="row" style={{ gap: "1.4rem", marginTop: "1.8rem", color: "#A9BED4", fontSize: ".85rem" }}>
          {["Always free for you", "Licence verified", "Opt out any time"].map((t) => (
            <span key={t} className="row" style={{ gap: ".4rem" }}>
              <Icon name="check" />
              {t}
            </span>
          ))}
        </div>
      </Hero>

      <div className="pw">
        <h2 className="h2" style={{ marginBottom: ".4rem" }}>
          What are you looking for?
        </h2>
        <p className="sm" style={{ marginBottom: "1.4rem" }}>
          Seven types of cover. Pick the closest — an agent will help you narrow it down.
        </p>
        <div className="g g4">
          {coverage.map((p, i) => (
            <Reveal key={p.key} index={i}>
              <Link
                href={`/request?coverage=${p.key}`}
                className="card hoverlift"
                style={{ display: "block", textAlign: "left", padding: 0, overflow: "hidden" }}
              >
                {p.imageUrl ? (
                  <Image
                    src={p.imageUrl}
                    alt={p.name}
                    width={420}
                    height={260}
                    sizes="(max-width: 520px) 100vw, (max-width: 1100px) 50vw, 25vw"
                    style={{ aspectRatio: "16/10", objectFit: "cover", width: "100%", height: "auto" }}
                  />
                ) : null}
                <div style={{ padding: ".85rem 1rem" }}>
                  <div className="strong">{p.name}</div>
                  <div className="xs">{p.cardDescription}</div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>

        <div className="g g3" style={{ marginTop: "2.5rem" }}>
          {STEPS.map(([title, body], i) => (
            <Reveal key={title} index={i} className="card card-p">
              <div className="av" style={{ marginBottom: ".7rem" }}>
                {i + 1}
              </div>
              <h3 className="h4" style={{ marginBottom: ".3rem" }}>
                {title}
              </h3>
              <p className="sm">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--soft)" }}>
        <div className="pw">
          <h2 className="h2" style={{ marginBottom: "1.6rem" }}>
            What people say
          </h2>
          <div className="revs">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} index={i} className="rev">
                <div className="stars" aria-label="Five out of five">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Icon key={s} name="star" />
                  ))}
                </div>
                <p>{t.quote}</p>
                <div className="rev-w">
                  <span className="av">{t.initials}</span>
                  <span>
                    <b>{t.name}</b>
                    <span>{t.location}</span>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Placeholder testimonials carried over from the client-approved design file. Replace with verified
 * reviews collected from matched consumers before relying on these for marketing claims.
 */
const TESTIMONIALS = [
  {
    initials: "DO",
    name: "Denise O.",
    location: "Macon, GA · Final expense",
    quote:
      "I filled in the form on a Sunday evening and had a call Monday morning. No pressure at all, and she explained the difference between term and whole life in plain English.",
  },
  {
    initials: "MW",
    name: "Marcus W.",
    location: "Savannah, GA · Mortgage protection",
    quote: "What I liked was that only one agent called. I have used other sites where you get eight phone calls in an hour. That did not happen here.",
  },
  {
    initials: "RT",
    name: "Renee T.",
    location: "Jacksonville, FL · Medicare",
    quote: "I was mostly just looking for information on Medicare. The agent answered my questions and did not try to sell me anything I did not ask about.",
  },
] as const;
