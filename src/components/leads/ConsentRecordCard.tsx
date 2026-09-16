"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DefinitionList } from "@/components/ui/Display";
import { Alert } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/domain/format";

export interface ConsentView {
  versionLabel: string;
  agreedAt: number;
  ipAddress?: string | null;
  pageUrl?: string | null;
  userAgent?: string | null;
  contentHash: string;
  method: string;
  wording?: string | null;
  wordingTitle?: string | null;
  publishedAt?: number | null;
}

const METHOD_LABELS: Record<string, string> = {
  web_form: "Website form",
  meta_lead_form: "Meta lead form",
  partner_api: "Partner API",
  admin_manual: "Manual entry by staff",
};

/** Prototype "Consent record" card + "View the exact wording" modal (shared by agent and admin lead detail). */
export function ConsentRecordCard({ consent, intro = true }: { consent: ConsentView | null; intro?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!consent) {
    return (
      <Card>
        <CardHeader title="Consent record" actions={<Badge tone="r">Missing</Badge>} />
        <CardBody>
          <Alert kind="e">No consent record is linked to this lead. It must not be contacted.</Alert>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader
        title="Consent record"
        actions={
          <Badge tone="g" dot>
            Captured
          </Badge>
        }
      />
      <CardBody>
        {intro && (
          <p className="sm" style={{ marginBottom: ".8rem" }}>
            This is the evidence that defends the call. It is stored immutably and linked to the exact published wording the consumer agreed to.
          </p>
        )}
        <DefinitionList
          items={[
            ["Version", consent.versionLabel],
            ["Agreed at", formatDate(consent.agreedAt, true)],
            ["Captured via", METHOD_LABELS[consent.method] ?? consent.method],
            consent.ipAddress ? ["IP address", <span key="ip" className="mono">{consent.ipAddress}</span>] : null,
            consent.pageUrl ? ["Page URL", <span key="url" className="mono" style={{ wordBreak: "break-all" }}>{consent.pageUrl}</span>] : null,
            consent.userAgent ? ["User agent", <span key="ua" className="xs">{consent.userAgent}</span>] : null,
            ["Text hash", <span key="hash" className="mono xs" style={{ wordBreak: "break-all" }}>{consent.contentHash}</span>],
          ]}
        />
        <Button variant="out" size="s" style={{ marginTop: ".9rem" }} onClick={() => setOpen(true)} disabled={!consent.wording}>
          View the exact wording
        </Button>
      </CardBody>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={consent.wordingTitle ?? consent.versionLabel}
        subtitle={consent.publishedAt ? `Published ${formatDate(consent.publishedAt)}. Locked and superseded only by a new version.` : undefined}
        footer={
          <Button variant="navy" size="s" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        <div style={{ background: "var(--soft)", border: "1px solid var(--line)", borderRadius: "var(--r-s)", padding: "1rem", fontSize: ".88rem", lineHeight: 1.75 }}>
          {consent.wording}
        </div>
        <div style={{ marginTop: "1rem" }}>
          <Alert kind="i">
            Every consent record stores the version, a hash of this exact text, the timestamp, IP address, user agent and page URL. That bundle is what
            defends a TCPA complaint — and why this document is versioned rather than edited.
          </Alert>
        </div>
      </Modal>
    </Card>
  );
}
