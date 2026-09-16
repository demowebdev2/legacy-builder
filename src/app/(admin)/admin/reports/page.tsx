"use client";

import { useQuery } from "convex/react";
import { Suspense } from "react";
import { api } from "@convex/_generated/api";
import { useStaff, useTabParam } from "@/components/admin/commerce/hooks";
import {
  AccountActivityCard,
  BreakdownCard,
  DeliveriesCard,
  LeadTypeCard,
  LiabilityCard,
  PurchasesActivityCard,
  ReasonsCard,
  VolumeCard,
} from "@/components/admin/commerce/ReportsSections";
import { NoAccess } from "@/components/admin/commerce/shared";
import { PageHeader } from "@/components/layouts/PortalShell";
import { StatusBadge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Display";
import { PageLoading } from "@/components/ui/Feedback";
import { Segmented } from "@/components/ui/Navigation";
import { formatMoney } from "@/domain/money";

const WINDOWS = ["7", "30", "90"] as const;

export default function AdminReportsPage() {
  return (
    <>
      <PageHeader title="Reports" />
      <Suspense fallback={<PageLoading />}>
        <Reports />
      </Suspense>
    </>
  );
}

function Reports() {
  const { loading, can } = useStaff();
  const allowed = can("reports.read");
  const [windowKey, setWindow] = useTabParam(WINDOWS, "30", "days");
  const days = Number(windowKey);
  const report = useQuery(api.reports.operations, allowed ? { days } : "skip");
  const reference = useQuery(api.referenceData.adminData, allowed && can("settings.read") ? {} : "skip");

  if (!loading && !allowed) return <NoAccess what="Reports" />;

  const sourceName = new Map((reference?.marketingSources ?? []).map((s) => [s.key, s.name]));
  const stateName = new Map((reference?.states ?? []).map((s) => [s.code, s.name]));

  const toolbar = (
    <div className="row-b" style={{ marginBottom: "1.25rem" }}>
      <p className="sm">
        Operational reporting for the last <b>{days} days</b>. Balance liability is always current.
      </p>
      <Segmented
        label="Reporting window"
        value={windowKey}
        onChange={setWindow}
        options={WINDOWS.map((w) => ({ value: w, label: `${w} days` }))}
      />
    </div>
  );

  // Keep the previous window's data on screen only when it matches; otherwise show a loader.
  if (report === undefined || report.window !== days) {
    return (
      <>
        {toolbar}
        <PageLoading />
      </>
    );
  }

  const perDay = report.leadVolume.total / report.window;
  return (
    <>
      {toolbar}
      <div className="g g4" style={{ marginBottom: "1.25rem" }}>
        <StatCard label="Leads captured" value={report.leadVolume.total} icon="inbox" sub={`${perDay.toFixed(1)} a day`} />
        <StatCard
          label="Assignment rate"
          value={`${report.assignmentRate.percent}%`}
          icon="target"
          accent={report.assignmentRate.percent >= 80 ? "green" : report.assignmentRate.percent >= 50 ? "gold" : "red"}
          meter={report.assignmentRate.percent}
          meterTone={report.assignmentRate.percent >= 80 ? "green" : "amber"}
          sub={`${report.assignmentRate.assigned} of ${report.assignmentRate.distributable} distributable leads`}
        />
        <StatCard
          label="Unassigned"
          value={report.unassigned}
          icon="warn"
          accent={report.unassigned ? "red" : null}
          sub={report.unassigned ? "Waiting or unassignable" : "Nothing waiting"}
          href={report.unassigned ? "/admin/leads/unassigned" : undefined}
        />
        <StatCard
          label="Purchases"
          value={formatMoney(report.purchases.valueCents)}
          icon="money"
          accent="green"
          sub={`${report.purchases.orders} orders · ${report.purchases.leads} leads${report.purchases.declinedCount ? ` · ${report.purchases.declinedCount} declined` : ""}`}
        />
      </div>

      <div className="g g-2-1" style={{ marginBottom: "1.25rem" }}>
        <VolumeCard report={report} />
        <LeadTypeCard report={report} />
      </div>

      <div className="g g3" style={{ marginBottom: "1.25rem" }}>
        <BreakdownCard title="By coverage" rows={report.byCoverage} />
        <BreakdownCard title="By marketing source" rows={report.bySource} render={(key) => sourceName.get(key) ?? key.replace(/_/g, " ")} />
        <BreakdownCard title="By state" rows={report.byState} render={(key) => (stateName.get(key) ? `${stateName.get(key)} (${key})` : key)} />
      </div>

      <div className="g g-2-1" style={{ marginBottom: "1.25rem" }}>
        <DeliveriesCard report={report} />
        <div className="stack">
          <PurchasesActivityCard report={report} />
          <AccountActivityCard report={report} />
        </div>
      </div>

      <div className="g g-2-1" style={{ marginBottom: "1.25rem" }}>
        <ReasonsCard report={report} />
        <BreakdownCard title="Lead outcomes" description="Current status of leads captured in the window" rows={report.byStatus} render={(key) => <StatusBadge status={key} />} />
      </div>

      <LiabilityCard report={report} />
    </>
  );
}
