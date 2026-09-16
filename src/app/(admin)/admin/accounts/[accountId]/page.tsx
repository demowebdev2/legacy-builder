"use client";

import { useQuery } from "convex/react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { AccountHeader } from "@/components/admin/accounts/AccountHeader";
import { AuditTab } from "@/components/admin/accounts/AuditTab";
import { BalanceTab } from "@/components/admin/accounts/BalanceTab";
import { ComplianceTab } from "@/components/admin/accounts/ComplianceTab";
import { DisputesTab } from "@/components/admin/accounts/DisputesTab";
import { FinanceTab } from "@/components/admin/accounts/FinanceTab";
import { SectionBoundary, useStaffAccess } from "@/components/admin/accounts/kit";
import { LeadsTab } from "@/components/admin/accounts/LeadsTab";
import { LicencesTab } from "@/components/admin/accounts/LicencesTab";
import { OverviewTab } from "@/components/admin/accounts/OverviewTab";
import { PurchasesTab } from "@/components/admin/accounts/PurchasesTab";
import { TeamTab } from "@/components/admin/accounts/TeamTab";
import { PageHeader } from "@/components/layouts/PortalShell";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState, PageLoading } from "@/components/ui/Feedback";
import { type TabItem, Tabs } from "@/components/ui/Navigation";
import type { Permission } from "@/domain/permissions";

type TabKey = "overview" | "licences" | "compliance" | "purchases" | "balance" | "leads" | "finance" | "team" | "disputes" | "audit";

export default function AdminAccountPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Account" />
          <PageLoading />
        </>
      }
    >
      <AccountDetail />
    </Suspense>
  );
}

function AccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const params = useSearchParams();
  const access = useStaffAccess();
  const canRead = access.can("accounts.read");
  const data = useQuery(api.accounts.adminGet, canRead ? { accountId: accountId as Id<"accounts"> } : "skip");

  if (!canRead) {
    return (
      <>
        <PageHeader title="Account" />
        <div className="card">
          <EmptyState icon="lock" title="No access to accounts">
            Your role does not include account records.
          </EmptyState>
        </div>
      </>
    );
  }

  if (data === undefined) {
    return (
      <>
        <PageHeader title="Account" />
        <PageLoading />
      </>
    );
  }

  if (data === null) {
    return (
      <>
        <PageHeader title="Account not found" />
        <div className="card">
          <EmptyState
            icon="warn"
            title="Account not found"
            action={
              <ButtonLink href="/admin/accounts" variant="out" size="s" icon="back">
                Back to accounts
              </ButtonLink>
            }
          >
            No account with that id. It may have been mistyped.
          </EmptyState>
        </div>
      </>
    );
  }

  const agency = data.account.type === "agency";
  const pendingLicences = data.licenses.filter((l) => l.verificationStatus === "unverified").length;
  const defs: Array<TabItem & { key: TabKey; permission: Permission; show?: boolean }> = [
    { key: "overview", label: "Overview", permission: "accounts.read" },
    { key: "licences", label: "Licences", permission: "accounts.read", count: pendingLicences || null },
    { key: "compliance", label: "Compliance", permission: "accounts.read", count: data.tpmo.pending || data.eo?.verificationStatus === "unverified" ? 1 : null },
    { key: "purchases", label: "Purchases", permission: "payments.read", count: data.metrics.orderCount },
    { key: "balance", label: "Lead balance", permission: "ledger.read" },
    { key: "leads", label: "Leads", permission: "distribution.read" },
    { key: "finance", label: "Finance", permission: "payments.read", count: data.metrics.declinedOpen || null },
    { key: "team", label: "Team", permission: "accounts.read", count: data.members.length, show: agency },
    { key: "disputes", label: "Disputes", permission: "disputes.read", count: data.disputes.total },
    { key: "audit", label: "Audit", permission: "audit.read" },
  ];
  const visible = defs.filter((t) => t.show !== false && access.can(t.permission));
  const requested = params.get("tab");
  const tab = (visible.find((t) => t.key === requested)?.key ?? "overview") as TabKey;
  const items: TabItem[] = visible.map((t) => ({ key: t.key, label: t.label, count: t.count, href: `/admin/accounts/${accountId}?tab=${t.key}` }));

  return (
    <>
      <PageHeader title={data.account.name} />
      <AccountHeader data={data} access={access} />
      <Tabs items={items} active={tab} label="Account sections" />
      <SectionBoundary resetKey={tab}>
        {tab === "overview" && <OverviewTab data={data} access={access} />}
        {tab === "licences" && <LicencesTab data={data} access={access} />}
        {tab === "compliance" && <ComplianceTab data={data} access={access} />}
        {tab === "purchases" && <PurchasesTab data={data} />}
        {tab === "balance" && <BalanceTab data={data} access={access} />}
        {tab === "leads" && <LeadsTab data={data} access={access} />}
        {tab === "finance" && <FinanceTab data={data} access={access} />}
        {tab === "team" && <TeamTab data={data} access={access} />}
        {tab === "disputes" && <DisputesTab data={data} />}
        {tab === "audit" && <AuditTab data={data} />}
      </SectionBoundary>
    </>
  );
}
