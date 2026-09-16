"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/Display";
import { Alert, Avatar, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { NotesModal } from "./kit";
import type { AdminAccount, StaffAccess } from "./types";

const SEAT_ROLE: Record<string, string> = { principal: "Principal", producer: "Producer", billing_contact: "Billing" };

interface SeatTarget {
  id: Id<"agencyMembers">;
  name: string;
  status: "verified" | "failed";
}

function SeatVerificationModal({ target, onClose }: { target: SeatTarget; onClose: () => void }) {
  const setSeatVerification = useMutation(api.agencyMembers.setSeatVerification);
  const ok = target.status === "verified";
  return (
    <NotesModal
      title={ok ? `Verify ${target.name}` : `Fail ${target.name}`}
      subtitle="Producer seat verification"
      intro={
        <Alert kind={ok ? "i" : "w"}>
          {ok
            ? "A verified, active seat lets the agency receive leads and hand them to this producer in states the producer is licensed for."
            : "The seat cannot receive handed-out leads. If it was the agency's only verified seat, the agency stops receiving leads."}
        </Alert>
      }
      label="Notes"
      placeholder={ok ? "NPN matched producer licence records." : "NPN does not match the name on file."}
      minLength={3}
      confirmLabel={ok ? "Mark verified" : "Mark failed"}
      variant={ok ? "green" : "red"}
      success={ok ? "Seat verified" : "Seat marked failed"}
      onSubmit={(notes) => setSeatVerification({ memberId: target.id, status: target.status, notes })}
      onClose={onClose}
    />
  );
}

export function TeamTab({ data, access }: { data: AdminAccount; access: StaffAccess }) {
  const members = useQuery(api.agencyMembers.forAccount, { accountId: data.account._id });
  const [target, setTarget] = useState<SeatTarget | null>(null);
  const canVerify = access.can("licenses.verify");

  if (members === undefined) return <LoadingBlock rows={4} label="Loading seats" />;

  return (
    <>
      <DataTable
        caption="Agency seats"
        columns={[{ label: "Producer" }, { label: "Role" }, { label: "NPN" }, { label: "Verification" }, { label: "Status" }, { label: "Actions", align: "right", srOnly: true }]}
        isEmpty={members.length === 0}
        empty={
          <EmptyState icon="users" title="No seats">
            The agency has not set up any producer seats yet.
          </EmptyState>
        }
      >
        {members.map((m) => (
          <tr key={m._id}>
            <td>
              <div className="row" style={{ gap: ".5rem", flexWrap: "nowrap" }}>
                <Avatar name={m.name} />
                <div style={{ minWidth: 0 }}>
                  <span className="nm">{m.name}</span>
                  <span className="tsub">{m.email}</span>
                </div>
              </div>
            </td>
            <td className="sm">{SEAT_ROLE[m.seatRole] ?? m.seatRole}</td>
            <td className="mono sm">{m.npn ?? "—"}</td>
            <td>{m.verificationStatus === "not_required" ? <span className="xs">n/a</span> : <StatusBadge status={m.verificationStatus} />}</td>
            <td>
              <StatusBadge status={m.status} />
            </td>
            <td className="tr">
              {canVerify && m.verificationStatus !== "not_required" && (
                <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                  {m.verificationStatus !== "verified" && (
                    <Button variant="green" size="xs" onClick={() => setTarget({ id: m._id, name: m.name, status: "verified" })}>
                      Verify
                    </Button>
                  )}
                  {m.verificationStatus !== "failed" && (
                    <Button variant="ghost" size="xs" onClick={() => setTarget({ id: m._id, name: m.name, status: "failed" })}>
                      Fail
                    </Button>
                  )}
                </div>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      <div style={{ height: "1rem" }} />
      <Alert kind="i">
        The agency-seat filter excludes an agency with no active verified seat. A pooled balance and nobody to work the lead is a refund waiting to happen. Seats
        themselves are free — there is no commercial reason to leave one unverified.
      </Alert>
      {target && <SeatVerificationModal target={target} onClose={() => setTarget(null)} />}
    </>
  );
}
