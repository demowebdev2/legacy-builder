"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/layouts/PortalShell";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { CheckList } from "@/components/ui/Display";
import { EmptyState, LoadingBlock } from "@/components/ui/Feedback";
import { Field, Select } from "@/components/ui/Form";
import { formatDate, timeAgo } from "@/domain/format";
import { useAction } from "@/hooks/useAction";

/** Must match `TICKET_CATEGORIES` in convex/support.ts (prototype V.support options). */
const CATEGORIES = ["A lead I cannot work", "Billing or invoice", "Licence or E&O", "Buying leads or my balance", "Something else"];

export default function SupportPage() {
  const tickets = useQuery(api.support.myTickets);
  const openTicket = useMutation(api.support.openTicket);
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [touched, setTouched] = useState(false);
  const [send, sending] = useAction(
    async () => {
      await openTicket({ category, message: message.trim(), kind: "general" });
      setCategory("");
      setMessage("");
      setTouched(false);
    },
    { success: "Ticket sent", successBody: "It appears under past tickets with its status." },
  );

  const errors = {
    category: category ? null : "Choose what this is about.",
    message: message.trim().length >= 10 ? null : "Tell us a little more (at least 10 characters).",
  };

  return (
    <>
      <PageHeader title="Support" />
      <div className="g g-2-1">
        <Card>
          <CardHeader title="Open a ticket" />
          <CardBody>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                setTouched(true);
                if (!errors.category && !errors.message) void send();
              }}
            >
              <Field label="What is this about?" required error={touched ? errors.category : null}>
                <Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Select…" options={CATEGORIES} />
              </Field>
              <Field label="Message" required error={touched ? errors.message : null} help="For a specific lead or purchase, include its reference (LB-… or LB-INV-…).">
                <textarea placeholder="Tell us what is happening" value={message} maxLength={4000} rows={6} onChange={(e) => setMessage(e.target.value)} />
              </Field>
              <Button type="submit" variant="navy" size="s" loading={sending}>
                Send
              </Button>
            </form>
          </CardBody>
        </Card>

        <div className="stack">
          <Card>
            <CardHeader title="Faster than email" />
            <CardBody>
              <CheckList
                items={[
                  { text: "Bad lead? Raise a dispute on the lead itself — it is decided within two business days." },
                  { text: "Billing questions are usually answered by the receipts under Billing & purchases." },
                  { text: "Licence lapses clear once renewal evidence is uploaded under Licences & compliance and verified." },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Past tickets" />
            {tickets === undefined ? (
              <CardBody>
                <LoadingBlock rows={3} />
              </CardBody>
            ) : tickets.length === 0 ? (
              <EmptyState icon="mail" title="No tickets">
                Nothing open. Anything you send appears here with its status.
              </EmptyState>
            ) : (
              <CardBody className="stack" style={{ gap: ".6rem" }}>
                {tickets.map((t) => (
                  <div key={t._id} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-s)", padding: ".75rem .85rem" }}>
                    <div className="row-b" style={{ gap: ".5rem" }}>
                      <span className="strong">{t.category}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="xs">
                      {formatDate(t.createdAt, true)} · {timeAgo(t.createdAt)}
                    </div>
                    <p className="sm" style={{ marginTop: ".35rem", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
                      {t.message.length > 220 ? `${t.message.slice(0, 220)}…` : t.message}
                    </p>
                    {t.response && (
                      <div className="note note-n" style={{ marginTop: ".55rem", display: "block" }}>
                        <div className="xs" style={{ fontWeight: 700, marginBottom: ".2rem" }}>
                          Legacy Builders replied{t.respondedAt ? ` · ${formatDate(t.respondedAt, true)}` : ""}
                        </div>
                        <div style={{ whiteSpace: "pre-line" }}>{t.response}</div>
                      </div>
                    )}
                  </div>
                ))}
              </CardBody>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
