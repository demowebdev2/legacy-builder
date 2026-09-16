"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { formatDate, timeUntil } from "@/domain/format";
import { NotesModal, useReferenceNames } from "./kit";
import { type AdminAccount, isPast, type StaffAccess } from "./types";

export interface LicenceDecisionTarget {
  id: Id<"licenses">;
  state: string;
  licenseNumber: string;
  holder: string;
  decision: "verified" | "failed";
}

/** Verify / fail one state licence. Failing requires notes the agent will read. */
export function LicenceDecisionModal({ target, onClose }: { target: LicenceDecisionTarget; onClose: () => void }) {
  const verify = useMutation(api.licenses.verify);
  const { stateName } = useReferenceNames();
  const ok = target.decision === "verified";
  return (
    <NotesModal
      title={`${ok ? "Verify" : "Fail"} ${stateName(target.state)} licence`}
      subtitle={`${target.licenseNumber} · ${target.holder}`}
      intro={
        <Alert kind={ok ? "i" : "w"}>
          {ok
            ? "Confirm the licence is active for this producer on the state's public lookup. Verified states become eligible for distribution immediately."
            : "The state stays ineligible. The agent is notified with your notes and can upload a corrected licence."}
        </Alert>
      }
      label={ok ? "Verification notes" : "Why it failed"}
      placeholder={ok ? "Checked against the state DOI lookup." : "Licence number does not match the NPN on file."}
      minLength={ok ? 0 : 3}
      confirmLabel={ok ? "Mark verified" : "Mark failed"}
      variant={ok ? "green" : "red"}
      success={ok ? `${target.state} licence verified` : `${target.state} licence failed`}
      onSubmit={(notes) => verify({ licenseId: target.id, decision: target.decision, notes: notes || undefined })}
      onClose={onClose}
    />
  );
}

export function LicencesTab({ data, access }: { data: AdminAccount; access: StaffAccess }) {
  const rows = useQuery(api.licenses.forAccount, { accountId: data.account._id });
  const { stateName } = useReferenceNames();
  const [target, setTarget] = useState<LicenceDecisionTarget | null>(null);
  const canVerify = access.can("licenses.verify");

  if (rows === undefined) return <LoadingBlock rows={4} label="Loading licences" />;

  return (
    <>
      <DataTable
        caption="State licences"
        columns={[{ label: "State" }, { label: "Number" }, { label: "Holder" }, { label: "Expires" }, { label: "Status" }, { label: "Actions", align: "right", srOnly: true }]}
        isEmpty={rows.length === 0}
        empty={
          <EmptyState icon="badge" title="No licences on file">
            The applicant has not submitted a state licence yet. No state is eligible until one is verified.
          </EmptyState>
        }
      >
        {rows.map((l) => {
          const holder = l.memberName ?? (data.account.type === "agency" ? "Agency (principal)" : data.account.name);
          const expired = isPast(l.expiresAt);
          const live = !l.supersededAt;
          return (
            <tr key={l._id} style={live ? undefined : { opacity: 0.6 }}>
              <td>
                <span className="nm">{stateName(l.state)}</span>
                <span className="tsub">{l.state}</span>
              </td>
              <td className="mono sm nowrap">{l.licenseNumber}</td>
              <td className="sm">
                {holder}
                {l.memberName && <span className="tsub">Producer seat</span>}
              </td>
              <td className="sm nowrap">
                {formatDate(l.expiresAt)}
                <span className="tsub" style={expired ? { color: "var(--red)" } : undefined}>
                  {expired ? "Expired " : ""}
                  {timeUntil(l.expiresAt)}
                </span>
              </td>
              <td>
                <div className="row" style={{ gap: ".3rem" }}>
                  <StatusBadge status={expired && l.verificationStatus === "verified" ? "expired" : l.verificationStatus} />
                  {!live && <Badge tone="n">Superseded</Badge>}
                </div>
                {l.verificationNotes && (
                  <span className="tsub" style={l.verificationStatus === "failed" ? { color: "var(--red)" } : undefined}>
                    {l.verificationNotes}
                  </span>
                )}
                {l.verifiedAt && <span className="tsub">Reviewed {formatDate(l.verifiedAt)}</span>}
              </td>
              <td className="tr">
                {canVerify && live && (
                  <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    {l.verificationStatus !== "verified" && !expired && (
                      <Button
                        variant="green"
                        size="xs"
                        onClick={() => setTarget({ id: l._id, state: l.state, licenseNumber: l.licenseNumber, holder, decision: "verified" })}
                      >
                        Verify
                      </Button>
                    )}
                    {l.verificationStatus !== "failed" && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setTarget({ id: l._id, state: l.state, licenseNumber: l.licenseNumber, holder, decision: "failed" })}
                      >
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
      <div style={{ height: "1rem" }} />
      <Alert kind="i">
        The licence filter of the distribution engine checks this table on every single lead. An unverified or expired state is never bent, not even for a
        manual admin assignment.
      </Alert>
      {target && <LicenceDecisionModal target={target} onClose={() => setTarget(null)} />}
    </>
  );
}
