import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { HeroQuickStart } from "@/components/public/HeroQuickStart";
import { Reveal } from "@/components/public/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { DEFAULT_COVERAGE_TYPES } from "@/domain/referenceDefaults";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

const FALLBACK = {
  heroTitle: "Find a licensed insurance agent in your state.",
  heroBody:
    "Tell us what coverage you are looking for and we connect you with an independent agent licensed where you live — life insurance, final expense, mortgage protection, Medicare and more. Protecting the people counting on you starts with one conversation.",
  badge: "Every agent licensed and verified",
  seoTitle: "Legacy Builders — Find a licensed insurance agent",
  seoDescription: "Tell us what cover you need. We match you with a licensed independent insurance agent in your state. Free, no obligation.",
};

const STEPS = [
  ["Tell us what you need", "Answer a few short questions about the coverage you are looking for and where you live."],
  ["We find the right agent", "We look for an independent agent holding an active license in your state who works with that type of coverage."],
  ["The agent contacts you", "Usually within one business day. Ask your questions and decide in your own time."],
] as const;

const EXPECT = [
  ["Your request is reviewed", "We check that the coverage you asked about is available in your state before anything moves."],
  ["The agent's license is verified", "We confirm an active producer license in your state against the national registry before your information is released."],
  ["The agent reaches out", "By phone, text or email, depending on what you asked for and when you said you are available."],
  [
    "You decide what happens next",
    "Buy, wait, or walk away. If you would rather not be contacted again, reply STOP or email us and we remove your information.",
  ],
] as const;

const STATS = [
  ["Licensed", "Active producer license confirmed before contact"],
  ["Independent", "Agents represent more than one carrier"],
  ["No obligation", "Asking questions does not commit you to anything"],
  ["Reversible", "Withdraw your consent at any time"],
] as const;

const HERO_EMPHASIS = "in your state.";

