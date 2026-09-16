"use client";

import { Tabs } from "@/components/ui/Navigation";

export type CmsTab = "pages" | "faqs" | "legal" | "media";

/** Prototype `A.cms` tab bar, kept across the CMS routes. Legal lives on its own route. */
export function CmsTabs({ active, counts }: { active: CmsTab; counts?: Partial<Record<CmsTab, number | null>> }) {
  return (
    <Tabs
      label="Content sections"
      active={active}
      items={[
        { key: "pages", label: "Pages", count: counts?.pages ?? null, href: "/admin/cms" },
        { key: "faqs", label: "FAQs", count: counts?.faqs ?? null, href: "/admin/cms/faq" },
        { key: "legal", label: "Legal", count: counts?.legal ?? null, href: "/admin/legal" },
        { key: "media", label: "Media", count: counts?.media ?? null, href: "/admin/cms/media" },
      ]}
    />
  );
}

/** Public URL for a CMS page slug. */
export function publicPath(slug: string): string {
  return slug === "home" ? "/" : `/${slug}`;
}
