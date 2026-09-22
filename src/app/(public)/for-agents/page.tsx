import type { Metadata } from "next";
import Image from "next/image";
import { api } from "@convex/_generated/api";
import { FaqList } from "@/components/public/FaqList";
import { Reveal } from "@/components/public/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

const FALLBACK = {
  heroTitle: "Leads you can actually work, at a price you can see.",
  heroBody:
    "Consented leads matched to the states and product lines you are licensed for, with the consumer's own words about why they are looking. Apply once and we verify your license before anything is released.",
  badge: "For licensed insurance professionals",
  seoTitle: "For agents — Legacy Builders",
  seoDescription: "Consented leads matched to the states and products you are licensed for. License verified before anything is released.",
};

const BENEFITS: Array<[IconName, string, string]> = [
  [
    "badge",
    "Verified before you start",
    "We check your producer number and state licenses against the national registry. Nothing is released and no card is charged until that passes.",
  ],
  [
    "coin",
    "You know why they called",
    "Every lead carries the consumer's own reason for looking, their budget range and their preferred contact window. You open with their situation, not a script.",
  ],
  [
    "lock",
    "Consent on the record",
    "Every lead carries the consent language the consumer agreed to, the timestamp, and the source. You are not guessing at provenance.",
  ],
  ["clock", "Assigned in real time", "SMS and email the moment a lead is assigned to you, with the full record waiting in your dashboard."],
];

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
      <section className="hero">
        <div className="pw hero-in" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div>
            <span className="badge badge-a">{c.badge || FALLBACK.badge}</span>
            <h1 style={{ marginTop: ".9rem", fontSize: "clamp(1.9rem,3.8vw,2.9rem)" }}>{c.heroTitle}</h1>
            <p className="lede">{c.heroBody}</p>
            <div className="b-row" style={{ marginTop: "1.5rem" }}>
              <ButtonLink href="/apply" variant="navy" size="lg">
                Apply to join
              </ButtonLink>
              <ButtonLink href="/auth/login" variant="out" size="lg">
                Agent login
              </ButtonLink>
            </div>
            <div className="trustrow">
              {["License verified before you start", "Consent captured and stored", "You choose states and products"].map((t) => (
                <div key={t}>
                  <Icon name="check" />
                  {t}
                </div>
              ))}
            </div>
          </div>
          <div className="hero-img">
            <Image
              src="https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?auto=format&fit=crop&w=1000&q=72"
              alt="An insurance professional at work"
              width={1000}
              height={750}
              sizes="(max-width: 1000px) 100vw, 45vw"
              priority
            />
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="pw">
          <div style={{ maxWidth: 640, marginBottom: "2rem" }}>
            <h2 className="h2">What you get</h2>
            <p className="lede" style={{ marginTop: ".6rem" }}>
              Leads that came from Legacy Builders&apos; own consumer site, with the consent on record and the license checked at both ends before anything
              moves.
            </p>
          </div>
          <div className="g g4">
            {BENEFITS.map(([icon, title, body], i) => (
              <Reveal key={title} index={i} className="card card-p">
                <div className="ic-g">
                  <Icon name={icon} size={20} />
                </div>
                <h4 className="h4" style={{ margin: ".85rem 0 .4rem" }}>
                  {title}
                </h4>
                <p className="sm">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="sec soft">
        <div className="pw">
          <div style={{ textAlign: "center", maxWidth: 600, margin: "0 auto 2rem" }}>
            <h2 className="h2">Solo producer, or a full agency</h2>
            <p className="sm" style={{ marginTop: ".5rem" }}>
              Same credit mechanics. What changes is who decides which producer works which lead.
            </p>
          </div>
          <div className="g g2" style={{ gap: "1.2rem", alignItems: "stretch" }}>
            <div className="card" style={{ padding: "1.8rem" }}>
              <div className="ic-g">
                <Icon name="user" size={20} />
              </div>
              <h3 className="h3" style={{ margin: ".9rem 0 .5rem" }}>
                Individual producer
              </h3>
              <p className="sm" style={{ marginBottom: "1.2rem" }}>
                One licensed agent, one login. Leads come straight to you.
              </p>
              <ul className="plist">
                {["Producer number and licenses verified at signup", "Choose your states, products and daily limit", "Simple dashboard: leads, balance, profile"].map(
                  (t) => (
                    <li key={t}>
                      <Icon name="check" />
                      {t}
                    </li>
                  ),
                )}
              </ul>
              <ButtonLink href="/apply?entity=individual" variant="out" full>
                Apply as an individual
              </ButtonLink>
            </div>
            <div className="card card-hl" style={{ padding: "1.8rem" }}>
              <div className="ic-g">
                <Icon name="bank" size={20} />
              </div>
              <h3 className="h3" style={{ margin: ".9rem 0 .5rem" }}>
                Agency
              </h3>
              <p className="sm" style={{ marginBottom: "1.2rem" }}>
                Two or more producers. Leads are shared at agency level and the principal assigns them internally.
              </p>
              <ul className="plist">
                {[
                  "Agency EIN, agency license and principal producer number verified",
                  "Every producer seat verified before it activates",
                  "Shared leads, seats included, team view",
                ].map((t) => (
                  <li key={t}>
                    <Icon name="check" />
                    {t}
                  </li>
                ))}
              </ul>
              <ButtonLink href="/apply?entity=agency" variant="navy" full>
                Apply as an agency
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="pw" style={{ maxWidth: 820 }}>
          <h2 className="h2" style={{ marginBottom: ".5rem" }}>
            Agent questions
          </h2>
          <p className="sm" style={{ marginBottom: "1.6rem" }}>
            Most agents reading this have paid for leads that went nowhere before. Volumes and pricing are shown during the application.
          </p>
          {faqs && faqs.length > 0 && <FaqList items={faqs} />}
          <div className="note note-n" style={{ marginTop: "1.6rem" }}>
            <Icon name="info" />
            <p>
              <b>Pricing, volumes and lead quality terms</b> are all shown during the application, before any card is charged, and are visible inside your
              dashboard at any time. You are not committed to anything by applying.
            </p>
          </div>
          <div className="b-row" style={{ justifyContent: "center", marginTop: "1.8rem" }}>
            <ButtonLink href="/apply" variant="navy">
              Apply to join
            </ButtonLink>
            <ButtonLink href="/auth/login" variant="out">
              Already a member? Log in
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
