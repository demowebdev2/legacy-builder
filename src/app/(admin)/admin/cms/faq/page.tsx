"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useStaff } from "@/components/admin/commerce/hooks";
import { NoAccess } from "@/components/admin/commerce/shared";
import { CmsTabs } from "@/components/admin/content/CmsTabs";
import { AUDIENCE_TITLE, type FaqAudience, FaqModal } from "@/components/admin/content/FaqModal";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { cn } from "@/lib/cn";

export default function AdminCmsFaqPage() {
  const { loading, can } = useStaff();
  const allowed = can("cms.manage");
  const faqs = useQuery(api.cms.adminFaqs, allowed ? {} : "skip");
  const [editing, setEditing] = useState<{ faq: Doc<"faqs"> | null; audience: FaqAudience } | null>(null);

  if (!loading && !allowed) {
    return (
      <>
        <PageHeader title="Content management" />
        <NoAccess what="The CMS" />
      </>
    );
  }

  const nextSort = (audience: FaqAudience) => (faqs ?? []).filter((f) => f.audience === audience).reduce((max, f) => Math.max(max, f.sortOrder + 1), 0);

  return (
    <>
      <PageHeader title="Content management" />
      <CmsTabs active="faqs" counts={{ faqs: faqs?.length ?? null }} />
      {faqs === undefined ? (
        <div className="g g2">
          <LoadingBlock rows={5} label="Loading FAQs" />
          <LoadingBlock rows={5} label="Loading FAQs" />
        </div>
      ) : (
        <div className="g g2" style={{ alignItems: "start" }}>
          {(["consumer", "agent"] as const).map((audience) => {
            const rows = faqs.filter((f) => f.audience === audience);
            return (
              <Card key={audience}>
                <CardHeader
                  title={AUDIENCE_TITLE[audience]}
                  description={`${rows.filter((f) => f.published).length} published · ${rows.filter((f) => !f.published).length} hidden`}
                  actions={
                    <Button variant="out" size="s" icon="plus" onClick={() => setEditing({ faq: null, audience })}>
                      Add
                    </Button>
                  }
                />
                <CardBody className="stack" style={{ gap: ".6rem" }}>
                  {rows.length === 0 ? (
                    <EmptyState icon="info" title="No questions yet">
                      Add the first {audience === "consumer" ? "consumer" : "agent"} question.
                    </EmptyState>
                  ) : (
                    rows.map((f) => (
                      <div key={f._id} className={cn("faq-item", !f.published && "off")}>
                        <div className="row-b" style={{ marginBottom: ".3rem", flexWrap: "nowrap", alignItems: "flex-start" }}>
                          <span className="strong" style={{ fontSize: ".88rem" }}>
                            {f.question}
                          </span>
                          <Button variant="ghost" size="xs" onClick={() => setEditing({ faq: f, audience })}>
                            Edit<span className="sr-only"> {f.question}</span>
                          </Button>
                        </div>
                        <p className="sm" style={{ whiteSpace: "pre-line" }}>
                          {f.answer}
                        </p>
                        <div className="row" style={{ gap: ".35rem", marginTop: ".45rem" }}>
                          <span className="xs">#{f.sortOrder}</span>
                          {!f.published && <Badge tone="n">Hidden</Badge>}
                        </div>
                      </div>
                    ))
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
      {editing && (
        <FaqModal faq={editing.faq} audience={editing.audience} nextSortOrder={nextSort(editing.audience)} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
