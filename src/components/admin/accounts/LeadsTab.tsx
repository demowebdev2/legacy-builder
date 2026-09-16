"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, LeadTypeBadge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { Checkbox, Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { LoadMore } from "@/components/ui/Navigation";
import { REVOKE_REASONS } from "@/domain/constants";
import { formatDate } from "@/domain/format";
import { ModalButtons, ModalError, useModalSubmit, useReferenceNames } from "./kit";
import type { AdminAccount, StaffAccess } from "./types";

interface RevokeTarget {
  id: Id<"leadAssignments">;
  reference: string;
  accountName: string;
}

/** Prototype `revokeModal`: the assignment row is stamped, never deleted. */
function RevokeAssignmentModal({ target, onClose }: { target: RevokeTarget; onClose: () => void }) {
  const revoke = useMutation(api.assignments.revoke);
  const [reason, setReason] = useState<string>(REVOKE_REASONS[0]);
  const [returnLead, setReturnLead] = useState(true);
  const [requeue, setRequeue] = useState(true);
  const { submit, pending, error } = useModalSubmit(() => revoke({ assignmentId: target.id, reason, returnLead, requeue }), {
    success: "Assignment revoked",
    successBody: (result) =>
      result.requeue?.assigned.length
        ? `Re-released to ${result.requeue.assigned.join(", ")}.`
        : requeue
          ? "Re-queued — no other agent was eligible yet. The agent has been told to cease contact."
          : "The agent has been told to cease contact.",
    onDone: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Revoke this assignment"
      subtitle={`${target.accountName} · lead ${target.reference}`}
      footer={<ModalButtons onCancel={onClose} onConfirm={() => void submit()} label="Revoke" variant="red" pending={pending} />}
    >
      <Alert kind="n">
        The assignment row is <b>never deleted</b>. Revoking stamps it with a timestamp and reason so the history stays intact and auditable. The agent is
        told to cease contact.
      </Alert>
      <Field label="Reason" required className="mt-4">
        <select value={reason} onChange={(e) => setReason(e.target.value)}>
          {REVOKE_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      <Checkbox checked={returnLead} onChange={setReturnLead}>
        Return the lead to {target.accountName}&apos;s balance
      </Checkbox>
      <Checkbox checked={requeue} onChange={setRequeue}>
        Re-queue the lead so the next eligible agent receives it
      </Checkbox>
      <ModalError error={error} />
    </Modal>
  );
}

export function LeadsTab({ data, access }: { data: AdminAccount; access: StaffAccess }) {
  const log = usePaginatedQuery(api.assignments.log, { accountId: data.account._id }, { initialNumItems: 25 });
  const { coverageName } = useReferenceNames();
  const [target, setTarget] = useState<RevokeTarget | null>(null);
  const canRevoke = access.can("leads.manage");
  const canOpenLead = access.can("leads.read");

  if (log.status === "LoadingFirstPage") return <LoadingBlock rows={6} label="Loading leads" />;

  return (
    <>
      <DataTable
        caption="Leads released to this account"
        columns={[{ label: "Lead" }, { label: "Product" }, { label: "Type" }, { label: "Released" }, { label: "Method" }, { label: "Status" }, { label: "Actions", align: "right", srOnly: true }]}
        isEmpty={log.results.length === 0}
        empty={
          <EmptyState icon="inbox" title="No leads released">
            Nothing has been assigned to this account yet.
          </EmptyState>
        }
        footer={log.results.length ? <LoadMore status={log.status} count={log.results.length} onLoadMore={() => log.loadMore(25)} /> : undefined}
      >
        {log.results.map((a) => (
          <tr key={a._id}>
            <td className="mono">
              {canOpenLead ? (
                <Link href={`/admin/leads/${a.leadId}`} className="nm">
                  {a.reference}
                </Link>
              ) : (
                <span className="nm">{a.reference}</span>
              )}
              <span className="tsub" style={{ fontFamily: "var(--fb)" }}>
                {a.consumerName}
              </span>
            </td>
            <td className="sm">{coverageName(a.coverageType)}</td>
            <td>
              <LeadTypeBadge type={a.leadType} />
            </td>
            <td className="sm nowrap">{formatDate(a.assignedAt, true)}</td>
            <td>{a.method === "auto" ? <Badge tone="n">Auto</Badge> : <Badge tone="gold">Manual</Badge>}</td>
            <td>
              <StatusBadge status={a.revokedAt ? "revoked" : a.status} />
              {a.revokedAt && a.revokedReason && <span className="tsub">{a.revokedReason}</span>}
            </td>
            <td className="tr">
              {canRevoke && !a.revokedAt && (
                <Button variant="ghost" size="xs" onClick={() => setTarget({ id: a._id, reference: a.reference, accountName: data.account.name })}>
                  Revoke
                </Button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      {target && <RevokeAssignmentModal target={target} onClose={() => setTarget(null)} />}
    </>
  );
}
