"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url && typeof window !== "undefined") {
  console.error("NEXT_PUBLIC_CONVEX_URL is not set");
}
const convex = new ConvexReactClient(url ?? "https://missing-convex-url.invalid");

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
