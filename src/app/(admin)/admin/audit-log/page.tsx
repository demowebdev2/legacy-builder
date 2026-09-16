"use client";

import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { api } from "@convex/_generated/api";
import { ago, prettyJson } from "@/components/admin/format";
import { useNow, useSearchParamState } from "@/components/admin/hooks";
import { PageHeader } from "@/components/layouts/PortalShell";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock, PageLoading } from "@/components/ui/Feedback";
import { LoadMore } from "@/components/ui/Navigation";
import { formatDate } from "@/domain/format";

const ENTITY_TYPES = [
  "lead",
  "account",
  "order",
  "dispute",
  "leadAssignment",
  "suppression",
  "distributionSettings",
  "distribution",
  "license",
  "eoPolicy",
  "tpmoApproval",
  "ledgerEntry",
  "pricingVersion",
  "bundle",
  "legalDocument",
  "cmsPage",
  "faq",
  "media",
  "user",
  "staffInvitation",
  "agencyMember",
  "supportTicket",
];

const KNOWN_ACTIONS = [
  "lead.captured",
  "lead.pii_view",
  "lead.raw_payload_view",
  "lead.requeue",
  "lead.edit",
  "lead.unassignable",
  "assignment.revoke",
  "assignment.handout",
  "consent.withdrawn",
  "dispute.submit",
  "dispute.uphold",
  "dispute.auto_uphold",
  "dispute.reject",
  "distribution.settings",
  "distribution.release_queue",
  "suppression.add",
  "suppression.lift",
  "account.approve",
  "ledger.adjust",
  "ledger.reverse",
  "order.paid",
  "order.failed",
  "order.refund",
  "pricing.update",
  "legal.publish",
  "staff.role_change",
];

function entityHref(type: string, id: string): string | null {
  switch (type) {
    case "lead":
      return `/admin/leads/${id}`;
    case "account":
      return `/admin/accounts/${id}`;
    case "order":
      return `/admin/purchases/${id}`;
    case "dispute":
      return `/admin/disputes/${id}`;
    case "distributionSettings":
    case "distribution":
      return "/admin/distribution";
    case "suppression":
      return "/admin/suppression";
    default:
      return null;
  }
}

export default function AuditLogPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <RequirePermission permission="audit.read" title="Audit log">
        <AuditLogView />
      </RequirePermission>
    </Suspense>
  );
}

