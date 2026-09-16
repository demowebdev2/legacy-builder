"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { InviteSeatModal } from "@/components/agent/InviteSeatModal";
import { useAgentAccount } from "@/components/agent/useAgentAccount";
import { PageHeader } from "@/components/layouts/PortalShell";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardFooter } from "@/components/ui/Card";
import { DataTable, StatCard } from "@/components/ui/Display";
import { Alert, Avatar, EmptyState, PageLoading } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

const ROLE_LABEL: Record<string, string> = { principal: "Principal", producer: "Producer", billing_contact: "Billing contact" };

export default function TeamPage() {
  const agent = useAgentAccount();
  if (agent === undefined) {
    return (
      <>
        <PageHeader title="Team" />
        <PageLoading />
      </>
    );
  }
  if (!agent || !agent.principal) {
    return (
      <>
        <PageHeader title="Team" />
        <div className="card">
          {agent?.producer ? (
            <EmptyState icon="users" title="Managed by your principal">
              Seats on your agency are invited and managed by the agency principal.
            </EmptyState>
          ) : (
            <EmptyState icon="users" title="Individual account">
              Team seats are an agency feature. Your account is a single producer login with its own lead balance.
            </EmptyState>
          )}
        </div>
      </>
    );
  }
  return <TeamView readOnly={agent.readOnly} />;
}

function TeamView({ readOnly }: { readOnly: boolean }) {
  const data = useQuery(api.agencyMembers.team);
  const setSeatActive = useMutation(api.agencyMembers.setSeatActive);
  const toast = useToast();
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<{ id: Id<"agencyMembers">; name: string; active: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  if (data === undefined) {
    return (
      <>
        <PageHeader title="Team" />
        <PageLoading />
      </>
    );
  }

  const changeSeat = async () => {
    if (!confirm) return;
    setPending(true);
    try {
      await setSeatActive({ memberId: confirm.id, active: confirm.active });
      toast.success(confirm.active ? "Seat reactivated" : "Seat deactivated", confirm.active ? `${confirm.name} can sign in again.` : `${confirm.name} has been signed out.`);
      setConfirm(null);
    } catch (e) {
      toast.error(e, "The seat was not changed");
    } finally {
      setPending(false);
    }
  };

  const members = [...data.members].sort((a, b) => Number(b.seatRole === "principal") - Number(a.seatRole === "principal") || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader title="Team" />
      <div className="g g4" style={{ marginBottom: "1.25rem" }}>
        <StatCard label="Seats used" value={data.activeSeats} unit={`of ${data.maxSeats}`} icon="users" />
        <StatCard label="Pooled exclusive" value={data.balance.exclusive} icon="star" accent="gold" />
        <StatCard label="Pooled standard" value={data.balance.standard} icon="coin" accent="gold" />
        <StatCard label="Seat price" value="Free" icon="plus" sub="Included on every account" />
      </div>
      <Alert kind="i">
        <b>One pooled balance.</b> Leads arrive at agency level and the principal hands them to a producer. Producer seats are included at no charge, and
        every seat is verified individually before it can hold a lead.
      </Alert>
      <div style={{ height: "1.25rem" }} />

      <Card>
        <DataTable
          flush
          caption="Agency seats"
          isEmpty={members.length === 0}
          empty={<EmptyState icon="users" title="No seats yet">Invite your first producer to start handing out leads.</EmptyState>}
          columns={[
            { label: "Producer" },
            { label: "Role" },
            { label: "NPN" },
            { label: "Verification" },
            { label: "Status" },
            { label: "Licensed states" },
            { label: "Leads held" },
            { label: "Actions", srOnly: true },
          ]}
        >
          {members.map((m) => (
            <tr key={m._id}>
              <td>
                <div className="row" style={{ gap: ".55rem", flexWrap: "nowrap" }}>
                  <Avatar name={m.name} />
                  <div style={{ minWidth: 0 }}>
                    <span className="nm">{m.name}</span>
                    <span className="tsub">{m.email}</span>
                  </div>
                </div>
              </td>
              <td className="sm">{ROLE_LABEL[m.seatRole] ?? m.seatRole}</td>
              <td className="mono sm">{m.npn ?? "—"}</td>
              <td>{m.verificationStatus === "not_required" ? <span className="xs">n/a</span> : <StatusBadge status={m.verificationStatus} />}</td>
              <td>
                <StatusBadge status={m.status} />
              </td>
              <td className="sm">
                {m.seatRole === "billing_contact" ? (
                  <span className="xs">—</span>
                ) : (
                  <>
                    {m.licensedStates.length ? m.licensedStates.join(", ") : <span className="xs">None verified</span>}
                    {m.pendingStates.length > 0 && <span className="tsub">In review: {m.pendingStates.join(", ")}</span>}
                  </>
                )}
              </td>
              <td className="sm">{m.seatRole === "billing_contact" ? "—" : m.leadsHeld}</td>
              <td className="tr">
                {m.seatRole !== "principal" &&
                  (m.status === "deactivated" ? (
                    <Button variant="ghost" size="xs" disabled={readOnly} onClick={() => setConfirm({ id: m._id, name: m.name, active: true })}>
                      Reactivate
                    </Button>
                  ) : (
                    <Button variant="ghost" size="xs" onClick={() => setConfirm({ id: m._id, name: m.name, active: false })}>
                      Deactivate
                    </Button>
                  ))}
              </td>
            </tr>
          ))}
        </DataTable>
        <CardFooter>
          <span className="xs">Unassigned agency leads sit in the pool until the principal hands them out.</span>
          {readOnly ? (
            <span className="xs">Invites are disabled while your account is read-only.</span>
          ) : (
            <Button variant="out" size="s" icon="plus" disabled={data.activeSeats >= data.maxSeats} onClick={() => setInviting(true)}>
              Invite a producer
            </Button>
          )}
        </CardFooter>
      </Card>

      {inviting && <InviteSeatModal open onClose={() => setInviting(false)} />}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.active ? `Reactivate ${confirm?.name}?` : `Deactivate ${confirm?.name}?`}
        footer={
          <>
            <Button variant="out" size="s" onClick={() => setConfirm(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant={confirm?.active ? "navy" : "red"} size="s" loading={pending} onClick={() => void changeSeat()}>
              {confirm?.active ? "Reactivate seat" : "Deactivate seat"}
            </Button>
          </>
        }
      >
        <p className="sm">
          {confirm?.active
            ? "They can sign in again and receive handouts once their seat is verified. Leads you handed them before stay with them."
            : "They are signed out everywhere straight away and can no longer see any agency leads. Leads handed to them stay on the agency's record — hand them to someone else from each lead."}
        </p>
      </Modal>
    </>
  );
}
