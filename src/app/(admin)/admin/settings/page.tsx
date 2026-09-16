"use client";

import { Suspense } from "react";
import { useStaff, useTabParam } from "@/components/admin/commerce/hooks";
import { NoAccess } from "@/components/admin/commerce/shared";
import { SettingsGeneral } from "@/components/admin/content/SettingsGeneral";
import { SettingsCompliance, SettingsIntegrations, SettingsMessages } from "@/components/admin/content/SettingsPanels";
import { PageHeader } from "@/components/layouts/PortalShell";
import { PageLoading } from "@/components/ui/Feedback";
import { Tabs } from "@/components/ui/Navigation";

const TABS = ["general", "compliance", "integrations", "messages"] as const;
const MESSAGE_FILTERS = ["all", "sent", "bypassed", "failed"] as const;

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <Suspense fallback={<PageLoading />}>
        <Settings />
      </Suspense>
    </>
  );
}

function Settings() {
  const { loading, can } = useStaff();
  const [tab, setTab] = useTabParam(TABS, "general");
  const [filter, setFilter] = useTabParam(MESSAGE_FILTERS, "all", "status");

  if (loading) return <PageLoading />;
  if (!can("settings.read")) return <NoAccess what="Settings" />;
  const canManage = can("settings.manage");

  return (
    <>
      <Tabs
        label="Settings sections"
        active={tab}
        onChange={setTab}
        items={[
          { key: "general", label: "General" },
          { key: "compliance", label: "Compliance" },
          { key: "integrations", label: "Integrations" },
          { key: "messages", label: "Messages" },
        ]}
      />
      {tab === "general" && <SettingsGeneral canManage={canManage} />}
      {tab === "compliance" && <SettingsCompliance canManage={canManage} />}
      {tab === "integrations" && <SettingsIntegrations />}
      {tab === "messages" && <SettingsMessages filter={filter} onFilter={setFilter} />}
    </>
  );
}
