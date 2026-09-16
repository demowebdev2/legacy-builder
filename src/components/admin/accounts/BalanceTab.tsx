"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { BalanceCard } from "@/components/balance/BalanceCard";
import { LedgerTable } from "@/components/balance/LedgerTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { DataTable, StatCard } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock, Skeleton } from "@/components/ui/Feedback";
import { LoadMore } from "@/components/ui/Navigation";
import { formatDate } from "@/domain/format";
import { AdjustLeadsModal } from "./AdjustLeadsModal";
import { NotesModal } from "./kit";
import type { AdminAccount, StaffAccess } from "./types";

type Entry = Doc<"leadBalanceLedger">;

export function BalanceTab({ data, access }: { data: AdminAccount; access: StaffAccess }) {
  const accountId = data.account._id;
  const ledger = usePaginatedQuery(api.ledger.accountLedger, { accountId }, { initialNumItems: 25 });
  const recon = useQuery(api.ledger.reconcile, { accountId });
  const [adjusting, setAdjusting] = useState(false);
  const [reversing, setReversing] = useState<Entry | null>(null);
  const canAdjust = access.can("ledger.adjust");
  const b = data.metrics.balance;
  const pct = b.issued ? Math.round((b.total / b.issued) * 100) : 0;

  const reversed = new Set(ledger.results.filter((e) => e.reversesEntryId).map((e) => e.reversesEntryId as string));
  const adjustments = ledger.results.filter((e) => e.entryType === "ADMIN_ADJUSTMENT");

  return (
    <>
      <div className="g g3" style={{ marginBottom: "1.25rem" }}>
        <StatCard
          label="Leads remaining"
          value={b.total}
          unit={`of ${b.issued} received`}
          icon="coin"
          accent="gold"
          meter={pct}
          meterTone={pct < 25 ? "red" : "gold"}
          sub={`${b.purchased} bought · ${Math.max(0, b.issued - b.purchased)} granted or returned · ${b.delivered} delivered`}
        />
        <BalanceCard type="exclusive" remaining={b.exclusive} issued={b.exclusiveIssued} />
        <BalanceCard type="standard" remaining={b.standard} issued={b.standardIssued} />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        {recon === undefined ? (
          <Skeleton height={46} />
        ) : recon.inSync ? (
          <Alert kind="s">
            <b>Ledger and balance in sync.</b> {recon.ledger.entries} ledger entries sum to {recon.ledger.exclusive} exclusive and {recon.ledger.standard}{" "}
            standard — exactly the cached balance.
          </Alert>
        ) : (
          <Alert kind="e">
            <b>Balance drift detected.</b> The ledger sums to {recon.ledger.exclusive} exclusive and {recon.ledger.standard} standard, but the cached balance
            shows {recon.cached.exclusive} exclusive and {recon.cached.standard} standard. The ledger is authoritative — escalate to engineering before
            adjusting.
          </Alert>
        )}
      </div>

      <div className="b-row" style={{ marginBottom: "1rem" }}>
        {canAdjust && (
          <Button variant="out" size="s" icon="plus" onClick={() => setAdjusting(true)}>
            Adjust leads
          </Button>
        )}
        <span className="xs">
          Adjustments require a reason and are visible to the agent in their own ledger. Nothing in this ledger expires, and nothing is ever edited — corrections
          are compensating entries.
        </span>
      </div>

      {adjustments.length > 0 && (
        <Card style={{ marginBottom: "1.25rem" }}>
          <CardHeader title="Manual adjustments" description="Grants and removals made by staff. Reversing appends a compensating entry." />
          <DataTable
            flush
            caption="Manual adjustments"
            columns={[{ label: "When" }, { label: "Type" }, { label: "Amount", align: "right" }, { label: "Reason" }, { label: "By" }, { label: "Actions", align: "right", srOnly: true }]}
          >
            {adjustments.map((e) => (
              <tr key={e._id}>
                <td className="sm nowrap">{formatDate(e.createdAt, true)}</td>
                <td className="sm">{e.leadType === "exclusive" ? "Exclusive" : "Standard"}</td>
                <td className="tr" style={{ fontWeight: 700, color: e.delta > 0 ? "var(--green)" : "var(--red)" }}>
                  {e.delta > 0 ? "+" : ""}
                  {e.delta}
                </td>
                <td className="sm">{e.reason}</td>
                <td className="sm">{e.createdByName}</td>
                <td className="tr">
                  {reversed.has(e._id) ? (
                    <Badge tone="n">Reversed</Badge>
                  ) : canAdjust ? (
                    <Button variant="ghost" size="xs" icon="refresh" onClick={() => setReversing(e)}>
                      Reverse
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      )}

      {ledger.status === "LoadingFirstPage" ? (
        <LoadingBlock rows={6} label="Loading ledger" />
      ) : (
        <div className="card">
          <LedgerTable
            admin
            rows={ledger.results}
            empty={
              <EmptyState icon="coin" title="No ledger entries">
                The opening purchase is credited here when the application is approved.
              </EmptyState>
            }
            footer={ledger.results.length ? <LoadMore status={ledger.status} count={ledger.results.length} onLoadMore={() => ledger.loadMore(50)} /> : undefined}
          />
        </div>
      )}

      {adjusting && <AdjustLeadsModal data={data} onClose={() => setAdjusting(false)} />}
      {reversing && <ReverseEntryModal entry={reversing} onClose={() => setReversing(null)} />}
    </>
  );
}

function ReverseEntryModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const reverse = useMutation(api.ledger.reverse);
  const amount = `${entry.delta > 0 ? "+" : ""}${entry.delta} ${entry.leadType}`;
  return (
    <NotesModal
      title="Reverse this adjustment"
      subtitle={`${amount} · ${entry.reason}`}
      intro={
        <Alert kind="n">
          The original row is <b>never edited</b>. Reversing appends a compensating correction of {entry.delta > 0 ? "−" : "+"}
          {Math.abs(entry.delta)} {entry.leadType} linked to it, so the history stays intact and auditable.
          {entry.delta > 0 ? " It fails if those leads have already been used." : ""}
        </Alert>
      }
      label="Reason"
      placeholder="Granted to the wrong account."
      minLength={5}
      confirmLabel="Reverse adjustment"
      variant="red"
      success="Adjustment reversed"
      onSubmit={(reason) => reverse({ entryId: entry._id, reason })}
      onClose={onClose}
    />
  );
}