function AuditLogView() {
  const now = useNow();
  const [params, setParams] = useSearchParamState();
  const action = params.get("action") ?? "";
  const entityType = params.get("entityType") ?? "";
  const entityId = params.get("entityId") ?? "";
  const [actionInput, setActionInput] = useState(action);
  const [typeInput, setTypeInput] = useState(entityType);
  const [idInput, setIdInput] = useState(entityId);

  const entityFilter = !!(entityType && entityId);
  const { results, status, loadMore } = usePaginatedQuery(
    api.audit.list,
    entityFilter ? { entityType, entityId } : action ? { action } : {},
    { initialNumItems: 40 },
  );

  const apply = () => setParams({ action: actionInput.trim() || null, entityType: typeInput || null, entityId: idInput.trim() || null });
  const clear = () => {
    setActionInput("");
    setTypeInput("");
    setIdInput("");
    setParams({ action: null, entityType: null, entityId: null });
  };
  const filterByEntity = (type: string, id: string) => {
    setTypeInput(type);
    setIdInput(id);
    setActionInput("");
    setParams({ action: null, entityType: type, entityId: id });
  };
  const anyFilter = !!(action || entityType || entityId);

  return (
    <>
      <PageHeader title="Audit log" />
      <Alert kind="n">
        <b>Append-only.</b> Every sensitive write — and every staff view of consumer contact details or raw payloads — is recorded here in the same
        transaction as the change. There is no edit or delete, not even for administrators.
      </Alert>
      <div style={{ height: "1.25rem" }} />

      <form
        className="fb"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <input
          aria-label="Action"
          list="audit-actions"
          placeholder="Action, e.g. lead.pii_view"
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
          style={{ minWidth: 200 }}
        />
        <datalist id="audit-actions">
          {KNOWN_ACTIONS.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <select aria-label="Entity type" value={typeInput} onChange={(e) => setTypeInput(e.target.value)}>
          <option value="">Any entity</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input aria-label="Entity id" placeholder="Entity id" value={idInput} onChange={(e) => setIdInput(e.target.value)} style={{ minWidth: 180 }} />
        <Button variant="navy" size="s" type="submit" icon="filter">
          Apply
        </Button>
        {anyFilter && (
          <Button variant="ghost" size="s" onClick={clear}>
            Clear
          </Button>
        )}
        <div className="spacer" />
        <span className="xs">{status === "LoadingFirstPage" ? "Loading…" : `${results.length} shown`}</span>
      </form>
      {(entityType && !entityId) || (!entityType && entityId) ? (
        <p className="xs" style={{ margin: "-.4rem 0 .8rem", color: "var(--red)" }}>
          Choose both an entity type and an id to see one record&rsquo;s history.
        </p>
      ) : entityFilter && action ? (
        <p className="xs" style={{ margin: "-.4rem 0 .8rem" }}>
          Showing the full history of this {entityType}; the action filter applies only without an entity.
        </p>
      ) : action ? (
        <p className="xs" style={{ margin: "-.4rem 0 .8rem" }}>
          Actions match exactly.
        </p>
      ) : null}

      {status === "LoadingFirstPage" ? (
        <LoadingBlock rows={10} label="Loading audit events" />
      ) : (
        <DataTable
          caption="Audit events"
          columns={[{ label: "When" }, { label: "Actor" }, { label: "Action" }, { label: "Entity" }, { label: "Summary" }]}
          isEmpty={results.length === 0}
          empty={
            <EmptyState icon="eye" title={anyFilter ? "No matching events" : "No events yet"}>
              {anyFilter ? "Nothing in the log matches these filters. Actions must match exactly, e.g. assignment.revoke." : "Audited actions appear here as they happen."}
            </EmptyState>
          }
          footer={<LoadMore status={status} count={results.length} onLoadMore={() => loadMore(40)} />}
        >
          {results.map((e) => {
            const href = entityHref(e.entityType, e.entityId);
            return (
              <tr key={e._id}>
                <td className="sm nowrap">
                  {formatDate(e.createdAt, true)}
                  <span className="tsub">{ago(e.createdAt, now)}</span>
                </td>
                <td>
                  <span className="nm">{e.actorName}</span>
                  <span className="tsub">{e.actorRole === "SYSTEM" ? "System" : e.actorRole.charAt(0) + e.actorRole.slice(1).toLowerCase()}</span>
                </td>
                <td>
                  <button type="button" className="mono xs link" style={{ whiteSpace: "nowrap" }} onClick={() => {
                    setActionInput(e.action);
                    setTypeInput("");
                    setIdInput("");
                    setParams({ action: e.action, entityType: null, entityId: null });
                  }} title="Show only this action">
                    {e.action}
                  </button>
                </td>
                <td className="sm">
                  {href ? (
                    <Link className="link" href={href}>
                      {e.entityType}
                    </Link>
                  ) : (
                    <Badge tone="n">{e.entityType}</Badge>
                  )}
                  <span className="tsub mono" title={e.entityId}>
                    {e.entityId.length > 14 ? `…${e.entityId.slice(-8)}` : e.entityId}{" "}
                    <button type="button" className="link xs" onClick={() => filterByEntity(e.entityType, e.entityId)}>
                      history
                    </button>
                  </span>
                  {e.accountId && e.entityType !== "account" && (
                    <span className="tsub">
                      <Link className="link" href={`/admin/accounts/${e.accountId}`}>
                        account
                      </Link>
                    </span>
                  )}
                </td>
                <td className="sm" style={{ minWidth: 260, maxWidth: 480 }}>
                  {e.summary}
                  {e.metadata != null && (
                    <details style={{ marginTop: ".3rem" }}>
                      <summary className="xs link" style={{ display: "inline", cursor: "pointer" }}>
                        Metadata
                      </summary>
                      <pre
                        className="mono"
                        style={{
                          marginTop: ".4rem",
                          background: "var(--soft)",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--r-s)",
                          padding: ".6rem",
                          fontSize: ".72rem",
                          overflowX: "auto",
                          maxWidth: 460,
                          maxHeight: 280,
                        }}
                      >
                        {prettyJson(e.metadata)}
                      </pre>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
