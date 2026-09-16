import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui/Logo";

/** Auth screens reuse the prototype's navy "gate" backdrop with a white card. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="gate">
      <div className="gate-in">
        <div className="gate-hd">
          <Link href="/" aria-label="Legacy Builders home">
            <LogoMark tone="dark" arrow width={52} height={62} />
          </Link>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="card card-p">{children}</div>
        {footer && <div className="gate-ft">{footer}</div>}
      </div>
    </div>
  );
}
