"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { formatDate, timeUntil } from "@/domain/format";
import { NotesModal } from "./kit";
import { type AdminAccount, isPast, type StaffAccess } from "./types";

export interface EoDecisionTarget {
  id: Id<"eoPolicies">;
  carrier: string;
  accountName: string;
  decision: "verified" | "failed";
}

export function EoDecisionModal({ target, onClose }: { target: EoDecisionTarget; onClose: () => void }) {
  const verify = useMutation(api.eoPolicies.verify);
  const ok = target.decision === "verified";
  return (
    <NotesModal
      title={ok ? "Verify E&O evidence" : "Fail E&O evidence"}
      subtitle={`${target.carrier} · ${target.accountName}`}
      intro={
        <Alert kind={ok ? "i" : "w"}>
          {ok
            ? "Confirm the carrier, policy number and expiry date match the document. Verifying supersedes any earlier policy on file."
            : "The agent is notified with your notes. Without E&O in force no lead is released, in any state."}
        </Alert>
      }
      label={ok ? "Review notes" : "Why it failed"}
      placeholder={ok ? "Declarations page matches carrier and expiry." : "Document is a quote, not a bound policy."}
      minLength={ok ? 0 : 3}
      confirmLabel={ok ? "Mark verified" : "Mark failed"}
      variant={ok ? "green" : "red"}
      success={ok ? "E&O verified" : "E&O marked failed"}
      onSubmit={(notes) => verify({ policyId: target.id, decision: target.decision, notes: notes || undefined })}
      onClose={onClose}
    />
  );
}

export interface TpmoTarget {
  id: Id<"tpmoApprovals">;
  accountName: string;
  action: "approved" | "rejected" | "revoke";
}

export function TpmoDecisionModal({ target, onClose }: { target: TpmoTarget; onClose: () => void }) {
  const decide = useMutation(api.tpmo.decide);
  const revoke = useMutation(api.tpmo.revoke);
  const { action } = target;
  return (
    <NotesModal
      title={action === "approved" ? "Approve Medicare TPMO" : action === "rejected" ? "Reject Medicare TPMO request" : "Revoke Medicare TPMO approval"}
      subtitle={target.accountName}
      intro={
        <Alert kind={action === "approved" ? "i" : "w"}>
          {action === "approved"
            ? "Medicare leads can be released to this account once its licences and preferences match. The decision and your notes are audited."
            : action === "rejected"
              ? "Medicare leads stay blocked for this account. The agent sees your notes and can request again."
              : "Medicare leads stop immediately — automatically and manually. The agent is notified with your reason."}
        </Alert>
      }
      label={action === "revoke" ? "Reason" : "Decision notes"}
      placeholder={action === "approved" ? "CMS TPMO requirements confirmed." : action === "rejected" ? "Attestation incomplete." : "Compliance review — marketing outside CMS rules."}
      minLength={action === "revoke" ? 5 : 3}
      confirmLabel={action === "approved" ? "Approve" : action === "rejected" ? "Reject" : "Revoke approval"}
      variant={action === "approved" ? "green" : "red"}
      success={action === "approved" ? "TPMO approved" : action === "rejected" ? "TPMO request rejected" : "TPMO approval revoked"}
      onSubmit={(notes) => (action === "revoke" ? revoke({ approvalId: target.id, reason: notes }) : decide({ approvalId: target.id, decision: action, notes }))}
      onClose={onClose}
    />
  );
}

