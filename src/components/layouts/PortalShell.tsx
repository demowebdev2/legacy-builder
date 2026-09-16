"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Feedback";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LogoMark } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  count?: number | null;
  warn?: boolean;
  /** Extra path prefixes that should highlight this item. */
  match?: string[];
  exact?: boolean;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

interface HeaderState {
  title: string;
  actions?: ReactNode;
}

const HeaderContext = createContext<(state: HeaderState) => void>(() => undefined);

/** Pages call this to set the sticky top-bar title and actions (prototype `renderTopbar`). */
export function PageHeader({ title, actions }: HeaderState) {
  const set = useContext(HeaderContext);
  useEffect(() => {
    set({ title, actions });
  }, [set, title, actions]);
  useEffect(() => {
    document.title = `${title} — Legacy Builders`;
  }, [title]);
  return null;
}

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function PortalShell({
  kind,
  crumb,
  groups,
  user,
  banner,
  children,
}: {
  kind: string;
  crumb: string;
  groups: NavGroup[];
  user: { name: string; detail: string };
  banner?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuthActions();
  // The menu is open only for the path it was opened on, so navigating closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean | ((o: boolean) => boolean)) =>
    setOpenOn((prev) => ((typeof next === "function" ? next(prev === pathname) : next) ? pathname : null));
  const [header, setHeader] = useState<HeaderState>({ title: "" });
  const [signingOut, setSigningOut] = useState(false);

  // The most specific matching item wins (e.g. /admin/leads/unassigned over /admin/leads).
  const activeHref = useMemo(() => {
    let best: string | null = null;
    for (const g of groups) {
      for (const it of g.items) {
        if (isActive(pathname, it) && (!best || it.href.length > best.length)) best = it.href;
      }
    }
    return best;
  }, [groups, pathname]);

  const onSignOut = async () => {
    setSigningOut(true);
    await signOut();
    router.replace("/auth/login");
  };

  return (
    <HeaderContext.Provider value={setHeader}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[300] focus:bg-white focus:p-2">
        Skip to content
      </a>
      <div className="app">
        <aside className={cn("sb", open && "open")} aria-label={`${kind} navigation`}>
          <div className="sb-top">
            <Link href={groups[0]?.items[0]?.href ?? "/"} className="sb-brand">
              <LogoMark tone="dark" width={30} height={36} />
              <span>
                <b>Legacy Builders</b>
                <span>{kind}</span>
              </span>
            </Link>
          </div>
          <nav className="sb-nav">
            {groups.map((g, gi) => (
              <div key={gi}>
                {g.label && <div className="sb-grp">{g.label}</div>}
                {g.items.map((it) => {
                  const on = it.href === activeHref;
                  return (
                    <Link key={it.href} href={it.href} className={cn("sb-a", on && "on")} aria-current={on ? "page" : undefined}>
                      <Icon name={it.icon} />
                      <span>{it.label}</span>
                      {!!it.count && <span className={cn("pill", it.warn && "warn")}>{it.count}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sb-ft">
            <button type="button" className="sb-user" onClick={onSignOut} disabled={signingOut} title="Sign out">
              <Avatar name={user.name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{user.name}</b>
                <span>{user.detail}</span>
              </div>
              <Icon name="out" />
              <span className="sr-only">Sign out</span>
            </button>
          </div>
        </aside>
        <button type="button" className={cn("scrim", open && "on")} aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
        <div className="main">
          <header className="tb">
            <button type="button" className="burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <Icon name="menu" />
            </button>
            <div style={{ minWidth: 0 }}>
              <div className="crumb">{crumb}</div>
              <h1 className="truncate">{header.title}</h1>
            </div>
            <div className="spacer" />
            <div className="b-row" style={{ flexWrap: "nowrap" }}>
              {header.actions}
            </div>
          </header>
          {banner}
          <main className="content" id="main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </HeaderContext.Provider>
  );
}
