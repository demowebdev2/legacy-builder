"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useStaff } from "@/components/admin/commerce/hooks";
import { NoAccess } from "@/components/admin/commerce/shared";
import { CmsTabs, publicPath } from "@/components/admin/content/CmsTabs";
import { EditPageModal } from "@/components/admin/content/EditPageModal";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardFooter } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/Display";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { timeAgo } from "@/domain/format";

export default function AdminCmsPagesPage() {
  const { loading, can } = useStaff();
  const allowed = can("cms.manage");
  const pages = useQuery(api.cms.adminPages, allowed ? {} : "skip");
  const [editing, setEditing] = useState<Doc<"cmsPages"> | null>(null);

  if (!loading && !allowed) {
    return (
      <>
        <PageHeader title="Content management" />
        <NoAccess what="The CMS" />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Content management" />
      <CmsTabs active="pages" counts={{ pages: pages?.length ?? null }} />
      {pages === undefined ? (
        <LoadingBlock rows={6} label="Loading pages" />
      ) : (
        <DataTable
          caption="CMS pages"
          isEmpty={pages.length === 0}
          empty={
            <EmptyState icon="doc" title="No CMS pages">
              Pages are created with the site structure; their hero, sections and SEO fields are edited here.
            </EmptyState>
          }
          columns={[
            { label: "Page" },
            { label: "Slug" },
            { label: "Status" },
            { label: "Version" },
            { label: "Updated" },
            { label: "By" },
            { label: "Actions", align: "right", srOnly: true },
          ]}
          footer={
            <CardFooter>
              <span className="xs">Structured content only — headline, intro, badge, sections and SEO. Publishing makes a new version live immediately.</span>
            </CardFooter>
          }
        >
          {pages.map((p) => {
            const seoTitle = (p.draftContent ?? p.content).seoTitle;
            return (
              <tr key={p._id}>
                <td>
                  <button type="button" className="nm link" style={{ textDecoration: "none", textAlign: "left" }} onClick={() => setEditing(p)}>
                    {p.title}
                  </button>
                  <span className="tsub">{seoTitle}</span>
                </td>
                <td className="mono sm nowrap">{publicPath(p.slug)}</td>
                <td>
                  <div className="row" style={{ gap: ".3rem" }}>
                    <StatusBadge status={p.status} />
                    {p.draftContent && p.publishedAt && <Badge tone="n">Live v{p.version}</Badge>}
                  </div>
                </td>
                <td className="sm">v{p.version}</td>
                <td className="sm nowrap">{timeAgo(p.updatedAt)}</td>
                <td className="sm">{p.updatedByName}</td>
                <td className="tr">
                  <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    <a className="b b-ghost b-xs" href={publicPath(p.slug)} target="_blank" rel="noreferrer" aria-label={`Preview ${p.title} (opens in a new tab)`}>
                      Preview
                    </a>
                    <Button variant="out" size="xs" onClick={() => setEditing(p)} aria-label={`Edit ${p.title}`}>
                      Edit
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
      {editing && <EditPageModal page={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
