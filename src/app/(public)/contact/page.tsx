import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { ContactForm } from "@/components/public/ContactForm";
import { Hero } from "@/components/public/Hero";
import { Icon } from "@/components/ui/Icon";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

const FALLBACK = {
  heroTitle: "Contact us",
  heroBody: "Tell us which side of the platform you are on and your message goes to the right person.",
  badge: "",
  seoTitle: "Contact — Legacy Builders",
  seoDescription: "Get in touch with the Legacy Builders team.",
};

export async function generateMetadata(): Promise<Metadata> {
  const page = await fetchPublic(api.cms.publicPage, { slug: "contact" });
  const c = page?.content ?? FALLBACK;
  return pageMetadata({ title: c.seoTitle, description: c.seoDescription, path: "/contact" });
}

const SHORTCUTS = [
  {
    heading: "If you need cover",
    links: [
      { href: "/request", label: "Get matched with a licensed agent" },
      { href: "/request/withdraw", label: "Withdraw consent for a request" },
      { href: "/faq", label: "Consumer questions" },
    ],
  },
  {
    heading: "If you are an agent",
    links: [
      { href: "/auth/login", label: "Agent login" },
      { href: "/pricing", label: "Agent pricing" },
      { href: "/apply", label: "Apply to join" },
    ],
  },
];

export default async function ContactPage() {
  const page = await fetchPublic(api.cms.publicPage, { slug: "contact" });
  const c = page?.content ?? FALLBACK;

  return (
    <>
      <Hero badge={c.badge || undefined} title={c.heroTitle} body={c.heroBody} />
      <div className="pw">
        <div className="g g-2-1" style={{ alignItems: "start" }}>
          <ContactForm />
          <aside className="stack" aria-label="Shortcuts">
            {SHORTCUTS.map((group) => (
              <div key={group.heading} className="card card-p">
                <h2 className="h4" style={{ marginBottom: ".6rem" }}>
                  {group.heading}
                </h2>
                <ul className="plist" style={{ marginBottom: 0 }}>
                  {group.links.map((l) => (
                    <li key={l.href}>
                      <Icon name="arrow" />
                      <Link className="link" href={l.href}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="card card-p">
              <p className="xs">
                Existing agents can also raise a ticket from <b>Support</b> inside the agent portal, which keeps the conversation with your account.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
