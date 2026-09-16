import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/agent", "/admin", "/api", "/auth", "/apply/pending", "/apply/success", "/request/confirmation"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
