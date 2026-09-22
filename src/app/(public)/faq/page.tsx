import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { FaqList } from "@/components/public/FaqList";
import { Hero } from "@/components/public/Hero";
import { JsonLd } from "@/components/public/JsonLd";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

const FALLBACK = {
  heroTitle: "Frequently asked questions",
  heroBody: "Straight answers for consumers and for agents.",
  badge: "",
  seoTitle: "FAQ — Legacy Builders",
  seoDescription: "Common questions from consumers and agents.",
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPublic(api.cms.publicPage, { slug: "faq" });
  const c = page?.content ?? FALLBACK;
  return pageMetadata({ title: c.seoTitle, description: c.seoDescription, path: "/faq" });
}

export default async function FaqPage() {
  const [page, faqs] = await Promise.all([fetchPublic(api.cms.publicPage, { slug: "faq" }), fetchPublic(api.cms.publicFaqs, {})]);
  const c = page?.content ?? FALLBACK;
  const all = faqs ?? [];
  const consumer = all.filter((f) => f.audience === "consumer");
  const agent = all.filter((f) => f.audience === "agent");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: all.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };

  return (
    <>
      {all.length > 0 && <JsonLd data={jsonLd} />}
      <Hero badge={c.badge || undefined} title={c.heroTitle} body={c.heroBody} />

      <div className="pw">
        {all.length === 0 ? (
          <div className="card">
            <EmptyState icon="info" title="No questions published yet" action={<ButtonLink href="/contact">Contact us</ButtonLink>}>
              If you have a question, send it to us and the right person will reply.
            </EmptyState>
          </div>
        ) : (
          <div className="g g2" style={{ alignItems: "start" }}>
            {consumer.length > 0 && (
              <section aria-labelledby="faq-consumers">
                <div className="eyebrow" style={{ marginBottom: ".3rem" }}>
                  For consumers
                </div>
                <h2 id="faq-consumers" className="h2" style={{ marginBottom: "1rem" }}>
                  If you are looking for cover
                </h2>
                <FaqList items={consumer} openFirst />
                <p className="sm" style={{ marginTop: "1rem" }}>
                  Ready to talk to someone? <Link className="link" href="/request">Get matched free</Link> or{" "}
                  <Link className="link" href="/request/withdraw">
                    withdraw your consent
                  </Link>
                  .
                </p>
              </section>
            )}
            {agent.length > 0 && (
              <section aria-labelledby="faq-agents">
                <div className="eyebrow" style={{ marginBottom: ".3rem" }}>
                  For agents
                </div>
                <h2 id="faq-agents" className="h2" style={{ marginBottom: "1rem" }}>
                  If you are a licensed agent
                </h2>
                <FaqList items={agent} openFirst />
                <p className="sm" style={{ marginTop: "1rem" }}>
                  See <Link className="link" href="/for-agents">for agents</Link> or <Link className="link" href="/apply">apply to join</Link>.
                </p>
              </section>
            )}
          </div>
        )}

        <div className="card card-p row-b" style={{ marginTop: "2.5rem" }}>
          <div>
            <h2 className="h3" style={{ marginBottom: ".2rem" }}>
              Still have a question?
            </h2>
            <p className="sm">Tell us which side of the platform you are on and your message goes to the right person.</p>
          </div>
          <ButtonLink href="/contact" variant="navy">
            Contact us
          </ButtonLink>
        </div>
      </div>
    </>
  );
}
