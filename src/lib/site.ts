import type { Metadata } from "next";

export const SITE_NAME = "Legacy Builders";

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Shared metadata builder: title, description, canonical URL and OpenGraph for public pages. */
export function pageMetadata(input: { title: string; description: string; path: string; noIndex?: boolean }): Metadata {
  const url = `${siteUrl()}${input.path}`;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
    },
    twitter: { card: "summary", title: input.title, description: input.description },
    robots: input.noIndex ? { index: false, follow: false } : undefined,
  };
}