export function ComplianceTab({ data, access }: { data: AdminAccount; access: StaffAccess }) {
  const accountId = data.account._id;
  const policies = useQuery(api.eoPolicies.forAccount, { accountId });
  const tpmo = useQuery(api.tpmo.forAccount, { accountId });
  const [eoTarget, setEoTarget] = useState<EoDecisionTarget | null>(null);
  const [tpmoTarget, setTpmoTarget] = useState<TpmoTarget | null>(null);
  const canVerify = access.can("licenses.verify");
  const canDecide = access.can("tpmo.decide");
  const name = data.account.name;

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <Card>
        <CardHeader title="E&O cover" description="Errors & omissions evidence. The E&O filter halts every state the day cover lapses." />
        {policies === undefined ? (
          <div className="card-bd">
            <LoadingBlock rows={2} label="Loading E&O policies" />
          </div>
        ) : (
          <DataTable
            flush
            caption="E&O policies"
            columns={[{ label: "Carrier" }, { label: "Policy" }, { label: "Expires" }, { label: "Status" }, { label: "Submitted" }, { label: "Actions", align: "right", srOnly: true }]}
            isEmpty={policies.length === 0}
            empty={
              <EmptyState icon="shield" title="No E&O on file">
                No lead can be released to this account until E&amp;O evidence is on file and in force.
              </EmptyState>
            }
          >
            {policies.map((p) => {
              const live = !p.supersededAt;
              const expired = isPast(p.expiresAt);
              return (
                <tr key={p._id} style={live ? undefined : { opacity: 0.6 }}>
                  <td>
                    <span className="nm">{p.carrier}</span>
                    {p.documentUrl ? (
                      <a className="link xs" href={p.documentUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: ".15rem" }}>
                        View document
                      </a>
                    ) : (
                      <span className="tsub">No document uploaded</span>
                    )}
                  </td>
                  <td className="mono sm nowrap">{p.policyNumber ?? "—"}</td>
                  <td className="sm nowrap">
                    {formatDate(p.expiresAt)}
                    <span className="tsub" style={expired ? { color: "var(--red)" } : undefined}>
                      {expired ? "Lapsed " : ""}
                      {timeUntil(p.expiresAt)}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: ".3rem" }}>
                      <StatusBadge status={expired && p.verificationStatus !== "failed" ? "expired" : p.verificationStatus} />
                      {!live && <Badge tone="n">Superseded</Badge>}
                    </div>
                    {p.verificationNotes && (
                      <span className="tsub" style={p.verificationStatus === "failed" ? { color: "var(--red)" } : undefined}>
                        {p.verificationNotes}
                      </span>
                    )}
                  </td>
                  <td className="sm nowrap">{formatDate(p.submittedAt)}</td>
                  <td className="tr">
                    {canVerify && live && (
                      <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                        {p.verificationStatus !== "verified" && !expired && (
                          <Button variant="green" size="xs" onClick={() => setEoTarget({ id: p._id, carrier: p.carrier, accountName: name, decision: "verified" })}>
                            Verify
                          </Button>
                        )}
                        {p.verificationStatus !== "failed" && (
                          <Button variant="ghost" size="xs" onClick={() => setEoTarget({ id: p._id, carrier: p.carrier, accountName: name, decision: "failed" })}>
                            Fail
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Medicare TPMO"
          description="Third-Party Marketing Organization approval. Required for every Medicare lead."
          actions={tpmo ? <StatusBadge status={tpmo.approved ? "approved" : tpmo.pending ? "requested" : "not_required"} label={tpmo.approved ? "Approved" : tpmo.pending ? "Requested" : "Not approved"} /> : undefined}
        />
        {tpmo === undefined ? (
          <div className="card-bd">
            <LoadingBlock rows={2} label="Loading TPMO history" />
          </div>
        ) : (
          <DataTable
            flush
            caption="TPMO history"
            columns={[{ label: "Requested" }, { label: "Status" }, { label: "Decided" }, { label: "Notes" }, { label: "Actions", align: "right", srOnly: true }]}
            isEmpty={tpmo.history.length === 0}
            empty={
              <EmptyState icon="cross" title="No TPMO request">
                This account has never requested Medicare TPMO approval, so Medicare leads are never released to it.
              </EmptyState>
            }
          >
            {tpmo.history.map((r) => (
              <tr key={r._id}>
                <td className="sm nowrap">{formatDate(r.requestedAt)}</td>
                <td>
                  <StatusBadge status={r.status === "revoked" ? "revoked" : r.status} />
                </td>
                <td className="sm nowrap">{formatDate(r.revokedAt ?? r.decidedAt)}</td>
                <td className="sm">{r.decisionNotes ?? "—"}</td>
                <td className="tr">
                  {canDecide && (
                    <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      {r.status === "requested" && (
                        <>
                          <Button variant="green" size="xs" onClick={() => setTpmoTarget({ id: r._id, accountName: name, action: "approved" })}>
                            Approve
                          </Button>
                          <Button variant="ghost" size="xs" onClick={() => setTpmoTarget({ id: r._id, accountName: name, action: "rejected" })}>
                            Reject
                          </Button>
                        </>
                      )}
                      {r.status === "approved" && !r.revokedAt && (
                        <Button variant="out" size="xs" onClick={() => setTpmoTarget({ id: r._id, accountName: name, action: "revoke" })}>
                          Revoke
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Alert kind="i">
        Compliance rules are hard filters: without E&amp;O in force no lead is released, and without an approval in force no Medicare lead is released —
        automatically or by manual assignment.
      </Alert>

      {eoTarget && <EoDecisionModal target={eoTarget} onClose={() => setEoTarget(null)} />}
      {tpmoTarget && <TpmoDecisionModal target={tpmoTarget} onClose={() => setTpmoTarget(null)} />}
    </div>
  );
}
