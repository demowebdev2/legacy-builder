import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@convex/_generated/api";
import { formatDate } from "@/domain/format";
import { LEGAL_DOCUMENT_TYPES } from "@/domain/referenceDefaults";
import { fetchPublic } from "@/lib/convexServer";
import { pageMetadata } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

const isKnownSlug = (slug: string) => LEGAL_DOCUMENT_TYPES.some((t) => t.slug === slug);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = isKnownSlug(slug) ? await fetchPublic(api.legalDocuments.publishedBySlug, { slug }) : null;
  if (!doc) return { title: "Document not found — Legacy Builders", robots: { index: false, follow: false } };
  return pageMetadata({
    title: `${doc.title} — Legacy Builders`,
    description: `${doc.title} for Legacy Builders, version ${doc.version}.`,
    path: `/legal/${slug}`,
  });
}

export default async function LegalDocumentPage({ params }: Props) {
  const { slug } = await params;
  if (!isKnownSlug(slug)) notFound();
  const candidates = LEGAL_DOCUMENT_TYPES.filter((t) => t.slug !== slug);
  const [doc, ...otherDocs] = await Promise.all([
    fetchPublic(api.legalDocuments.publishedBySlug, { slug }),
    ...candidates.map((t) => fetchPublic(api.legalDocuments.publishedBySlug, { slug: t.slug })),
  ]);
  if (!doc) notFound();
  const others = candidates.filter((_, i) => !!otherDocs[i]);

  return (
    <div className="pw pw-n">
      <nav aria-label="Breadcrumb" className="xs" style={{ marginBottom: ".6rem" }}>
        <Link href="/" className="link">
          Home
        </Link>{" "}
        / Legal
      </nav>
      <h1 className="h1" style={{ marginBottom: ".4rem" }}>
        {doc.title}
      </h1>
      <p className="xs" style={{ marginBottom: "1.4rem" }}>
        Version {doc.version}
        {doc.publishedAt ? ` · published ${formatDate(doc.publishedAt)}` : ""}
      </p>
      <article className="card card-p">
        <div className="prose">{doc.content}</div>
      </article>
      <div style={{ marginTop: "1.6rem" }}>
        <div className="eyebrow" style={{ marginBottom: ".5rem" }}>
          Other documents
        </div>
        <ul className="row" style={{ listStyle: "none", gap: ".4rem 1.1rem" }}>
          {others.map((t) => (
            <li key={t.slug}>
              <Link className="link sm" href={`/legal/${t.slug}`}>
                {t.title}
              </Link>
            </li>
          ))}
          <li>
            <Link className="link sm" href="/request/withdraw">
              Withdraw consent
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
