"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { api } from "@convex/_generated/api";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, DefinitionList } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { Field, Select } from "@/components/ui/Form";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { LoadMore, Segmented } from "@/components/ui/Navigation";
import { formatDate, timeAgo } from "@/domain/format";
import { useAction } from "@/hooks/useAction";

// ─────────────────────────── compliance ───────────────────────────

function withCurrent(values: number[], current: number) {
  return [...new Set([...values, current])].sort((a, b) => a - b);
}

function RetentionForm({ canManage }: { canManage: boolean }) {
  const retention = useQuery(api.adminSettingsViews.retention);
  if (retention === undefined) return <LoadingBlock rows={3} label="Loading retention settings" />;
  return <RetentionFields key={retention.updatedAt ?? "default"} retention={retention} canManage={canManage} />;
}

function RetentionFields({
  retention,
  canManage,
}: {
  retention: { consentArtifactYears: number; leadPiiMonthsAfterClosure: number; leadVisibilityDaysAfterClosure: number; updatedAt: number | null; updatedByName: string | null };
  canManage: boolean;
}) {
  const updateRetention = useMutation(api.adminSettingsViews.updateRetention);
  const [years, setYears] = useState(retention.consentArtifactYears);
  const [piiMonths, setPiiMonths] = useState(retention.leadPiiMonthsAfterClosure);
  const [visibilityDays, setVisibilityDays] = useState(retention.leadVisibilityDaysAfterClosure);
  const dirty =
    years !== retention.consentArtifactYears || piiMonths !== retention.leadPiiMonthsAfterClosure || visibilityDays !== retention.leadVisibilityDaysAfterClosure;
  const [save, saving] = useAction(
    async () => {
      await updateRetention({ consentArtifactYears: years, leadPiiMonthsAfterClosure: piiMonths, leadVisibilityDaysAfterClosure: visibilityDays });
      return true;
    },
    { success: "Retention settings saved", successBody: "Recorded in the audit log." },
  );
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (dirty) void save();
  };

  return (
    <form onSubmit={onSubmit}>
      <Field label="Consent artefacts" help="TCPA statute of limitations is 4 years. Confirm with counsel. Consent records are never deleted automatically.">
        <Select
          value={years}
          disabled={!canManage}
          onChange={(e) => setYears(Number(e.target.value))}
          options={withCurrent([5, 7, 10], years).map((y) => ({ value: y, label: `${y} years${y === 5 ? " (recommended)" : ""}` }))}
        />
      </Field>
      <Field label="Lead PII after closure" help="PII is nulled; the record and its financial linkage stay.">
        <Select
          value={piiMonths}
          disabled={!canManage}
          onChange={(e) => setPiiMonths(Number(e.target.value))}
          options={withCurrent([24, 36, 48, 60], piiMonths).map((m) => ({ value: m, label: `${m} months` }))}
        />
      </Field>
      <Field label="Lead visibility after cancellation" help="How long a closed account can still read its leads.">
        <Select
          value={visibilityDays}
          disabled={!canManage}
          onChange={(e) => setVisibilityDays(Number(e.target.value))}
          options={withCurrent([60, 90, 180], visibilityDays).map((d) => ({ value: d, label: `${d} days` }))}
        />
      </Field>
      <div className="row-b">
        <span className="xs">
          {retention.updatedAt ? `Last changed ${formatDate(retention.updatedAt)}${retention.updatedByName ? ` by ${retention.updatedByName}` : ""}` : "Default values"}
        </span>
        {canManage ? (
          <Button variant="navy" size="s" type="submit" loading={saving} disabled={!dirty}>
            Save retention
          </Button>
        ) : (
          <span className="xs">Read-only for your role</span>
        )}
      </div>
    </form>
  );
}

