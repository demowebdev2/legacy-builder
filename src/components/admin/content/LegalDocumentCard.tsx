"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/Display";
import { formatDate, timeAgo } from "@/domain/format";
import { useAction } from "@/hooks/useAction";

export type LegalEntry = FunctionReturnType<typeof api.legalDocuments.adminList>[number];

export function LegalDocumentCard({
  entry,
  viewerId,
  canPublish,
  onView,
  onDraft,
}: {
  entry: LegalEntry;
  viewerId: Id<"users"> | null;
  canPublish: boolean;
  onView: (id: Id<"legalDocuments">) => void;
  onDraft: () => void;
}) {
  const submit = useMutation(api.legalDocuments.submitForApproval);
  const withdraw = useMutation(api.legalDocuments.withdrawDraft);
  const publish = useMutation(api.legalDocuments.publish);
  const { current, pending, versions } = entry;

  const [runSubmit, submitting] = useAction(async (id: Id<"legalDocuments">) => submit({ documentId: id }), {
    success: "Submitted for approval",
    successBody: "A different admin must publish it.",
  });
  const [runWithdraw, withdrawing] = useAction(async (id: Id<"legalDocuments">) => withdraw({ documentId: id }), { success: "Returned to draft" });
  const [runPublish, publishing] = useAction(async (id: Id<"legalDocuments">) => publish({ documentId: id }), {
    success: "Published",
    successBody: "The new version is live. The previous version is superseded and kept.",
  });

  const currentMeta = current ? versions.find((v) => v.id === current._id) : null;
  const ownPending = !!pending && !!viewerId && (pending.createdBy === viewerId || pending.submittedBy === viewerId);
  const publishBlocked = !canPublish
    ? "Publishing needs an admin with legal publishing rights."
    : ownPending
      ? "Four-eyes rule: you drafted or submitted this version, so a different admin must publish it."
      : null;

  return (
    <Card>
      <CardHeader
        title={
          <span className="row" style={{ gap: ".5rem" }}>
            {entry.title} <span className="mono xs">/legal/{entry.slug}</span>
          </span>
        }
        description={
          current ? (
            <>
              Live <b>v{current.version}</b> · published {formatDate(current.publishedAt, true)} by {current.publishedByName ?? "—"} ·{" "}
              {currentMeta?.consentsLinked ?? 0} consent{currentMeta?.consentsLinked === 1 ? "" : "s"} linked ·{" "}
              <span className="mono xs" title={current.contentHash}>
                SHA-256 {current.contentHash.slice(0, 12)}…
              </span>
            </>
          ) : (
            "No published version yet. Draft one, submit it, and have a second admin publish it."
          )
        }
        actions={
          <div className="b-row">
            {current && (
              <Button variant="ghost" size="s" icon="eye" onClick={() => onView(current._id)}>
                View
              </Button>
            )}
            <Button
              variant="out"
              size="s"
              icon={pending?.status === "draft" ? "edit" : "plus"}
              onClick={onDraft}
              disabled={pending?.status === "pending_approval"}
              title={pending?.status === "pending_approval" ? "A version is awaiting approval — publish or withdraw it first." : undefined}
            >
              {pending?.status === "draft" ? `Edit draft v${pending.version}` : "New version"}
            </Button>
          </div>
        }
      />
      {pending && (
        <CardBody>
          <div className="faq-item" style={{ background:pending.status === "pending_approval" ? "var(--blue-wash)" : "var(--amber-wash)", borderColor: "transparent" }}>
            <div className="row-b" style={{ gap: ".6rem" }}>
              <div>
                <div className="row" style={{ gap: ".4rem" }}>
                  <span className="strong">Version {pending.version}</span>
                  <StatusBadge status={pending.status} />
                </div>
                <p className="xs" style={{ marginTop: ".2rem" }}>
                  Drafted by {pending.createdByName} {timeAgo(pending.createdAt)}
                  {pending.submittedAt ? ` · submitted ${timeAgo(pending.submittedAt)}` : ""}
                </p>
              </div>
              <div className="b-row">
                <Button variant="ghost" size="s" onClick={() => onView(pending._id)}>
                  View
                </Button>
                {pending.status === "draft" ? (
                  <Button variant="navy" size="s" loading={submitting} onClick={() => void runSubmit(pending._id)}>
                    Submit for approval
                  </Button>
                ) : (
                  <>
                    <Button variant="out" size="s" loading={withdrawing} onClick={() => void runWithdraw(pending._id)}>
                      Withdraw
                    </Button>
                    <Button variant="green" size="s" loading={publishing} disabled={!!publishBlocked} title={publishBlocked ?? undefined} onClick={() => void runPublish(pending._id)}>
                      Publish v{pending.version}
                    </Button>
                  </>
                )}
              </div>
            </div>
            {pending.status === "pending_approval" && (
              <p className="xs" style={{ marginTop: ".5rem", color: publishBlocked ? "var(--red)" : undefined }}>
                {publishBlocked ?? "You did not draft or submit this version, so you can approve and publish it."}
              </p>
            )}
          </div>
        </CardBody>
      )}

      <DataTable
        flush
        caption={`${entry.title} version history`}
        isEmpty={versions.length === 0}
        empty={null}
        columns={[{ label: "Version" }, { label: "Status" }, { label: "Drafted" }, { label: "Published" }, { label: "Consents linked", align: "right" }, { label: "Actions", align: "right", srOnly: true }]}
      >
        {versions.map((v) => (
          <tr key={v.id}>
            <td className="strong">v{v.version}</td>
            <td>
              <StatusBadge status={v.status} />
            </td>
            <td className="sm">
              {formatDate(v.createdAt)}
              <span className="tsub">{v.createdByName}</span>
            </td>
            <td className="sm">
              {v.publishedAt ? formatDate(v.publishedAt) : "—"}
              {v.publishedByName && <span className="tsub">{v.publishedByName}</span>}
            </td>
            <td className="tr">{v.consentsLinked || "—"}</td>
            <td className="tr">
              <Button variant="ghost" size="xs" onClick={() => onView(v.id)} aria-label={`View version ${v.version}`}>
                View
              </Button>
            </td>
          </tr>
        ))}
      </DataTable>
    </Card>
  );
}
