"use client";

import { useQuery } from "convex/react";
import { Suspense, useState } from "react";
import { api } from "@convex/_generated/api";
import { AcquisitionCostModal } from "@/components/admin/commerce/AcquisitionCostModal";
import { FinanceDeclined, FinanceEconomics, FinanceOverview, FinanceTransactions } from "@/components/admin/commerce/FinanceSections";
import { useStaff, useTabParam } from "@/components/admin/commerce/hooks";
import { NoAccess } from "@/components/admin/commerce/shared";
import { PageHeader } from "@/components/layouts/PortalShell";
import { PageLoading } from "@/components/ui/Feedback";
import { Tabs } from "@/components/ui/Navigation";

const TABS = ["overview", "transactions", "declined", "economics"] as const;

export default function AdminFinancePage() {
  return (
    <>
      <PageHeader title="Finance" />
      <Suspense fallback={<PageLoading />}>
        <Finance />
      </Suspense>
    </>
  );
}

function Finance() {
  const { loading, can } = useStaff();
  const allowed = can("payments.read");
  const [tab, setTab] = useTabParam(TABS, "overview");
  const data = useQuery(api.reports.finance, allowed ? {} : "skip");
  const summary = useQuery(api.orders.adminSummary, allowed ? {} : "skip");
  const distribution = useQuery(api.distribution.admin.settings, allowed && can("distribution.read") ? {} : "skip");
  const [editCost, setEditCost] = useState(false);

  if (!loading && !allowed) return <NoAccess what="Finance" />;
  if (data === undefined) return <PageLoading />;

  return (
    <>
      <Tabs
        label="Finance views"
        active={tab}
        onChange={setTab}
        items={[
          { key: "overview", label: "Overview" },
          { key: "transactions", label: "Transactions", count: summary?.total ?? null },
          { key: "declined", label: "Declined purchases", count: data.declined.length },
          { key: "economics", label: "Lead economics" },
        ]}
      />
      {tab === "overview" && <FinanceOverview data={data} />}
      {tab === "transactions" && <FinanceTransactions canRefund={can("refunds.issue")} />}
      {tab === "declined" && <FinanceDeclined data={data} canRetry={can("purchases.retry")} holdOnDecline={distribution?.settings.holdOnDeclinedPurchase ?? null} />}
      {tab === "economics" && (
        <FinanceEconomics
          data={data}
          canEditCost={can("pricing.manage")}
          onEditCost={() => setEditCost(true)}
          standardRecipientCount={distribution?.settings.standardRecipientCount ?? null}
        />
      )}
      {editCost && <AcquisitionCostModal pricing={data.pricing} onClose={() => setEditCost(false)} />}
    </>
  );
}
