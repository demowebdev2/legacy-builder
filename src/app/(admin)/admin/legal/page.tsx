"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useStaff } from "@/components/admin/commerce/hooks";
import { NoAccess } from "@/components/admin/commerce/shared";
import { CmsTabs } from "@/components/admin/content/CmsTabs";
import { LegalDocumentCard, type LegalEntry } from "@/components/admin/content/LegalDocumentCard";
import { LegalDraftModal, LegalViewModal } from "@/components/admin/content/LegalModals";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Alert, LoadingBlock } from "@/components/ui/Feedback";

export default function AdminLegalPage() {
  const { loading, staff, can } = useStaff();
  const allowed = can("legal.draft");
  const entries = useQuery(api.legalDocuments.adminList, allowed ? {} : "skip");
  const [viewing, setViewing] = useState<Id<"legalDocuments"> | null>(null);
  const [drafting, setDrafting] = useState<LegalEntry | null>(null);

  if (!loading && !allowed) {
    return (
      <>
        <PageHeader title="Legal documents" />
        <NoAccess what="Legal documents" />
      </>
    );
  }

  const awaiting = (entries ?? []).filter((e) => e.pending?.status === "pending_approval").length;
  const openDraft = (entry: LegalEntry) => {
    setViewing(null);
    setDrafting(entry);
  };
  const viewingEntry = viewing ? (entries ?? []).find((e) => e.versions.some((v) => v.id === viewing)) : null;

  return (
    <>
      <PageHeader title="Legal documents" />
      {can("cms.manage") && <CmsTabs active="legal" counts={{ legal: entries?.length ?? null }} />}
      <Alert kind="e">
        <b>Legal versions are never deleted and never rolled back.</b> A correction publishes a superseding version. Every consumer consent record points at the
        exact version in force when they agreed — that link is the TCPA defence, and it cannot be retrofitted.
      </Alert>
      <div style={{ height: ".75rem" }} />
      <Alert kind="i">
        <b>Four-eyes publishing.</b> The author drafts and submits a version; a different admin approves and publishes it.
        {awaiting > 0 ? ` ${awaiting} version${awaiting === 1 ? " is" : "s are"} awaiting approval.` : ""}
        {!can("legal.publish") ? " Your role can draft and submit, not publish." : ""}
      </Alert>
      <div style={{ height: "1.25rem" }} />

      {entries === undefined ? (
        <div className="stack">
          <LoadingBlock rows={5} label="Loading legal documents" />
          <LoadingBlock rows={5} label="Loading legal documents" />
        </div>
      ) : (
        <div className="stack">
          {entries.map((entry) => (
            <LegalDocumentCard
              key={entry.docType}
              entry={entry}
              viewerId={staff?.userId ?? null}
              canPublish={can("legal.publish")}
              onView={setViewing}
              onDraft={() => openDraft(entry)}
            />
          ))}
        </div>
      )}

      {viewing && (
        <LegalViewModal
          documentId={viewing}
          onClose={() => setViewing(null)}
          onNewVersion={viewingEntry && viewingEntry.pending?.status !== "pending_approval" ? () => openDraft(viewingEntry) : undefined}
        />
      )}
      {drafting && (
        <LegalDraftModal
          docType={drafting.docType}
          title={drafting.title}
          initialContent={drafting.pending?.status === "draft" ? drafting.pending.content : (drafting.current?.content ?? "")}
          draftVersion={drafting.pending?.status === "draft" ? drafting.pending.version : null}
          nextVersion={Math.max(0, ...drafting.versions.map((v) => v.version)) + 1}
          onClose={() => setDrafting(null)}
        />
      )}
    </>
  );
}
