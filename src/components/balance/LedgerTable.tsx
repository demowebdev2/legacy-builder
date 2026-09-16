"use client";

import type { Doc } from "@convex/_generated/dataModel";
import { DataTable } from "@/components/ui/Display";
import { formatDate } from "@/domain/format";

export const LEDGER_ENTRY_LABELS: Record<Doc<"leadBalanceLedger">["entryType"], string> = {
  PURCHASE: "Leads purchased",
  AUTO_RELOAD: "Auto-reload",
  ASSIGNMENT: "Lead released",
  DISPUTE_RETURN: "Dispute upheld",
  REVOCATION_RETURN: "Assignment revoked",
  ADMIN_ADJUSTMENT: "Adjustment",
  REFUND_REVERSAL: "Refund reversal",
  REVERSAL: "Correction",
};

/**
 * Prototype ledger table. `balanceAfter` is the per-type running balance stored on each immutable row.
 * `showReference` adds the admin columns (reason, recorded by).
 */
export function LedgerTable({
  rows,
  admin,
  footer,
  empty,
}: {
  rows: Array<Doc<"leadBalanceLedger">>;
  admin?: boolean;
  footer?: React.ReactNode;
  empty?: React.ReactNode;
}) {
  const columns = admin
    ? [{ label: "When" }, { label: "Entry" }, { label: "Type" }, { label: "Amount", align: "right" as const }, { label: "Balance", align: "right" as const }, { label: "Reason" }, { label: "By" }]
    : [{ label: "When" }, { label: "Entry" }, { label: "Type" }, { label: "Amount", align: "right" as const }, { label: "Balance", align: "right" as const }];
  return (
    <DataTable columns={columns} isEmpty={rows.length === 0} empty={empty} footer={footer} flush caption="Lead balance ledger">
      {rows.map((e) => (
        <tr key={e._id}>
          <td className="sm nowrap">{formatDate(e.createdAt)}</td>
          <td>
            <span className="nm">{LEDGER_ENTRY_LABELS[e.entryType]}</span>
            {!admin && <span className="tsub">{e.reason}</span>}
          </td>
          <td className="sm">{e.leadType === "exclusive" ? "Exclusive" : "Standard"}</td>
          <td className="tr" style={{ fontWeight: 700, color: e.delta > 0 ? "var(--green)" : "var(--red)" }}>
            {e.delta > 0 ? "+" : ""}
            {e.delta}
          </td>
          <td className="tr sm">{e.balanceAfter}</td>
          {admin && <td className="sm">{e.reason}</td>}
          {admin && <td className="sm">{e.createdByName}</td>}
        </tr>
      ))}
    </DataTable>
  );
}
