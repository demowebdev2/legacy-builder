"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { api } from "@convex/_generated/api";
import { type NavGroup, PortalShell } from "@/components/layouts/PortalShell";
import { PageLoading } from "@/components/ui/Feedback";
import { Icon } from "@/components/ui/Icon";
import { statusBadge } from "@/domain/status";

/** Agent portal layout (prototype NAV.agent). Access is enforced by Convex; this only routes. */
export default function AgentLayout({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  const router = useRouter();
  const isAccount = me?.kind === "account";
  const account = isAccount ? me.account : null;
  const pending = account && ["pending_verification", "action_required", "rejected"].includes(account.status);
  const counts = useQuery(api.dashboard.agentNavCounts, isAccount && !pending ? {} : "skip");

  useEffect(() => {
    if (me === undefined) return;
    if (me === null) router.replace("/auth/login?next=/agent");
    else if (me.kind === "staff") router.replace("/admin");
    else if (me.kind === "none") router.replace("/apply");
    else if (pending) router.replace("/apply/pending");
  }, [me, pending, router]);

  if (!me || !account || pending) {
    return (
      <div className="content">
        <PageLoading />
      </div>
    );
  }

  const producer = me.role === "PRODUCER";
  const principal = me.role === "AGENCY_PRINCIPAL";
  const groups: NavGroup[] = [
    { label: null, items: [{ href: "/agent", label: "Dashboard", icon: "grid", exact: true }] },
    {
      label: "Leads",
      items: [
        { href: "/agent/leads", label: "My leads", icon: "inbox", count: counts?.newLeads },
        { href: "/agent/disputes", label: "Disputes", icon: "warn", count: counts?.pendingDisputes },
      ],
    },
    {
      label: "Account",
      items: [
        ...(producer
          ? []
          : [
              { href: "/agent/balance", label: "Lead balance", icon: "coin" as const },
              { href: "/agent/purchases", label: "Billing & purchases", icon: "card" as const },
              { href: "/agent/preferences", label: "Preferences", icon: "filter" as const },
            ]),
        { href: "/agent/licenses", label: producer ? "My licences" : "Licences & compliance", icon: "badge" },
        ...(principal ? [{ href: "/agent/team", label: "Team", icon: "users" as const }] : []),
      ],
    },
    {
      label: "You",
      items: [
        { href: "/agent/notifications", label: "Notifications", icon: "bell", count: counts?.unread },
        { href: "/agent/profile", label: "Profile & security", icon: "user", match: ["/agent/security"] },
        { href: "/agent/support", label: "Support", icon: "mail" },
      ],
    },
  ];

  const banner = account.readOnly ? (
    <div className="ro-banner" role="status">
      <Icon name="warn" />
      <span>
        <b>Read-only.</b>{" "}
        {account.status === "blocked"
          ? `Your account is blocked. ${account.statusReason ?? ""}`
          : account.status === "suspended"
            ? `Your account is suspended. ${account.statusReason ?? ""}`
            : "Your account is closed."}{" "}
        Existing leads remain visible; no new leads will be released and edits are disabled.
      </span>
    </div>
  ) : null;

  return (
    <PortalShell
      kind="Agent portal"
      crumb="Agent portal"
      groups={groups}
      banner={banner}
      user={{ name: me.name, detail: producer ? `Producer · ${account.name}` : `${account.balanceTotal} leads left · ${statusBadge(account.status)[1]}` }}
    >
      {children}
    </PortalShell>
  );
}
