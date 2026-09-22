import type { Metadata } from "next";
import { api } from "@convex/_generated/api";
import { Hero } from "@/components/public/Hero";
import { JumpNav } from "@/components/public/JumpNav";
import { ButtonLink } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Icon, isIconName } from "@/components/ui/Icon";
import { DEFAULT_COVERAGE_TYPES } from "@/domain/referenceDefaults";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

const FALLBACK = {
  heroTitle: "What are you looking for?",
  heroBody: "Seven types of cover, explained in plain language. Pick the closest — an agent will help you narrow it down.",
  badge: "",
  seoTitle: "Coverage options — Legacy Builders",
  seoDescription:
    "Life, mortgage protection, final expense, retirement, Medicare, fixed index annuities and health insurance — explained, then matched with a licensed agent in your state.",
};

/**
 * Long-form, factual explainer copy per coverage type, carried over from the client-approved design.
 * Admin-managed name/icon/short description still come from reference data; this is presentational only.
 */
const DETAILS: Record<
  string,
  { forWho: string; lede: string; blocks: Array<{ h: string; body?: string; list?: string[] }> }
> = {
  life: {
    forWho: "Replacing lost income",
    lede:
      "Life insurance pays a cash benefit to the people you name if you pass away. That money is not restricted. Your family can use it for the mortgage, tuition, day-to-day bills, or anything else.",
    blocks: [
      {
        h: "Term versus whole life",
        body:
          "Term life covers you for a fixed number of years, commonly ten, twenty or thirty. It costs less than whole life because the coverage eventually ends. It suits people who want the largest possible benefit during the years their family depends on their income. Whole life covers you for your entire life as long as premiums are paid, and it builds cash value you can borrow against. It costs more per dollar of coverage.",
      },
      {
        h: "What drives the price",
        list: [
          "Your age at the time you apply, which is the single largest factor",
          "Whether you use tobacco",
          "The amount of coverage and, for term policies, the length of the term",
          "Your health history and, on fully underwritten policies, a medical exam",
        ],
      },
      {
        h: "How much coverage do people usually take?",
        body:
          "A common starting point is ten to twelve times your annual income, adjusted for what you owe and what you want to fund. An agent will work it out against your actual obligations rather than a formula.",
      },
    ],
  },
  mortgage: {
    forWho: "Keeping the family home",
    lede:
      "Mortgage protection is a life insurance policy sized around what is left on your home loan, so your family is not forced to sell the house to keep up with payments.",
    blocks: [
      {
        h: "How it differs from the bank's coverage",
        body:
          "The policy your lender offers usually pays the lender directly, and the benefit shrinks as the balance falls. A mortgage protection policy bought through an independent agent pays your beneficiary instead, and you keep the policy if you refinance or move.",
      },
      {
        h: "Who it tends to suit",
        list: [
          "New homeowners who have just taken on a large balance",
          "Single-income households where losing the earner would put the home at risk",
          "People who were declined elsewhere and want a simplified-issue option",
        ],
      },
      {
        h: "Do you need a medical exam?",
        body:
          "Not always. Many mortgage protection policies are simplified issue, which means health questions but no exam. Coverage limits are lower and the premium is higher per dollar than a fully underwritten term policy.",
      },
    ],
  },
  final: {
    forWho: "Covering funeral costs",
    lede:
      "Final expense is smaller whole life coverage intended to handle funeral costs, burial or cremation, and the last medical and administrative bills, so that expense does not land on your children at the worst possible moment.",
    blocks: [
      {
        h: "What it typically covers",
        body:
          "Benefit amounts commonly run from $5,000 to $25,000. The National Funeral Directors Association puts the median cost of a funeral with viewing and burial in the region of $8,000 to $9,000 before a cemetery plot, headstone or flowers.",
      },
      {
        h: "Can you be turned down?",
        body:
          "Rarely. Most final expense policies are simplified issue or guaranteed issue, meaning few or no health questions and no medical exam. Guaranteed issue policies usually carry a two-year waiting period, which you should ask about directly.",
      },
      {
        h: "Who it tends to suit",
        list: [
          "People aged roughly 50 to 85 who do not have or no longer need a large policy",
          "Anyone who has been declined for traditional life insurance",
          "People who want the funeral handled without their family having to find the money",
        ],
      },
    ],
  },
  retirement: {
    forWho: "Income you will not outlive",
    lede:
      "Retirement planning through an insurance agent is about turning what you have saved into income you will not outlive, and protecting that income from a badly timed market drop.",
    blocks: [
      {
        h: "The problem it addresses",
        body:
          "A 401(k) or IRA builds a balance. It does not, on its own, produce a paycheck. A sharp market fall in the first few years of drawing down does far more lasting damage than the same fall ten years later.",
      },
      {
        h: "What an agent can and cannot do",
        body:
          "A licensed insurance agent can discuss insurance-based income products such as annuities and permanent life policies with cash value. Advice on securities or your 401(k) allocation requires separate securities registration.",
      },
      {
        h: "Questions worth asking",
        list: [
          "What happens to this income if I live to ninety-five?",
          "What does it cost me to access the money early?",
          "How is the person recommending this paid?",
        ],
      },
    ],
  },
  annuity: {
    forWho: "Growth with downside protection",
    lede:
      "A fixed index annuity is a contract with an insurance company. Growth is linked to the performance of a market index, but your principal is protected from index losses. In exchange, your upside is capped.",
    blocks: [
      {
        h: "How the trade-off works",
        body:
          "If the index rises, you are credited a portion of that gain, limited by a cap, participation rate or spread. If the index falls, you are credited zero rather than taking the loss.",
      },
      {
        h: "The terms that matter most",
        list: [
          "Surrender period — commonly five to ten years; withdrawing more than the free amount before it ends triggers a charge",
          "Cap, participation rate and spread — these determine how much of the index gain you actually receive",
          "Rider fees — guaranteed income riders are useful but not free",
          "Carrier financial strength — ask for the AM Best rating",
        ],
      },
    ],
  },
  medicare: {
    forWho: "Filling the gaps at 65",
    lede:
      "Medicare is federal health coverage for people aged 65 and over, and for some younger people with qualifying disabilities. Original Medicare leaves real gaps, and the plans that fill them are where most of the confusion sits.",
    blocks: [
      {
        h: "The parts, briefly",
        list: [
          "Part A covers inpatient hospital care",
          "Part B covers outpatient and doctor services",
          "Part C, or Medicare Advantage, is a private plan that replaces A and B and usually bundles extras",
          "Part D covers prescription drugs",
          "Medicare Supplement, or Medigap, pays costs Original Medicare leaves to you",
        ],
      },
      {
        h: "Why timing matters more here than anywhere else",
        body:
          "Your Initial Enrollment Period spans the seven months around your 65th birthday. Miss it without qualifying coverage elsewhere and you can face a Part B late enrollment penalty added to your premium permanently.",
      },
    ],
  },
  health: {
    forWho: "Individual and family medical plans",
    lede: "Individual and family medical coverage for people who do not get insurance through an employer, including marketplace plans.",
    blocks: [
      {
        h: "When you can enroll",
        body:
          "Marketplace coverage has an annual Open Enrollment window. Outside it you need a qualifying life event, such as losing job-based coverage, moving, marrying, or having a child.",
      },
      {
        h: "What to compare beyond the premium",
        list: [
          "The deductible and the out-of-pocket maximum, which is your real worst case",
          "Whether your doctors and hospital are in network",
          "Whether your prescriptions are on the plan's drug list",
          "Whether you qualify for a premium tax credit",
        ],
      },
    ],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPublic(api.cms.publicPage, { slug: "coverage-options" });
  const c = page?.content ?? FALLBACK;
  return pageMetadata({ title: c.seoTitle, description: c.seoDescription, path: "/coverage-options" });
}

export default async function CoverageOptionsPage() {
  const [page, reference] = await Promise.all([fetchPublic(api.cms.publicPage, { slug: "coverage-options" }), fetchPublic(api.referenceData.publicData, {})]);
  const c = page?.content ?? FALLBACK;
  const coverage = reference?.coverageTypes?.length ? reference.coverageTypes : DEFAULT_COVERAGE_TYPES;

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

      <JumpNav items={coverage.map((p) => ({ id: `c-${p.key}`, label: p.name }))} />

      <div className="pw">
        {coverage.map((p) => {
          const detail = DETAILS[p.key];
          return (
            <article className="covblk" id={`c-${p.key}`} key={p.key}>
              <aside className="covrail">
                <div className="ic">
                  <Icon name={isIconName(p.icon) ? p.icon : "shield"} size={22} />
                </div>
                <h2>{p.name}</h2>
                <p className="covfor">{detail?.forWho ?? p.cardDescription}</p>
                <ButtonLink href={`/request?coverage=${p.key}`} variant="out" size="s" full>
                  Ask about this
                </ButtonLink>
              </aside>
              <div className="covbody">
                <p className="lede">{detail?.lede ?? p.cardDescription}</p>
                {detail?.blocks.map((b) => (
                  <div key={b.h}>
                    <h3>{b.h}</h3>
                    {b.body && <p className="sm">{b.body}</p>}
                    {b.list && (
                      <ul className="tick-list">
                        {b.list.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </article>
          );
        })}

        <article className="covblk" id="c-unsure">
          <aside className="covrail">
            <div className="ic">
              <Icon name="arrow" size={22} />
            </div>
            <h2>Not sure yet?</h2>
            <p className="covfor">Let an agent help you work it out</p>
            <ButtonLink href="/request?coverage=unsure" variant="navy" size="s" full>
              Help me work it out
            </ButtonLink>
          </aside>
          <div className="covbody">
            <p className="lede">
              That is fine. Tell us a little about yourself and what is bringing you here, and a licensed agent will help you work out what fits — with
              no pressure to buy anything.
            </p>
          </div>
        </article>

        <p className="xs covnote">
          This page is general information, not advice about your situation. Coverage, availability and pricing vary by state and by carrier. A licensed
          agent will confirm what applies to you.
        </p>

        <div style={{ marginTop: "2.5rem", maxWidth: 760 }}>
          <Alert kind="n">
            Legacy Builders is not an insurance carrier and does not sell insurance. We connect you with licensed independent agents, who can explain the
            options available in your state.
          </Alert>
        </div>
      </div>
    </>
  );
}
