import type { MetadataRoute } from "next";
import { api } from "@convex/_generated/api";
import { LEGAL_DOCUMENT_TYPES } from "@/domain/referenceDefaults";
import { fetchPublic } from "@/lib/convexServer";
import { siteUrl } from "@/lib/site";

const PAGES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/request", priority: 0.9, changeFrequency: "monthly" },
  { path: "/coverage-options", priority: 0.8, changeFrequency: "monthly" },
  { path: "/how-it-works", priority: 0.7, changeFrequency: "monthly" },
  { path: "/for-agents", priority: 0.7, changeFrequency: "monthly" },
  { path: "/apply", priority: 0.6, changeFrequency: "monthly" },
  { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  { path: "/request/withdraw", priority: 0.4, changeFrequency: "yearly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const legal = await Promise.all(
    LEGAL_DOCUMENT_TYPES.map(async (t) => {
      const doc = await fetchPublic(api.legalDocuments.publishedBySlug, { slug: t.slug });
      return doc ? { slug: t.slug, publishedAt: doc.publishedAt } : null;
    }),
  );
  return [
    ...PAGES.map((p) => ({ url: `${base}${p.path === "/" ? "" : p.path}`, changeFrequency: p.changeFrequency, priority: p.priority })),
    ...legal
      .filter((d): d is { slug: (typeof LEGAL_DOCUMENT_TYPES)[number]["slug"]; publishedAt: number | null } => !!d)
      .map((d) => ({
        url: `${base}/legal/${d.slug}`,
        lastModified: d.publishedAt ? new Date(d.publishedAt) : undefined,
        changeFrequency: "yearly" as const,
        priority: 0.3,
      })),
  ];
}
