"use client";

import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Alert, LoadingBlock } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/domain/format";
import { useAction } from "@/hooks/useAction";

export type LegalDocType = Doc<"legalDocuments">["docType"];

/** Prototype `legalModal` / `consentModal`: the exact stored text of one version. */
export function LegalViewModal({ documentId, onClose, onNewVersion }: { documentId: Id<"legalDocuments">; onClose: () => void; onNewVersion?: () => void }) {
  const doc = useQuery(api.legalDocuments.get, { documentId });
  const subtitle = !doc
    ? "Loading…"
    : doc.status === "published"
      ? `Published ${formatDate(doc.publishedAt, true)} by ${doc.publishedByName ?? "—"}. Locked — superseded only by a new version.`
      : doc.status === "superseded"
        ? `Published ${formatDate(doc.publishedAt)} by ${doc.publishedByName ?? "—"} · superseded ${formatDate(doc.supersededAt)}`
        : `Drafted ${formatDate(doc.createdAt, true)} by ${doc.createdByName}`;
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={doc ? `${doc.title} — version ${doc.version}` : "Legal document"}
      subtitle={subtitle}
      footer={
        <>
          <Button variant={onNewVersion ? "out" : "navy"} size="s" onClick={onClose}>
            Close
          </Button>
          {onNewVersion && (
            <Button variant="navy" size="s" onClick={onNewVersion}>
              Create new version
            </Button>
          )}
        </>
      }
    >
      {doc === undefined ? (
        <LoadingBlock rows={6} label="Loading document" />
      ) : doc === null ? (
        <p className="sm">This version could not be found.</p>
      ) : (
        <>
          <div className="row" style={{ marginBottom: ".75rem" }}>
            <StatusBadge status={doc.status} />
            <span className="xs mono" title={doc.contentHash}>
              SHA-256 {doc.contentHash.slice(0, 16)}…
            </span>
          </div>
          <div className="legal-text">{doc.content}</div>
          {doc.docType === "consumer_consent" && (
            <div style={{ marginTop: "1rem" }}>
              <Alert kind="i">
                Every consent record stores the version, a hash of this exact text, the timestamp, IP address, user agent and page URL. That bundle is what defends
                a TCPA complaint — and why this document is versioned rather than edited.
              </Alert>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/** Draft a new version (or keep editing the open draft). Nothing changes publicly until a second admin publishes. */
export function LegalDraftModal({
  docType,
  title,
  initialContent,
  draftVersion,
  nextVersion,
  onClose,
}: {
  docType: LegalDocType;
  title: string;
  initialContent: string;
  draftVersion: number | null;
  nextVersion: number;
  onClose: () => void;
}) {
  const createDraft = useMutation(api.legalDocuments.createDraft);
  const [content, setContent] = useState(initialContent);
  const [submitted, setSubmitted] = useState(false);
  const error = content.trim().length < 20 ? "The document text is too short (at least 20 characters)." : content.trim() === initialContent.trim() && draftVersion == null ? "Change the text before saving a new version." : null;
  const version = draftVersion ?? nextVersion;

  const [save, saving] = useAction(
    async () => {
      await createDraft({ docType, content });
      return true;
    },
    { success: `Draft v${version} saved`, successBody: "Submit it for approval when ready. A different admin publishes it." },
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (error) return;
    if (await save()) onClose();
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={draftVersion != null ? `${title} — edit draft v${draftVersion}` : `${title} — new version`}
      subtitle={`Saves draft v${version}. The published version stays live until a different admin publishes this one.`}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="navy" size="s" type="submit" form="legal-draft-form" loading={saving}>
            Save draft
          </Button>
        </>
      }
    >
      <form id="legal-draft-form" onSubmit={onSubmit} noValidate>
        <Field label="Full text" required error={submitted ? error : null} help={`${content.trim().length.toLocaleString()} characters. The exact text is hashed (SHA-256) when saved.`}>
          <textarea value={content} rows={16} style={{ minHeight: 320, fontSize: ".86rem", lineHeight: 1.7 }} onChange={(e) => setContent(e.target.value)} />
        </Field>
        {docType === "consumer_consent" ? (
          <Alert kind="w">
            <b>Consumer consent wording.</b> Once published, the request wizard shows the new text and new consent records link to it. Existing consent records keep
            pointing at the version each consumer agreed to. Have counsel review the wording before submitting.
          </Alert>
        ) : (
          <Alert kind="i">Published versions are never edited, deleted or rolled back. A correction is always a new, superseding version.</Alert>
        )}
      </form>
    </Modal>
  );
}
