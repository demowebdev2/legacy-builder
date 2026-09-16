"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ModalButtons, ModalError, useModalSubmit, useStaffAccess } from "@/components/admin/accounts/kit";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable, DefinitionList } from "@/components/ui/Display";
import { Alert, Avatar, EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { STAFF_ROLES, type StaffRole } from "@/domain/constants";
import { formatDate, timeAgo, timeUntil } from "@/domain/format";
import { ROLE_DESCRIPTIONS } from "@/domain/permissions";

type StaffList = FunctionReturnType<typeof api.users.listStaff>;
type StaffUser = StaffList["users"][number];

const roleLabel = (role: string) => role.charAt(0) + role.slice(1).toLowerCase();

export default function UsersPage() {
  const access = useStaffAccess();
  const canManage = access.can("users.manage");
  const data = useQuery(api.users.listStaff, canManage ? {} : "skip");
  const [inviting, setInviting] = useState(false);
  const [roleChange, setRoleChange] = useState<{ user: StaffUser; role: StaffRole } | null>(null);
  const [toggling, setToggling] = useState<StaffUser | null>(null);
  const [revoking, setRevoking] = useState<StaffList["invitations"][number] | null>(null);

  if (!canManage) {
    return (
      <>
        <PageHeader title="Users & roles" />
        <div className="card">
          <EmptyState icon="lock" title="Admins only">
            Staff users and roles are managed by an Admin.
          </EmptyState>
        </div>
      </>
    );
  }

  const selfId = access.me?.userId;
  const mfaRequired = !!access.me?.mfa?.required;

  return (
    <>
      <PageHeader title="Users & roles" />
      <div className="g g-2-1">
        <div className="stack" style={{ gap: "1.25rem" }}>
          <Card>
            <CardHeader
              title="Admin users"
              actions={
                <Button variant="out" size="s" icon="plus" onClick={() => setInviting(true)}>
                  Invite
                </Button>
              }
            />
            {data === undefined ? (
              <div className="card-bd">
                <LoadingBlock rows={4} label="Loading staff" />
              </div>
            ) : (
              <DataTable
                flush
                caption="Staff users"
                columns={[{ label: "Name" }, { label: "Role" }, { label: "2FA" }, { label: "Last seen" }, { label: "Status" }, { label: "Actions", srOnly: true, align: "right" }]}
                isEmpty={data.users.length === 0}
                empty={<EmptyState icon="users" title="No staff users" />}
              >
                {data.users.map((u) => {
                  const self = u.id === selfId;
                  return (
                    <tr key={u.id} style={u.disabled ? { opacity: 0.65 } : undefined}>
                      <td>
                        <div className="row" style={{ gap: ".5rem", flexWrap: "nowrap" }}>
                          <Avatar name={u.name} />
                          <div style={{ minWidth: 0 }}>
                            <span className="nm">
                              {u.name}
                              {self && <span className="xs"> (you)</span>}
                            </span>
                            <span className="tsub">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          className="tsel"
                          aria-label={`Role for ${u.name}`}
                          value={u.role}
                          disabled={self}
                          title={self ? "You cannot change your own role" : undefined}
                          onChange={(e) => setRoleChange({ user: u, role: e.target.value as StaffRole })}
                        >
                          {STAFF_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {roleLabel(r)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{u.mfaEnrolled ? <Badge tone="g">On</Badge> : <Badge tone="r">Off</Badge>}</td>
                      <td className="sm nowrap">{u.lastSeenAt ? timeAgo(u.lastSeenAt) : "Never"}</td>
                      <td>{u.disabled ? <Badge tone="n">Disabled</Badge> : <Badge tone="g" dot>Active</Badge>}</td>
                      <td className="tr">
                        {!self && (
                          <Button variant={u.disabled ? "out" : "ghost"} size="xs" onClick={() => setToggling(u)}>
                            {u.disabled ? "Enable" : "Disable"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
          </Card>

          <Card>
            <CardHeader title="Pending invitations" description="Invitations expire after 7 days. The first sign-in with the invited address claims the role." />
            {data === undefined ? (
              <div className="card-bd">
                <LoadingBlock rows={2} label="Loading invitations" />
              </div>
            ) : (
              <DataTable
                flush
                caption="Pending staff invitations"
                columns={[{ label: "Email" }, { label: "Role" }, { label: "Expires" }, { label: "Actions", srOnly: true, align: "right" }]}
                isEmpty={data.invitations.length === 0}
                empty={
                  <EmptyState icon="mail" title="No pending invitations">
                    Invite a colleague and they will appear here until they sign in.
                  </EmptyState>
                }
              >
                {data.invitations.map((i) => (
                  <tr key={i.id}>
                    <td className="sm">
                      <span className="nm">{i.email}</span>
                    </td>
                    <td className="sm">{roleLabel(i.role)}</td>
                    <td className="sm nowrap">
                      {formatDate(i.expiresAt)}
                      <span className="tsub">{timeUntil(i.expiresAt)}</span>
                    </td>
                    <td className="tr">
                      <Button variant="ghost" size="xs" onClick={() => setRevoking(i)}>
                        Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Roles" />
          <CardBody>
            <DefinitionList items={STAFF_ROLES.map((r) => [roleLabel(r), ROLE_DESCRIPTIONS[r]])} />
            <p className="xs" style={{ marginTop: ".8rem" }}>
              Roles are enforced on the server for every query and change. Hiding a button is a convenience, never the security boundary.
            </p>
            <hr className="hr" />
            <div className="eyebrow" style={{ marginBottom: ".4rem" }}>
              Session policy
            </div>
            <DefinitionList
              style={{ fontSize: ".82rem" }}
              items={[
                ["Session", "Up to 30 days; tokens refresh hourly"],
                ["Password", "12+ characters, reset by emailed code"],
                ["2FA", mfaRequired ? "Mandatory for all staff roles" : "Not enforced here — on by default in production"],
                ["Disable", "Ends every session immediately"],
                ["Impersonation", "Not available"],
              ]}
            />
          </CardBody>
        </Card>
      </div>

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {roleChange && <RoleChangeModal user={roleChange.user} role={roleChange.role} onClose={() => setRoleChange(null)} />}
      {toggling && <ToggleUserModal user={toggling} onClose={() => setToggling(null)} />}
      {revoking && <RevokeInvitationModal invitation={revoking} onClose={() => setRevoking(null)} />}
    </>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const invite = useMutation(api.users.inviteStaff);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("SUPPORT");
  const [emailError, setEmailError] = useState<string | null>(null);
  const { submit, pending, error } = useModalSubmit(() => invite({ email: email.trim(), role }), {
    success: "Invitation sent",
    successBody: `${email.trim()} can sign in as ${roleLabel(role)} for the next 7 days.`,
    onDone: onClose,
  });
  const confirm = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    void submit();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Invite a staff user"
      subtitle="They receive an email link valid for 7 days"
      footer={<ModalButtons onCancel={onClose} onConfirm={confirm} label="Send invitation" pending={pending} />}
    >
      <Field label="Work email" required error={emailError}>
        <input type="email" autoComplete="off" value={email} placeholder="name@legacybuilders.com" onChange={(e) => { setEmail(e.target.value); setEmailError(null); }} />
      </Field>
      <Field label="Role" required help={ROLE_DESCRIPTIONS[role]}>
        <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
      </Field>
      <Alert kind="i">Two-factor authentication is set up on first sign-in. The invitation, role and every later role change are audited.</Alert>
      <ModalError error={error} />
    </Modal>
  );
}

function RoleChangeModal({ user, role, onClose }: { user: StaffUser; role: StaffRole; onClose: () => void }) {
  const setStaffRole = useMutation(api.users.setStaffRole);
  const { submit, pending, error } = useModalSubmit(() => setStaffRole({ userId: user.id as Id<"users">, role }), {
    success: "Role updated",
    successBody: `${user.name} is now ${roleLabel(role)}.`,
    onDone: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Change ${user.name}'s role`}
      subtitle={`${roleLabel(user.role)} → ${roleLabel(role)}`}
      footer={<ModalButtons onCancel={onClose} onConfirm={() => void submit()} label="Change role" pending={pending} />}
    >
      <DefinitionList
        items={[
          ["Now", `${roleLabel(user.role)} — ${ROLE_DESCRIPTIONS[user.role]}`],
          ["After", `${roleLabel(role)} — ${ROLE_DESCRIPTIONS[role]}`],
        ]}
      />
      <div style={{ marginTop: "1rem" }}>
        <Alert kind="w">The change applies to their very next request. It is recorded in the audit log.</Alert>
      </div>
      <ModalError error={error} />
    </Modal>
  );
}

function ToggleUserModal({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const setStaffDisabled = useMutation(api.users.setStaffDisabled);
  const disable = !user.disabled;
  const { submit, pending, error } = useModalSubmit(() => setStaffDisabled({ userId: user.id as Id<"users">, disabled: disable }), {
    success: disable ? "User disabled" : "User re-enabled",
    onDone: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={disable ? `Disable ${user.name}` : `Re-enable ${user.name}`}
      subtitle={user.email}
      footer={<ModalButtons onCancel={onClose} onConfirm={() => void submit()} label={disable ? "Disable user" : "Re-enable user"} variant={disable ? "red" : "green"} pending={pending} />}
    >
      <Alert kind={disable ? "e" : "i"}>
        {disable
          ? "Every session for this user ends immediately and they cannot sign in until re-enabled. Their history and audit entries are kept."
          : "They can sign in again with their existing password and two-factor device."}
      </Alert>
      <ModalError error={error} />
    </Modal>
  );
}

function RevokeInvitationModal({ invitation, onClose }: { invitation: StaffList["invitations"][number]; onClose: () => void }) {
  const revoke = useMutation(api.users.revokeStaffInvitation);
  const { submit, pending, error } = useModalSubmit(() => revoke({ invitationId: invitation.id }), { success: "Invitation revoked", onDone: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title="Revoke invitation"
      subtitle={`${invitation.email} · ${roleLabel(invitation.role)}`}
      footer={<ModalButtons onCancel={onClose} onConfirm={() => void submit()} label="Revoke invitation" variant="red" pending={pending} />}
    >
      <Alert kind="w">The link stops working immediately. You can send a new invitation later.</Alert>
      <ModalError error={error} />
    </Modal>
  );
}