export function SettingsCompliance({ canManage }: { canManage: boolean }) {
  const consent = useQuery(api.legalDocuments.published, { docType: "consumer_consent" });
  const [viewing, setViewing] = useState(false);

  return (
    <>
      <div className="g g2" style={{ alignItems: "start" }}>
        <Card>
          <CardHeader title="Consent capture" />
          <CardBody>
            {consent === undefined ? (
              <LoadingBlock rows={4} label="Loading consent version" />
            ) : (
              <>
                <DefinitionList
                  items={[
                    ["Live version", consent ? `Consumer consent v${consent.version}` : <Badge key="n" tone="r">None published</Badge>],
                    consent && ["Published", formatDate(consent.publishedAt)],
                    consent && ["Hash", <span key="h" className="mono xs" title={consent.contentHash}>{consent.contentHash.slice(0, 20)}…</span>],
                    ["Captured with", "Text version, hash, timestamp, IP, user agent, page URL"],
                    ["Missing consent", <Badge key="m" tone="r">Hard reject — no override</Badge>],
                  ]}
                />
                <div className="b-row" style={{ marginTop: ".9rem" }}>
                  <Button variant="out" size="s" disabled={!consent} onClick={() => setViewing(true)}>
                    View the live wording
                  </Button>
                  <Link className="link sm" href="/admin/legal">
                    Manage versions
                  </Link>
                </div>
                {!consent && (
                  <div style={{ marginTop: ".9rem" }}>
                    <Alert kind="e">No consumer consent version is published, so the request wizard cannot accept submissions.</Alert>
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Retention" />
          <CardBody>
            <RetentionForm canManage={canManage} />
          </CardBody>
        </Card>
      </div>
      {viewing && consent && (
        <Modal
          open
          wide
          onClose={() => setViewing(false)}
          title={`Consumer consent — version ${consent.version}`}
          subtitle={`Published ${formatDate(consent.publishedAt)}. Locked and superseded only by a new version.`}
          footer={
            <Button variant="navy" size="s" onClick={() => setViewing(false)}>
              Close
            </Button>
          }
        >
          <div className="legal-text">{consent.content}</div>
          <div style={{ marginTop: "1rem" }}>
            <Alert kind="i">
              Every consent record stores the version, a hash of this exact text, the timestamp, IP address, user agent and page URL. That bundle is what defends a
              TCPA complaint — and why this document is versioned rather than edited.
            </Alert>
          </div>
        </Modal>
      )}
    </>
  );
}

// ─────────────────────────── integrations ───────────────────────────

type Tone = "connected" | "bypass" | "missing" | "phase2";

const TONE_BADGE: Record<Tone, { tone: "g" | "gold" | "a" | "n"; label: string }> = {
  connected: { tone: "g", label: "Connected" },
  bypass: { tone: "gold", label: "Bypass" },
  missing: { tone: "a", label: "Not configured" },
  phase2: { tone: "n", label: "Phase 2" },
};

function IntegrationCard({ title, provider, detail, icon, state, envs }: { title: string; provider: string; detail: string; icon: IconName; state: Tone; envs: string[] }) {
  const badge = TONE_BADGE[state];
  return (
    <Card>
      <CardBody>
        <div className="row-b" style={{ alignItems: "flex-start" }}>
          <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start", minWidth: 0, flex: "1 1 320px" }}>
            <div className="iconbox" style={{ background: "var(--soft-2)" }}>
              <Icon name={icon} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="strong">{title}</div>
              <div className="sm">
                {provider} — {detail}
              </div>
              {envs.length > 0 && (
                <div className="envs" style={{ marginTop: ".45rem" }} aria-label="Environment variables">
                  {envs.map((e) => (
                    <code key={e}>{e}</code>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Badge tone={badge.tone} dot>
            {badge.label}
          </Badge>
        </div>
      </CardBody>
    </Card>
  );
}

export function SettingsIntegrations() {
  const status = useQuery(api.reports.integrations);
  if (status === undefined) return <LoadingBlock rows={6} label="Loading integration status" />;

  const payments: Tone = status.payments.mode === "stripe" ? "connected" : "bypass";
  const email: Tone = status.email.mode === "postmark" ? "connected" : "bypass";
  const sms: Tone = status.sms.mode === "twilio" ? "connected" : "bypass";

  return (
    <div className="stack">
      <Alert kind="i">
        Credentials live in the Convex deployment environment (<span className="mono">npx convex env set</span>) and the hosting provider — never in the database or
        this screen. Each integration runs in a clearly labelled <b>bypass</b> mode until its keys are added.
      </Alert>
      <IntegrationCard
        title="Payment gateway"
        provider="Stripe"
        icon="card"
        state={payments}
        detail={
          payments === "connected"
            ? `Authorise-then-capture enabled · webhook ${status.payments.webhookConfigured ? "signature verified" : "secret missing — payments will not confirm"}`
            : `Test payments (bypass) — no card is charged${status.production ? (status.payments.bypassAllowed ? " · bypass explicitly allowed in production" : " · refused in production") : ""}`
        }
        envs={payments === "connected" && status.payments.webhookConfigured ? [] : ["PAYMENTS_PROVIDER=stripe", "STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]}
      />
      <IntegrationCard
        title="Transactional email"
        provider="Postmark"
        icon="mail"
        state={email}
        detail={email === "connected" ? `Sending as ${status.email.fromAddress ?? "the default sender"}` : "Console bypass — emails are logged, not delivered. See the Messages tab."}
        envs={email === "connected" ? [] : ["EMAIL_PROVIDER=postmark", "POSTMARK_SERVER_TOKEN", "EMAIL_FROM"]}
      />
      <IntegrationCard
        title="SMS"
        provider="Twilio"
        icon="phone"
        state={sms}
        detail={sms === "connected" ? `Sending from ${status.sms.from ?? "the messaging service"} · STOP replies stop contact immediately` : status.production ? "Console bypass — texts are logged, not delivered. Inbound STOP replies are refused until Twilio is configured." : "Console bypass — texts are logged, not delivered. Inbound STOP signature checks are skipped in development."}
        envs={sms === "connected" ? [] : ["SMS_PROVIDER=twilio", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID"]}
      />
      <IntegrationCard
        title="Meta Lead Ads"
        provider="Facebook / Instagram"
        icon="mega"
        state={status.meta.configured ? "connected" : "missing"}
        detail={
          status.meta.configured
            ? `Webhook signature verified${status.meta.graphToken ? " · lead details fetched with the page token" : " · page access token missing"}`
            : "Webhook at /meta/leads refuses events until configured"
        }
        envs={status.meta.configured && status.meta.graphToken ? [] : ["META_APP_SECRET", "META_VERIFY_TOKEN", "META_PAGE_ACCESS_TOKEN"]}
      />
      <IntegrationCard
        title="Partner API"
        provider="Signed HTTP"
        icon="flow"
        state={status.partnerApi.configured ? "connected" : "missing"}
        detail={status.partnerApi.configured ? "POST /partner/leads · HMAC-SHA256 signature, 5-minute replay window" : "POST /partner/leads refuses requests until a signing secret is set"}
        envs={status.partnerApi.configured ? [] : ["PARTNER_API_SIGNING_SECRET"]}
      />
      <IntegrationCard
        title="Website intake"
        provider="Next.js → Convex"
        icon="target"
        state={status.intake.configured ? "connected" : "missing"}
        detail={
          status.intake.configured
            ? "Request and contact forms authenticate to Convex with a shared secret"
            : status.production
              ? "Consumer requests are refused until the shared secret is set on both sides"
              : "No shared secret — accepted in development only; production refuses requests without it"
        }
        envs={status.intake.configured ? [] : ["INTAKE_SHARED_SECRET (Next.js and Convex)"]}
      />
      <IntegrationCard
        title="Licence registry (NIPR)"
        provider="National Insurance Producer Registry"
        icon="badge"
        state="phase2"
        detail="Phase 2. Licence verification is a manual review in admin until then."
        envs={[]}
      />
      <Card>
        <CardHeader title="Deployment" />
        <CardBody>
          <DefinitionList
            items={[
              ["Environment", status.production ? <Badge key="p" tone="navy">Production</Badge> : <Badge key="d" tone="n">Development</Badge>],
              ["Staff two-factor", status.staffMfaRequired ? <Badge key="m" tone="g">Required</Badge> : <Badge key="m" tone="a">Not enforced</Badge>],
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

// ─────────────────────────── messages ───────────────────────────

type MessageFilter = "all" | "sent" | "bypassed" | "failed";

export function SettingsMessages({ filter, onFilter }: { filter: MessageFilter; onFilter: (value: MessageFilter) => void }) {
  const { results, status, loadMore } = usePaginatedQuery(api.notifications.outboundLog, filter === "all" ? {} : { status: filter }, { initialNumItems: 30 });

  return (
    <>
      <div className="row-b" style={{ marginBottom: "1rem" }}>
        <p className="sm">Every email and SMS the platform sends, including bypassed sends while providers are not configured.</p>
        <Segmented
          label="Delivery status"
          value={filter}
          onChange={onFilter}
          options={[
            { value: "all", label: "All" },
            { value: "sent", label: "Sent" },
            { value: "bypassed", label: "Bypassed" },
            { value: "failed", label: "Failed" },
          ]}
        />
      </div>
      {status === "LoadingFirstPage" ? (
        <LoadingBlock rows={6} label="Loading messages" />
      ) : (
        <DataTable
          caption="Outbound messages"
          isEmpty={results.length === 0}
          empty={
            <EmptyState icon="mail" title={filter === "all" ? "No messages sent yet" : `No ${filter} messages`}>
              Receipts, notices and alerts appear here as they are sent.
            </EmptyState>
          }
          columns={[{ label: "When" }, { label: "Channel" }, { label: "Message" }, { label: "To" }, { label: "Status" }, { label: "Provider" }]}
          footer={<LoadMore status={status} onLoadMore={() => loadMore(30)} count={results.length} />}
        >
          {results.map((m) => (
            <tr key={m._id}>
              <td className="sm nowrap">
                {timeAgo(m.createdAt)}
                <span className="tsub">{formatDate(m.createdAt, true)}</span>
              </td>
              <td>{m.channel === "email" ? <Badge tone="b">Email</Badge> : <Badge tone="navy">SMS</Badge>}</td>
              <td className="sm" style={{ maxWidth: 360 }}>
                <span className="strong" style={{ color: "var(--ink)" }}>
                  {m.subject ?? m.template.replace(/_/g, " ")}
                </span>
                {m.bodyPreview && (
                  <span className="tsub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.bodyPreview}
                  </span>
                )}
              </td>
              <td className="sm" style={{ overflowWrap: "anywhere" }}>
                {m.to}
              </td>
              <td>
                <StatusBadge status={m.status} />
                {m.error && (
                  <span className="tsub" style={{ color: "var(--red)" }}>
                    {m.error}
                  </span>
                )}
              </td>
              <td className="sm">
                {m.provider}
                <span className="tsub mono">{m.template}</span>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
