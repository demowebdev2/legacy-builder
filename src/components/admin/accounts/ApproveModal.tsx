"use client";

import { useAction as useConvexAction } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { DefinitionList } from "@/components/ui/Display";
import { Alert } from "@/components/ui/Feedback";
import { Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/domain/money";
import { ModalButtons, ModalError, useModalSubmit, useReferenceNames } from "./kit";
import { type AdminAccount, isPast } from "./types";

/** Prototype `approveModal`: capture the opening purchase, credit the balance, activate with verified states only. */
export function ApproveModal({ data, onClose }: { data: AdminAccount; onClose: () => void }) {
  const approve = useConvexAction(api.accountActions.approve);
  const { stateName } = useReferenceNames();
  const [note, setNote] = useState("");
  const { account, openingOrder: order, licenses, verifiedLicenseStates: verified, eo, preferences } = data;

  const requested = [...new Set([...(preferences?.states ?? []), ...licenses.map((l) => l.state)])].sort();
  const dropped = requested.filter((s) => !verified.includes(s));
  const eoProblem = !eo ? "No E&O policy is on file." : eo.verificationStatus === "failed" ? "The E&O evidence failed review." : isPast(eo.expiresAt) ? "The E&O policy has expired." : null;
  const orderProblem = !order
    ? "This application has no opening purchase."
    : order.status !== "authorized" && order.status !== "paid"
      ? "The opening purchase has not been authorised yet — the applicant needs to add a card."
      : null;
  const blockers = [verified.length === 0 ? "Verify at least one state licence before approving." : null, eoProblem, orderProblem].filter(Boolean) as string[];

  const { submit, pending, error } = useModalSubmit(() => approve({ accountId: account._id, note: note.trim() || undefined }), {
    success: "Account approved",
    successBody: order ? `${formatMoney(order.totalCents)} captured, ${order.quantity} leads credited, lead flow live.` : undefined,
    onDone: onClose,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={`Approve ${account.name}`}
      subtitle="Capturing the card and crediting the opening lead purchase"
      footer={
        <ModalButtons
          onCancel={onClose}
          onConfirm={() => void submit()}
          label={order?.status === "paid" ? "Approve" : "Approve and capture"}
          variant="green"
          pending={pending}
          disabled={blockers.length > 0}
        />
      }
    >
      <DefinitionList
        items={[
          ["Opening purchase", order ? `${order.quantity} leads — ${formatMoney(order.totalCents)}, charged once${order.status === "paid" ? " (already captured)" : ""}` : "—"],
          [
            "Balance credited",
            order ? (
              <>
                {order.exclusiveQty} exclusive, {order.standardQty} standard <span className="xs">(no expiry)</span>
              </>
            ) : (
              "—"
            ),
          ],
          ["States requested", requested.join(", ") || "—"],
          ["Verified", verified.join(", ") || "None yet"],
          ["E&O", eo ? `${eo.carrier} · ${eo.verificationStatus}` : "Not on file"],
        ]}
      />

      {order?.provider === "mock" && order.status !== "paid" && (
        <div style={{ marginTop: "1rem" }}>
          <Alert kind="n">
            <b>Test payment (bypass).</b> Payments run in bypass mode on this deployment — the capture is simulated and no card is charged.
          </Alert>
        </div>
      )}

      {blockers.length > 0 ? (
        <div style={{ marginTop: "1rem" }}>
          <Alert kind="e">
            <b>This application cannot be approved yet.</b> {blockers.join(" ")}
          </Alert>
        </div>
      ) : dropped.length > 0 ? (
        <div style={{ marginTop: "1rem" }}>
          <Alert kind="w">
            <b>{dropped.map(stateName).join(", ")} did not verify.</b> Approving now activates the account with only the verified states eligible. The
            agent is told which states were dropped and why — they are not silently ignored.
          </Alert>
        </div>
      ) : (
        <div style={{ marginTop: "1rem" }}>
          <Alert kind="s">All states verified. Clean approval.</Alert>
        </div>
      )}

      {blockers.length === 0 && eo?.verificationStatus === "unverified" && (
        <div style={{ marginTop: ".6rem" }}>
          <Alert kind="w">The E&amp;O evidence has not been reviewed yet. Review it on the Compliance tab before approving if you can.</Alert>
        </div>
      )}

      <Field label="Internal note" help="Optional. Recorded on the account status change." className="mt-4">
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Licences checked against state lookups" />
      </Field>
      <ModalError error={error} />
    </Modal>
  );
}
