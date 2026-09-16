"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { ago, SUPPRESSION_REASON_LABELS } from "@/components/admin/format";
import { useDebounced, useNow, useSearchParamState, useStaff } from "@/components/admin/hooks";
import { PageHeader } from "@/components/layouts/PortalShell";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock, PageLoading } from "@/components/ui/Feedback";
import { Field, Select, Switch } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { LoadMore } from "@/components/ui/Navigation";
import { useToast } from "@/components/ui/Toast";
import { formatDate } from "@/domain/format";
import { maskEmail, maskPhone } from "@/domain/normalize";

type Entry = Doc<"suppressionEntries">;

export default function SuppressionPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <RequirePermission permission="suppression.read" title="Suppression register">
        <SuppressionView />
      </RequirePermission>
    </Suspense>
  );
}

function SuppressionView() {
  const { can } = useStaff();
  const now = useNow();
  const [params, setParams] = useSearchParamState();
  const activeOnly = params.get("active") !== "0";
  const urlSearch = params.get("q") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounced(search.trim(), 400);
  const lastPushed = useRef(debounced);
  useEffect(() => {
    if (debounced === lastPushed.current) return;
    lastPushed.current = debounced;
    setParams({ q: debounced || null });
  }, [debounced, setParams]);

  const { results, status, loadMore } = usePaginatedQuery(
    api.suppression.list,
    { search: urlSearch || undefined, activeOnly },
    { initialNumItems: 30 },
  );
  // A contact search returns every entry for that exact phone/email; honour the toggle client-side.
  const rows = urlSearch && activeOnly ? results.filter((r) => r.active) : results;
  const [adding, setAdding] = useState(false);
  const [lifting, setLifting] = useState<Entry | null>(null);
  const manage = can("suppression.manage");

  return (
    <>
      <PageHeader
        title="Suppression register"
        actions={
          manage ? (
            <Button variant="navy" size="s" icon="plus" onClick={() => setAdding(true)}>
              Add entry
            </Button>
          ) : undefined
        }
      />
      <Alert kind="n">
        The register is checked when a lead is captured and again inside every assignment. A suppressed phone or email is never released to an agent.
        Entries are <b>never deleted</b> — lifting one keeps its full history and is written to the audit log.
      </Alert>
      <div style={{ height: "1.25rem" }} />

      <div className="fb" role="search">
        <div className="search">
          <Icon name="search" />
          <input type="search" aria-label="Search by phone or email" placeholder="Exact phone or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Switch checked={activeOnly} onChange={(v) => setParams({ active: v ? null : "0" })} label="Active entries only" />
        <div className="spacer" />
        <span className="xs">{status === "LoadingFirstPage" ? "Loading…" : `${rows.length} shown`}</span>
      </div>

      {status === "LoadingFirstPage" ? (
        <LoadingBlock rows={6} label="Loading suppression entries" />
      ) : (
        <DataTable
          caption="Suppression entries"
          columns={[
            { label: "Channel" },
            { label: "Contact" },
            { label: "Reason" },
            { label: "Lead" },
            { label: "Added" },
            { label: "Status" },
            { label: "Actions", align: "right", srOnly: true },
          ]}
          isEmpty={rows.length === 0}
          empty={
            <EmptyState icon="ban" title={urlSearch ? "Not on the register" : "No entries"}>
              {urlSearch
                ? "That phone number or email is not suppressed. Search uses the exact contact — enter the full number or address."
                : activeOnly
                  ? "No contact is currently suppressed."
                  : "Nothing has ever been added to the register."}
            </EmptyState>
          }
          footer={urlSearch ? undefined : <LoadMore status={status} count={results.length} onLoadMore={() => loadMore(30)} />}
        >
          {rows.map((e) => (
            <tr key={e._id}>
              <td>
                <Badge tone="n">
                  <Icon name={e.channel === "phone" ? "phone" : "mail"} size={12} />
                  {e.channel === "phone" ? "Phone" : "Email"}
                </Badge>
              </td>
              <td className="mono sm nowrap">{e.channel === "phone" ? maskPhone(e.value) : maskEmail(e.value)}</td>
              <td className="sm" style={{ maxWidth: 280 }}>
                {SUPPRESSION_REASON_LABELS[e.reason] ?? e.reason}
                {e.note && <span className="tsub">{e.note}</span>}
              </td>
              <td className="sm">
                {e.leadId ? (
                  <Link className="link" href={`/admin/leads/${e.leadId}`}>
                    View lead
                  </Link>
                ) : (
                  <span className="xs">—</span>
                )}
              </td>
              <td className="sm nowrap">
                {formatDate(e.createdAt)}
                <span className="tsub">{ago(e.createdAt, now)}</span>
              </td>
              <td style={{ maxWidth: 260 }}>
                {e.active ? (
                  <Badge tone="r" dot>
                    Suppressed
                  </Badge>
                ) : (
                  <>
                    <StatusBadge status="lifted" />
                    <span className="tsub">
                      {formatDate(e.liftedAt)}
                      {e.liftReason ? ` — ${e.liftReason}` : ""}
                    </span>
                  </>
                )}
              </td>
              <td className="tr">
                {e.active && manage && (
                  <Button variant="ghost" size="xs" onClick={() => setLifting(e)}>
                    Lift
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {adding && <AddSuppressionModal onClose={() => setAdding(false)} />}
      {lifting && <LiftSuppressionModal entry={lifting} onClose={() => setLifting(null)} />}
    </>
  );
}

function AddSuppressionModal({ onClose }: { onClose: () => void }) {
  const add = useMutation(api.suppression.add);
  const toast = useToast();
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState<"admin" | "complaint">("admin");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ contact?: string; note?: string }>({});
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const e: typeof errors = {};
    if (!contact.trim()) e.contact = "Enter a US phone number or an email address.";
    if (note.trim().length < 5) e.note = "A note is required (at least 5 characters).";
    setErrors(e);
    if (Object.keys(e).length) return;
    setPending(true);
    try {
      await add({ contact: contact.trim(), reason, note: note.trim() });
      toast.success("Contact suppressed", "It will not be released to any agent from now on.");
      onClose();
    } catch (err) {
      toast.error(err, "Could not add to the register");
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add to the suppression register"
      subtitle="Blocks this phone number or email from being released to any agent"
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="red" size="s" onClick={() => void submit()} loading={pending}>
            Suppress contact
          </Button>
        </>
      }
    >
      <Field label="Phone or email" required error={errors.contact} help="US numbers in any format, e.g. (404) 555-0177.">
        <input value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="Reason" required>
        <Select
          value={reason}
          onChange={(e) => setReason(e.target.value as "admin" | "complaint")}
          options={[
            { value: "admin", label: "Staff entry — do-not-contact request" },
            { value: "complaint", label: "Complaint" },
          ]}
        />
      </Field>
      <Field label="Note" required error={errors.note} help="Where the request came from. Recorded with the entry and in the audit log.">
        <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Alert kind="i">
        To withdraw consent for a specific lead — which also tells current holders to cease contact — use <b>Suppress / withdraw consent</b> on the lead
        page.
      </Alert>
    </Modal>
  );
}

function LiftSuppressionModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const lift = useMutation(api.suppression.lift);
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const masked = entry.channel === "phone" ? maskPhone(entry.value) : maskEmail(entry.value);

  const submit = async () => {
    if (reason.trim().length < 10) {
      setError("Explain why the suppression is being lifted (at least 10 characters).");
      return;
    }
    setPending(true);
    try {
      await lift({ entryId: entry._id, reason: reason.trim() });
      toast.warn("Suppression lifted", `${masked} can be distributed again. The entry and its history are kept.`);
      onClose();
    } catch (err) {
      toast.error(err, "Could not lift the suppression");
      setPending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Lift this suppression"
      subtitle={`${entry.channel === "phone" ? "Phone" : "Email"} ${masked} · ${SUPPRESSION_REASON_LABELS[entry.reason] ?? entry.reason}`}
      footer={
        <>
          <Button variant="out" size="s" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="red" size="s" onClick={() => void submit()} loading={pending}>
            Lift suppression
          </Button>
        </>
      }
    >
      <Alert kind="e">
        <b>Legal review required.</b> Lifting a suppression allows this contact to be distributed and called again. Only lift it when counsel has confirmed
        fresh, documented consent or the entry was made in error. {entry.reason === "sms_stop" && "This entry came from an SMS STOP reply — a later START does not lift it automatically."}
      </Alert>
      <div style={{ marginTop: "1rem" }}>
        <Field label="Reason for lifting" required error={error} help="At least 10 characters. Recorded on the entry and in the audit log.">
          <textarea
            value={reason}
            maxLength={1000}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