/** Homepage category groups, carried over from the client-approved design (photo + curated subtitle per product). */
const GROUPS: Array<{
  icon: IconName;
  title: string;
  subtitle: string;
  wide?: boolean;
  items: Array<{ key: string; blurb: string; photo: string; alt: string }>;
}> = [
  {
    icon: "shield",
    title: "Protecting your family",
    subtitle: "Coverage that pays out to the people who depend on you",
    items: [
      {
        key: "life",
        blurb: "Term or whole life coverage for the people who rely on your income",
        photo: "https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=520&q=70",
        alt: "A multigenerational family together outdoors",
      },
      {
        key: "mortgage",
        blurb: "So your family can stay in the home if something happens to you",
        photo: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=520&q=70",
        alt: "A couple standing in front of their home",
      },
      {
        key: "final",
        blurb: "Funeral, burial and end-of-life costs handled in advance",
        photo: "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?auto=format&fit=crop&w=520&q=70",
        alt: "An older couple sitting together",
      },
    ],
  },
  {
    icon: "chart",
    title: "Planning for retirement",
    subtitle: "Income strategies for the years after work",
    wide: true,
    items: [
      {
        key: "retirement",
        blurb: "Turning what you have saved into income you can count on",
        photo: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=520&q=70",
        alt: "An older couple reviewing paperwork together",
      },
      {
        key: "annuity",
        blurb: "Growth potential with protection against market losses",
        photo: "https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?auto=format&fit=crop&w=520&q=70",
        alt: "A person reviewing financial documents",
      },
    ],
  },
  {
    icon: "cross",
    title: "Health and Medicare",
    subtitle: "Medical coverage for you and your household",
    wide: true,
    items: [
      {
        key: "medicare",
        blurb: "What Original Medicare covers, and what fills the gaps",
        photo: "https://images.unsplash.com/photo-1578574577315-3fbeb0cecdc2?auto=format&fit=crop&w=520&q=70",
        alt: "An older adult in conversation with an advisor",
      },
      {
        key: "health",
        blurb: "Individual and family medical plans",
        photo: "https://images.unsplash.com/photo-1517554558809-9b4971b38f39?auto=format&fit=crop&w=520&q=70",
        alt: "A parent with two children",
      },
    ],
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPublic(api.cms.publicPage, { slug: "home" });
  const c = page?.content ?? FALLBACK;
  return pageMetadata({ title: c.seoTitle, description: c.seoDescription, path: "/" });
}

export default async function HomePage() {
  const [page, reference] = await Promise.all([fetchPublic(api.cms.publicPage, { slug: "home" }), fetchPublic(api.referenceData.publicData, {})]);
  const c = page?.content ?? FALLBACK;
  const coverage = reference?.coverageTypes?.length ? reference.coverageTypes : DEFAULT_COVERAGE_TYPES;
  const coverageNames = new Map(coverage.map((p) => [p.key, p.name]));
  const states = reference?.servicedStates ?? [];

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

      <section className="hero">
        <div className="pw hero-in" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div>
            <span className="badge badge-g">
              <Icon name="check" /> {c.badge || FALLBACK.badge}
            </span>
            <h1 style={{ marginTop: ".9rem" }}>
              {c.heroTitle.includes(HERO_EMPHASIS) ? (
                <>
                  {c.heroTitle.slice(0, c.heroTitle.indexOf(HERO_EMPHASIS))}
                  <em>{HERO_EMPHASIS}</em>
                </>
              ) : (
                c.heroTitle
              )}
            </h1>
            <p className="lede">{c.heroBody}</p>
            <HeroQuickStart coverage={coverage.map((p) => ({ key: p.key, name: p.name }))} states={states} />
            <div className="trustrow">
              {["License verified before contact", "Independent agents", "Opt out at any time"].map((t) => (
                <div key={t}>
                  <Icon name="check" />
                  {t}
                </div>
              ))}
            </div>
          </div>
          <div className="hero-img">
            <Image
              src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1000&q=72"
              alt="A licensed insurance agent meeting with a family at home"
              width={1000}
              height={750}
              sizes="(max-width: 1000px) 100vw, 45vw"
              priority
            />
          </div>
        </div>
      </section>

      <div className="pw">
        <div style={{ marginBottom: "2rem", maxWidth: 620 }}>
          <h2 className="h2">What kind of coverage are you looking for?</h2>
          <p className="sm" style={{ marginTop: ".5rem" }}>
            Pick the closest match. The agent you speak with will help you narrow it down from there.
          </p>
        </div>

        {GROUPS.map((group) => {
          const items = group.items.filter((item) => coverageNames.has(item.key));
          if (!items.length) return null;
          return (
            <div className="grp" key={group.title}>
              <div className="grp-h">
                <div className="ic-g">
                  <Icon name={group.icon} size={18} />
                </div>
                <div>
                  <h3>{group.title}</h3>
                  <span>{group.subtitle}</span>
                </div>
              </div>
              <div className={`cats${group.wide ? " two" : ""}`}>
                {items.map((item) => (
                  <Link key={item.key} href={`/request?coverage=${item.key}`} className="cat">
                    <span className="cat-img">
                      <Image src={item.photo} alt={item.alt} width={520} height={325} sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw" />
                    </span>
                    <span className="cat-b">
                      <b>{coverageNames.get(item.key)}</b>
                      <span>{item.blurb}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}

        <div className="unsure">
          <div>
            <b>Not sure which one you need?</b>
            <span className="sm">That is normal. Start anyway and an agent will help you work it out.</span>
          </div>
          <ButtonLink href="/request?coverage=unsure" variant="out">
            Start without choosing
          </ButtonLink>
        </div>
      </div>

      <section className="sec soft">
        <div className="pw">
          <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto 2.4rem" }}>
            <h2 className="h2">How it works</h2>
            <p className="sm" style={{ marginTop: ".5rem" }}>
              Three steps, about two minutes.
            </p>
          </div>
          <div className="steps">
            {STEPS.map(([title, body], i) => (
              <Reveal key={title} index={i} className="step">
                <i>{i + 1}</i>
                <h4 className="h4">{title}</h4>
                <p className="sm">{body}</p>
              </Reveal>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: "2.4rem" }}>
            <ButtonLink href="/request" variant="navy" size="lg">
              Get covered today
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="pw split2">
          <div>
            <span className="eyebrow">What to expect</span>
            <h2 className="h2" style={{ marginBottom: ".8rem" }}>
              No surprises after you submit
            </h2>
            <p className="lede" style={{ marginBottom: "1.6rem" }}>
              Most people have been burned by a form that led to a wall of phone calls. Here is exactly what happens once you send yours.
            </p>
            <div className="tl">
              {EXPECT.map(([title, body], i) => (
                <div className="tli" key={title}>
                  <div className="tl-d">{i + 1}</div>
                  <div className="tl-b">
                    <h4 className="h4">{title}</h4>
                    <p className="sm">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="hero-img" style={{ aspectRatio: "1/1", marginBottom: "1.2rem" }}>
              <Image
                src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=800&q=72"
                alt="An insurance agent talking with a client"
                width={800}
                height={800}
                sizes="(max-width: 1000px) 100vw, 45vw"
              />
            </div>
            <div className="bar" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {STATS.map(([title, body]) => (
                <div key={title}>
                  <b>{title}</b>
                  <span>{body}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="sec soft">
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
      </section>

      <section className="sec">
        <div className="pw" style={{ maxWidth: 720, textAlign: "center" }}>
          <h2 className="h2" style={{ marginBottom: ".7rem" }}>
            Ready when you are
          </h2>
          <p className="lede" style={{ margin: "0 auto 1.6rem" }}>
            Tell us what coverage you are looking for and we will take it from there.
          </p>
          <div className="b-row" style={{ justifyContent: "center" }}>
            <ButtonLink href="/request" variant="navy" size="lg">
              Get covered today
            </ButtonLink>
            <ButtonLink href="/faq" variant="out" size="lg">
              Read the FAQ first
            </ButtonLink>
          </div>
        </div>
      </section>
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
