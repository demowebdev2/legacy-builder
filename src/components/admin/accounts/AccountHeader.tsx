"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Alert, Avatar } from "@/components/ui/Feedback";
import { formatDate, timeAgo } from "@/domain/format";
import { AdjustLeadsModal } from "./AdjustLeadsModal";
import { ApproveModal } from "./ApproveModal";
import { BlockModal, CloseAccountModal, QualityHoldModal, RejectModal, RequestActionModal, RestoreModal, SuspendModal } from "./StatusModals";
import type { AdminAccount, StaffAccess } from "./types";

type HeaderModal = "approve" | "reject" | "request" | "suspend" | "block" | "restore" | "close" | "adjust" | "hold";

/** Prototype `A.account` header card: identity, status, balance and the status-dependent actions. */
export function AccountHeader({ data, access }: { data: AdminAccount; access: StaffAccess }) {
  const [modal, setModal] = useState<HeaderModal | null>(null);
  const { account, metrics } = data;
  const manage = access.can("accounts.manage");
  const status = account.status;
  const application = status === "pending_verification" || status === "action_required";
  const close = () => setModal(null);

  return (
    <>
      <ButtonLink href="/admin/accounts" variant="ghost" size="s" icon="back" style={{ marginBottom: ".9rem" }}>
        Back to accounts
      </ButtonLink>
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <div className="card-hd">
          <div className="row" style={{ flexWrap: "nowrap", minWidth: 0, alignItems: "flex-start" }}>
            <Avatar name={account.name} large />
            <div style={{ minWidth: 0 }}>
              <h2 className="h2" style={{ overflowWrap: "anywhere" }}>
                {account.name}
              </h2>
              <div className="row" style={{ gap: ".4rem", marginTop: ".25rem" }}>
                <StatusBadge status={status} />
                <Badge tone="n">
                  {metrics.balance.total} of {metrics.balance.issued} leads left
                </Badge>
                {account.qualityHold && <Badge tone="r">Quality hold</Badge>}
                {account.declinedPurchaseOutstanding && <Badge tone="r">Declined purchase</Badge>}
                <span className="xs">
                  {account.type === "agency" ? `Agency · EIN ${account.ein ?? "—"}` : `NPN ${account.npn ?? "—"}`} · joined {formatDate(account.appliedAt)}
                </span>
              </div>
            </div>
          </div>
          <div className="b-row">
            {manage && application && (
              <>
                <Button variant="green" size="s" onClick={() => setModal("approve")}>
                  Approve
                </Button>
                <Button variant="out" size="s" onClick={() => setModal("request")}>
                  Request action
                </Button>
                <Button variant="out" size="s" onClick={() => setModal("reject")}>
                  Reject
                </Button>
              </>
            )}
            {manage && status === "active" && (
              <Button variant="out" size="s" onClick={() => setModal("suspend")}>
                Suspend
              </Button>
            )}
            {manage && (status === "suspended" || status === "blocked" || status === "closed") && (
              <Button variant="green" size="s" onClick={() => setModal("restore")}>
                {status === "blocked" ? "Unblock" : status === "closed" ? "Reopen" : "Reactivate"}
              </Button>
            )}
            {manage && (status === "active" || status === "suspended") && (
              <Button variant="red" size="s" onClick={() => setModal("block")}>
                Block
              </Button>
            )}
            {manage && account.closureRequestedAt && status !== "closed" && status !== "rejected" && (
              <Button variant="out" size="s" onClick={() => setModal("close")}>
                Close account
              </Button>
            )}
            {access.can("ledger.adjust") && (
              <Button variant="out" size="s" icon="plus" onClick={() => setModal("adjust")}>
                Adjust leads
              </Button>
            )}
            {manage && (
              <Button variant="ghost" size="s" icon="pause" onClick={() => setModal("hold")} aria-pressed={account.qualityHold}>
                {account.qualityHold ? "Lift quality hold" : "Quality hold"}
              </Button>
            )}
          </div>
        </div>
        <StatusNotes data={data} />
      </div>

      {modal === "approve" && <ApproveModal data={data} onClose={close} />}
      {modal === "reject" && <RejectModal data={data} onClose={close} />}
      {modal === "request" && <RequestActionModal data={data} onClose={close} />}
      {modal === "suspend" && <SuspendModal data={data} onClose={close} />}
      {modal === "block" && <BlockModal data={data} onClose={close} />}
      {modal === "restore" && <RestoreModal data={data} onClose={close} />}
      {modal === "close" && <CloseAccountModal data={data} onClose={close} />}
      {modal === "adjust" && <AdjustLeadsModal data={data} onClose={close} />}
      {modal === "hold" && <QualityHoldModal data={data} onClose={close} />}
    </>
  );
}

function StatusNotes({ data }: { data: AdminAccount }) {
  const { account } = data;
  const reason = account.statusReason ? ` ${account.statusReason}` : "";
  const notes: React.ReactNode[] = [];
  if (account.status === "blocked") {
    notes.push(
      <Alert key="blocked" kind="e">
        <b>Blocked {timeAgo(account.statusChangedAt)}.</b>
        {reason} The balance is frozen, not forfeited.
      </Alert>,
    );
  }
  if (account.status === "suspended") {
    notes.push(
      <Alert key="suspended" kind="w">
        <b>Suspended {timeAgo(account.statusChangedAt)}.</b>
        {reason} No leads are released while suspended; the balance is frozen, not forfeited.
      </Alert>,
    );
  }
  if (account.status === "action_required") {
    notes.push(
      <Alert key="action" kind="w">
        <b>Waiting on the applicant.</b>
        {reason}
      </Alert>,
    );
  }
  if (account.status === "rejected" || account.status === "closed") {
    notes.push(
      <Alert key="ended" kind="n">
        <b>{account.status === "rejected" ? "Rejected" : "Closed"} {timeAgo(account.statusChangedAt)}.</b>
        {reason}
      </Alert>,
    );
  }
  if (account.closureRequestedAt && account.status !== "closed" && account.status !== "rejected") {
    notes.push(
      <Alert key="closure" kind="w">
        <b>Closure requested {timeAgo(account.closureRequestedAt)}.</b> There is no automatic refund of unused balance — the balance stays frozen and any
        refund is a manual finance decision.
      </Alert>,
    );
  }
  if (account.status === "pending_verification" && data.verifiedLicenseStates.length === 0) {
    notes.push(
      <Alert key="verify" kind="i">
        <b>No state licence is verified yet.</b> Review each licence and the E&amp;O policy before approving.{" "}
        <Link className="link" href={`/admin/accounts/${account._id}?tab=licences`} scroll={false}>
          Open licences →
        </Link>
      </Alert>,
    );
  }
  if (!notes.length) return null;
  return (
    <div className="card-bd stack" style={{ gap: ".6rem" }}>
      {notes}
    </div>
  );
}
