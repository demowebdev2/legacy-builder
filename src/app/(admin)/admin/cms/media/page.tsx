"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useStaff } from "@/components/admin/commerce/hooks";
import { NoAccess } from "@/components/admin/commerce/shared";
import { CmsTabs } from "@/components/admin/content/CmsTabs";
import { MediaAltModal, MediaUploadModal } from "@/components/admin/content/MediaModals";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { timeAgo } from "@/domain/format";

type Editing = { _id: Id<"media">; filename: string; altText: string; url: string | null; placeholder: boolean };

export default function AdminCmsMediaPage() {
  const { loading, can } = useStaff();
  const allowed = can("media.manage");
  const media = useQuery(api.cms.adminMedia, allowed ? {} : "skip");
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  if (!loading && !allowed) {
    return (
      <>
        <PageHeader title="Content management" />
        <NoAccess what="The media library" />
      </>
    );
  }

  const rows = (media ?? []).map((m) => ({ ...m, placeholder: !m.storageId }));
  const placeholders = rows.filter((m) => m.placeholder).length;

  return (
    <>
      <PageHeader title="Content management" />
      <CmsTabs active="media" counts={{ media: media?.length ?? null }} />
      {placeholders > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <Alert kind="w">
            <b>
              {placeholders} placeholder image{placeholders === 1 ? "" : "s"} still in the library.
            </b>{" "}
            They are development stand-ins, not licensed photography — replace them before launch.
          </Alert>
        </div>
      )}
      <Card>
        <CardHeader
          title="Media library"
          actions={
            <Button variant="out" size="s" icon="plus" onClick={() => setUploading(true)}>
              Upload
            </Button>
          }
        />
        <CardBody>
          {media === undefined ? (
            <LoadingBlock rows={4} label="Loading media" />
          ) : rows.length === 0 ? (
            <EmptyState icon="doc" title="No images yet" action={<Button variant="navy" size="s" onClick={() => setUploading(true)}>Upload the first image</Button>}>
              Uploaded images need alt text before they can be used.
            </EmptyState>
          ) : (
            <div className="g g4">
              {rows.map((m) => (
                <div key={m._id} className="media-tile hoverlift">
                  {m.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Convex storage and placeholder URLs are not next/image sources
                    <img loading="lazy" decoding="async" src={m.url} alt={m.altText} />
                  ) : (
                    <div style={{ aspectRatio: "4 / 3", background: "var(--soft-2)", display: "grid", placeItems: "center" }} className="xs">
                      File unavailable
                    </div>
                  )}
                  <div className="meta">
                    <div className="row-b" style={{ gap: ".4rem", flexWrap: "nowrap" }}>
                      <span className="xs strong" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.filename}>
                        {m.filename}
                      </span>
                      <Button variant="ghost" size="xs" onClick={() => setEditing(m)}>
                        Edit<span className="sr-only"> alt text for {m.filename}</span>
                      </Button>
                    </div>
                    <span className="xs" title={m.altText}>
                      Alt: {m.altText}
                    </span>
                    <div className="row" style={{ gap: ".3rem" }}>
                      {m.placeholder ? <Badge tone="a">Placeholder — replace</Badge> : <Badge tone="g">Uploaded</Badge>}
                      <span className="xs">{timeAgo(m.uploadedAt)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="xs" style={{ marginTop: ".9rem" }}>
            Alt text is required on upload — publishing is blocked without it.
          </p>
        </CardBody>
      </Card>
      {uploading && <MediaUploadModal onClose={() => setUploading(false)} />}
      {editing && <MediaAltModal media={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
