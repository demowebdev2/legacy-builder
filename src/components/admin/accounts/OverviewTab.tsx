"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DefinitionList, StatCard } from "@/components/ui/Display";
import { Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { daysUntil, formatDate } from "@/domain/format";
import { formatMoney } from "@/domain/money";
import { US_TIMEZONES } from "@/domain/time";
import { ModalButtons, ModalError, useModalSubmit, useReferenceNames } from "./kit";
import type { AdminAccount, StaffAccess } from "./types";

const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function OverviewTab({ data, access }: { data: AdminAccount; access: StaffAccess }) {
  const { account, metrics, preferences: prefs, eo, tpmo, disputes } = data;
  const { stateName, coverageName } = useReferenceNames();
  const [editing, setEditing] = useState(false);
  const contact = metrics.contactRate;
  const eoDays = eo ? daysUntil(eo.expiresAt) : null;
  const principal = data.members.find((m) => m.seatRole === "principal");

  return (
    <>
      <div className="g g4" style={{ marginBottom: "1.25rem" }}>
        <StatCard label="Leads, 30 days" value={metrics.leads30d} icon="inbox" />
        <StatCard
          label="Contact rate"
          value={contact == null ? "—" : `${Math.round(contact * 100)}%`}
          icon="phone"
          accent={contact == null ? null : contact > 0.7 ? "green" : contact < 0.5 ? "red" : null}
          sub="Last 90 days"
        />
        <StatCard label="Lifetime value" value={formatMoney(metrics.spendCents)} icon="money" accent="gold" sub={`${metrics.leadsBought} leads bought`} />
        <StatCard label="Disputes" value={disputes.total} icon="flow" sub={`${disputes.upheld} upheld · ${disputes.pending} pending`} />
      </div>

      <div className="g g2">
        <Card>
          <CardHeader
            title="Details"
            actions={
              access.can("accounts.manage") ? (
                <Button variant="out" size="s" icon="edit" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              ) : undefined
            }
          />
          <CardBody>
            <DefinitionList
              items={[
                [
                  "Contact",
                  <>
                    <a className="link" href={`mailto:${account.email}`}>
                      {account.email}
                    </a>
                    <br />
                    {account.phone}
                  </>,
                ],
                ["Business", account.businessName || account.name],
                account.type === "agency" && ["Principal", account.principalName ?? principal?.name ?? "—"],
                account.type === "agency" && !!account.producerCountBand && ["Producers", account.producerCountBand],
                ["Location", account.city || "—"],
                ["Resident state", stateName(account.residentState)],
                ["Timezone", <span key="tz" className="mono xs">{account.timezone}</span>],
                ["Joined", formatDate(account.appliedAt)],
                !!account.approvedAt && ["Approved", formatDate(account.approvedAt)],
                ["Card on file", account.cardLast4 ? `${account.cardBrand ?? "Card"} ending ${account.cardLast4}` : "None"],
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Distribution profile" />
          <CardBody>
            <DefinitionList
              items={[
                [
                  "Lead balance",
                  <>
                    {metrics.balance.exclusive} exclusive · {metrics.balance.standard} standard <span className="xs">(no expiry)</span>
                  </>,
                ],
                [
                  "Auto-reload",
                  prefs?.autoReloadEnabled ? `On — ${prefs.autoReloadQuantity} leads at a balance of ${prefs.autoReloadThreshold}` : "Off",
                ],
                account.declinedPurchaseOutstanding && ["Declined purchase", <span key="dec" style={{ color: "var(--red)" }}>Outstanding — eligibility held</span>],
                ["States", prefs?.states.length ? prefs.states.map(stateName).join(", ") : "—"],
                ["Products", prefs?.coverageTypes.length ? prefs.coverageTypes.map(coverageName).join(", ") : "—"],
                ["Daily pace", prefs ? `${prefs.dailyPace} · ${data.releasedLast24h} released in the last 24h` : "—"],
                ["Hours", prefs ? `${hour(prefs.receivingStartHour)} – ${hour(prefs.receivingEndHour)}` : "—"],
                ["Paused", prefs?.paused ? `Yes${prefs.pausedUntil ? `, until ${formatDate(prefs.pausedUntil)}` : ""}` : "No"],
                [
                  "E&O",
                  eo ? (
                    <>
                      {eo.carrier} ·{" "}
                      {eoDays != null && eoDays < 0 ? (
                        <span style={{ color: "var(--red)" }}>lapsed</span>
                      ) : (
                        <span style={eoDays != null && eoDays < 60 ? { color: "var(--amber)" } : undefined}>{eoDays} days left</span>
                      )}
                      {eo.verificationStatus !== "verified" && <span className="xs"> · {eo.verificationStatus}</span>}
                    </>
                  ) : (
                    <span style={{ color: "var(--red)" }}>Not on file</span>
                  ),
                ],
                ["Medicare TPMO", tpmo.approved ? "Approved" : tpmo.pending ? "Requested — awaiting review" : "Not approved"],
                ["Quality hold", account.qualityHold ? <span key="hold" style={{ color: "var(--red)" }}>Yes</span> : "No"],
              ]}
            />
          </CardBody>
        </Card>
      </div>

      {editing && <EditDetailsModal data={data} onClose={() => setEditing(false)} />}
    </>
  );
}

function EditDetailsModal({ data, onClose }: { data: AdminAccount; onClose: () => void }) {
  const update = useMutation(api.accounts.updateOperationalDetails);
  const [timezone, setTimezone] = useState(data.account.timezone);
  const [city, setCity] = useState(data.account.city ?? "");
  const options: Array<{ value: string; label: string }> = US_TIMEZONES.map((t) => ({ value: t.value, label: `${t.label} (${t.value})` }));
  if (!options.some((o) => o.value === data.account.timezone)) options.unshift({ value: data.account.timezone, label: data.account.timezone });
  const { submit, pending, error } = useModalSubmit(() => update({ accountId: data.account._id, timezone, city: city.trim() || undefined }), {
    success: "Details updated",
    onDone: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit operational details"
      subtitle={data.account.name}
      footer={<ModalButtons onCancel={onClose} onConfirm={() => void submit()} label="Save" pending={pending} />}
    >
      <Field label="Timezone" required help="Receiving hours and the daily pace reset are evaluated in this timezone.">
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Location">
        <input value={city} maxLength={80} placeholder="Mobile, AL" onChange={(e) => setCity(e.target.value)} />
      </Field>
      <ModalError error={error} />
    </Modal>
  );
}
