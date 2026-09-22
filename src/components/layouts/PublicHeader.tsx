"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { LogoMark } from "@/components/ui/Logo";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/coverage-options", label: "Coverage options" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About us" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

/** Prototype `.phd` header, extended with section links and a mobile menu. */
export function PublicHeader() {
  const pathname = usePathname();
  // Open only for the path it was opened on, so navigating closes the menu without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: (o: boolean) => boolean) => setOpenOn((prev) => (next(prev === pathname) ? pathname : null));

  return (
    <header className="phd">
      <div className="phd-in">
        <Link href="/" className="brand" aria-label="Legacy Builders home">
          <LogoMark />
          <span>
            <b>Legacy Builders</b>
            <span>Insurance agent matching</span>
          </span>
        </Link>
        <nav className="phd-links" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="spacer" />
        <div className="b-row phd-cta">
          <ButtonLink href="/for-agents" variant="out" size="s">
            For agents
          </ButtonLink>
          <ButtonLink href="/request" variant="navy" size="s">
            Get covered today
          </ButtonLink>
        </div>
        <button type="button" className="burger phd-mobile" aria-label="Menu" aria-expanded={open} aria-controls="public-menu" onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? "x" : "menu"} />
        </button>
      </div>
      {open && (
        <nav className="pmenu" id="public-menu" aria-label="Mobile">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
          <div className="pmenu-sep">Insurance professionals</div>
          <Link href="/for-agents">For agents</Link>
          <Link href="/auth/login">Agent login</Link>
          <div className="b-row">
            <ButtonLink href="/request" variant="navy" full>
              Get covered today
            </ButtonLink>
          </div>
        </nav>
      )}
    </header>
  );
}
