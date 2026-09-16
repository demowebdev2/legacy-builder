"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { api } from "@convex/_generated/api";
import { type NavGroup, type NavItem, PortalShell } from "@/components/layouts/PortalShell";
import { PageLoading } from "@/components/ui/Feedback";
import type { StaffRole } from "@/domain/constants";
import { type Permission, roleHasPermission } from "@/domain/permissions";

type Item = NavItem & { permission: Permission };

/** Admin back-office layout (prototype NAV.admin). Separate from the agent sidebar by design. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const me = useQuery(api.users.me);
  const router = useRouter();
  const staff = me?.kind === "staff" ? me : null;
  const mfaBlocked = !!staff?.mfa && staff.mfa.required && (!staff.mfa.enrolled || !staff.mfa.verified);
  const counts = useQuery(api.reports.adminNavCounts, staff && !mfaBlocked ? {} : "skip");

  useEffect(() => {
    if (me === undefined) return;
    if (me === null) router.replace("/auth/login?next=/admin");
    else if (me.kind !== "staff") router.replace(me.kind === "account" ? "/agent" : "/apply");
    else if (mfaBlocked) router.replace("/auth/two-factor");
  }, [me, mfaBlocked, router]);

  if (!staff || mfaBlocked) {
    return (
      <div className="content">
        <PageLoading />
      </div>
    );
  }

  const role = staff.role as StaffRole;
  const groupsDef: Array<{ label: string | null; items: Item[] }> = [
    { label: null, items: [{ href: "/admin", label: "Dashboard", icon: "grid", exact: true, permission: "reports.read" }] },
    {
      label: "Leads",
      items: [
        { href: "/admin/leads", label: "All leads", icon: "list", permission: "leads.read" },
        { href: "/admin/leads/unassigned", label: "Unassigned", icon: "warn", count: counts?.unassigned, warn: true, permission: "leads.read" },
        { href: "/admin/disputes", label: "Disputes", icon: "flow", count: counts?.disputes, warn: true, permission: "disputes.read" },
      ],
    },
    {
      label: "Distribution",
      items: [
        { href: "/admin/simulator", label: "Simulator", icon: "target", permission: "distribution.read" },
        { href: "/admin/distribution", label: "Rules & weights", icon: "cog", permission: "distribution.read" },
        { href: "/admin/assignments", label: "Assignment log", icon: "refresh", permission: "distribution.read" },
      ],
    },
    {
      label: "Accounts",
      items: [
        { href: "/admin/accounts", label: "All accounts", icon: "users", count: counts?.attention, warn: true, permission: "accounts.read" },
        { href: "/admin/verification", label: "Verification", icon: "badge", count: counts?.verification, permission: "licenses.verify" },
      ],
    },
    {
      label: "Commercial",
      items: [
        { href: "/admin/pricing", label: "Lead pricing", icon: "doc", permission: "pricing.manage" },
        { href: "/admin/purchases", label: "Purchases", icon: "card", permission: "payments.read" },
        { href: "/admin/finance", label: "Finance", icon: "money", count: counts?.declined, warn: true, permission: "payments.read" },
        { href: "/admin/reports", label: "Reports", icon: "chart", permission: "reports.read" },
      ],
    },
    {
      label: "Compliance",
      items: [
        { href: "/admin/suppression", label: "Suppression", icon: "ban", permission: "suppression.read" },
        { href: "/admin/audit-log", label: "Audit log", icon: "eye", permission: "audit.read" },
      ],
    },
    {
      label: "Platform",
      items: [
        { href: "/admin/cms", label: "CMS", icon: "edit", permission: "cms.manage" },
        { href: "/admin/legal", label: "Legal documents", icon: "lock", permission: "legal.draft" },
        { href: "/admin/support", label: "Support", icon: "mail", count: counts?.support, permission: "support.manage" },
        { href: "/admin/users", label: "Users & roles", icon: "user", permission: "users.manage" },
        { href: "/admin/settings", label: "Settings", icon: "cog", permission: "settings.read" },
      ],
    },
  ];
  const groups: NavGroup[] = groupsDef
    .map((g) => ({ label: g.label, items: g.items.filter((i) => roleHasPermission(role, i.permission)) }))
    .filter((g) => g.items.length > 0);

  return (
    <PortalShell
      kind="Admin back office"
      crumb="Admin"
      groups={groups}
      user={{ name: staff.name, detail: `${role.charAt(0)}${role.slice(1).toLowerCase()} · 2FA ${staff.mfa?.enrolled ? "on" : "off"}` }}
    >
      {children}
    </PortalShell>
  );
}
