"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { DistributionSettingsEditor } from "@/components/admin/DistributionSettingsEditor";
import { useStaff } from "@/components/admin/hooks";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { PageHeader } from "@/components/layouts/PortalShell";
import { PageLoading } from "@/components/ui/Feedback";

function DistributionRulesView() {
  const data = useQuery(api.distribution.admin.settings);
  const { can } = useStaff();
  return (
    <>
      <PageHeader title="Rules & weights" />
      {data === undefined ? <PageLoading /> : <DistributionSettingsEditor data={data} canManage={can("distribution.manage")} />}
    </>
  );
}

export default function DistributionRulesPage() {
  return (
    <RequirePermission permission="distribution.read" title="Rules & weights">
      <DistributionRulesView />
    </RequirePermission>
  );
}
