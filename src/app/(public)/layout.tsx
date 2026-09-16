import type { ReactNode } from "react";
import { PublicFooter } from "@/components/layouts/PublicFooter";
import { PublicHeader } from "@/components/layouts/PublicHeader";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pub">
      <PublicHeader />
      <main id="main">{children}</main>
      <PublicFooter />
    </div>
  );
}
