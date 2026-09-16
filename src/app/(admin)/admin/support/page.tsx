"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@convex/_generated/api";
import { ModalButtons, ModalError, useModalSubmit, useStaffAccess } from "@/components/admin/accounts/kit";
import { PageHeader } from "@/components/layouts/PortalShell";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, DefinitionList } from "@/components/ui/Display";
import { Alert, EmptyState, LoadingBlock, PageLoading } from "@/components/ui/Feedback";
import { Checkbox, Field } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Modal";
import { LoadMore, Segmented, Tabs } from "@/components/ui/Navigation";
import { formatDate, timeAgo } from "@/domain/format";
import { useAction } from "@/hooks/useAction";

type Ticket = FunctionReturnType<typeof api.support.adminTickets>["page"][number];
type ContactMessage = FunctionReturnType<typeof api.support.contactMessages>["page"][number];
type TicketFilter = "open" | "answered" | "closed" | "all";

const excerpt = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

export default function SupportPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Support" />
          <PageLoading />
        </>
      }
    >
      <SupportView />
    </Suspense>
  );
}

function SupportView() {
  const access = useStaffAccess();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const canManage = access.can("support.manage");
  const counts = useQuery(api.reports.adminNavCounts, canManage ? {} : "skip");

  if (!canManage) {
    return (
      <>
        <PageHeader title="Support" />
        <div className="card">
          <EmptyState icon="lock" title="No access to support">
            Support tickets and contact messages are handled by Admin and Support staff.
          </EmptyState>
        </div>
      </>
    );
  }

  const tab = params.get("tab") === "contact" ? "contact" : "tickets";
  const statusParam = params.get("status");
  const filter: TicketFilter = statusParam === "answered" || statusParam === "closed" || statusParam === "all" ? statusParam : "open";
  const setFilter = (value: TicketFilter) => {
    const next = new URLSearchParams(params.toString());
    if (value === "open") next.delete("status");
    else next.set("status", value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <>
      <PageHeader title="Support" />
      <Tabs
        label="Support queues"
        active={tab}
        items={[
          { key: "tickets", label: "Tickets", count: counts?.support || null, href: "/admin/support" },
          { key: "contact", label: "Contact messages", href: "/admin/support?tab=contact" },
        ]}
      />
      {tab === "tickets" ? <TicketsView filter={filter} onFilter={setFilter} /> : <ContactView />}
    </>
  );
}

function TicketsView({ filter, onFilter }: { filter: TicketFilter; onFilter: (value: TicketFilter) => void }) {
  const tickets = usePaginatedQuery(api.support.adminTickets, filter === "all" ? {} : { status: filter }, { initialNumItems: 25 });
  const [responding, setResponding] = useState<Ticket | null>(null);

  return (
    <>
      <div className="fb">
        <Segmented<TicketFilter>
          label="Ticket status"
          value={filter}
          onChange={onFilter}
          options={[
            { value: "open", label: "Open" },
            { value: "answered", label: "Answered" },
            { value: "closed", label: "Closed" },
            { value: "all", label: "All" },
          ]}
        />
        <div className="spacer" />
        <span className="xs">Closure and data-export requests are highlighted — both have obligations attached.</span>
      </div>

      {tickets.status === "LoadingFirstPage" ? (
        <LoadingBlock rows={6} label="Loading tickets" />
      ) : (
        <DataTable
          caption="Support tickets"
          columns={[{ label: "Opened" }, { label: "Account" }, { label: "Topic" }, { label: "Message" }, { label: "Status" }, { label: "Actions", srOnly: true, align: "right" }]}
          isEmpty={tickets.results.length === 0}
          empty={
            <EmptyState icon="mail" title={filter === "open" ? "No open tickets" : "No tickets"}>
              {filter === "open" ? "Every ticket has a reply. New tickets from agents appear here." : "Nothing matches this filter."}
            </EmptyState>
          }
          footer={tickets.results.length ? <LoadMore status={tickets.status} count={tickets.results.length} onLoadMore={() => tickets.loadMore(25)} /> : undefined}
        >
          {tickets.results.map((t) => {
            const flagged = t.kind !== "general" && t.status !== "closed";
            return (
              <tr key={t._id} className={flagged ? "hl" : undefined}>
                <td className="sm nowrap">
                  {formatDate(t.createdAt)}
                  <span className="tsub">{timeAgo(t.createdAt)}</span>
                </td>
                <td>
                  <Link href={`/admin/accounts/${t.accountId}`} className="nm">
                    {t.accountName}
                  </Link>
                </td>
                <td className="sm">
                  <TicketKind ticket={t} />
                </td>
                <td className="sm" style={{ minWidth: 260, maxWidth: 360 }}>
                  {excerpt(t.message)}
                  {t.response && <span className="tsub">Replied {timeAgo(t.respondedAt)}: {excerpt(t.response, 80)}</span>}
                </td>
                <td>
                  <StatusBadge status={t.status} />
                </td>
                <td className="tr">
                  <Button variant={t.status === "open" ? "navy" : "out"} size="xs" onClick={() => setResponding(t)}>
                    {t.status === "open" ? "Respond" : "View"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
      {responding && <RespondModal ticket={responding} onClose={() => setResponding(null)} />}
    </>
  );
}

function TicketKind({ ticket }: { ticket: Ticket }) {
  if (ticket.kind === "closure_request") return <Badge tone="r">Closure request</Badge>;
  if (ticket.kind === "data_export") return <Badge tone="gold">Data export</Badge>;
  return <>{ticket.category}</>;
}

function RespondModal({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const respond = useMutation(api.support.respond);
  const [response, setResponse] = useState(ticket.response ?? "");
  const [close, setClose] = useState(ticket.kind === "general");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { submit, pending, error } = useModalSubmit(() => respond({ ticketId: ticket._id, response: response.trim(), close }), {
    success: close ? "Reply sent and ticket closed" : "Reply sent",
    successBody: "The agent is notified in their portal.",
    onDone: onClose,
  });
  const confirm = () => {
    if (response.trim().length < 3) {
      setFieldError("Write a response.");
      return;
    }
    setFieldError(null);
    void submit();
  };
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={ticket.kind === "closure_request" ? "Closure request" : ticket.kind === "data_export" ? "Data export request" : ticket.category}
      subtitle={`${ticket.accountName} · opened ${formatDate(ticket.createdAt, true)}`}
      footer={<ModalButtons onCancel={onClose} onConfirm={confirm} label={ticket.response ? "Update reply" : "Send reply"} pending={pending} />}
    >
      {ticket.kind === "closure_request" && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="w">
            <b>No automatic refund of unused balance.</b> Confirm the closure with the agent, then close the account from its page — the balance is frozen,
            not forfeited. Any refund is a manual finance exception.{" "}
            <Link className="link" href={`/admin/accounts/${ticket.accountId}`}>
              Open account →
            </Link>
          </Alert>
        </div>
      )}
      {ticket.kind === "data_export" && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert kind="i">
            <b>Data export request.</b> Prepare the export of this account&apos;s records and reply with how it will be delivered securely. Never paste
            personal data into this reply.
          </Alert>
        </div>
      )}
      <DefinitionList
        items={[
          ["Status", <StatusBadge key="st" status={ticket.status} />],
          ["Topic", <TicketKind key="kind" ticket={ticket} />],
          [
            "Message",
            <span key="msg" style={{ whiteSpace: "pre-wrap" }}>
              {ticket.message}
            </span>,
          ],
          !!ticket.respondedAt && ["Last reply", `${timeAgo(ticket.respondedAt)}`],
        ]}
      />
      <Field label="Your reply" required error={fieldError} className="mt-4" help="Shown to the agent in their support page and notifications.">
        <textarea value={response} maxLength={4000} rows={6} onChange={(e) => { setResponse(e.target.value); setFieldError(null); }} />
      </Field>
      <Checkbox checked={close} onChange={setClose}>
        <b>Close the ticket</b> — nothing further is needed from us.
      </Checkbox>
      <ModalError error={error} />
    </Modal>
  );
}

function ContactView() {
  const messages = usePaginatedQuery(api.support.contactMessages, {}, { initialNumItems: 25 });
  const markHandled = useMutation(api.support.markContactHandled);
  const [viewing, setViewing] = useState<ContactMessage | null>(null);
  const [handle, handling] = useAction((message: ContactMessage) => markHandled({ messageId: message._id }), { success: "Marked handled" });

  if (messages.status === "LoadingFirstPage") return <LoadingBlock rows={6} label="Loading contact messages" />;

  return (
    <>
      <DataTable
        caption="Contact form messages"
        columns={[{ label: "Received" }, { label: "From" }, { label: "Audience" }, { label: "Message" }, { label: "Status" }, { label: "Actions", srOnly: true, align: "right" }]}
        isEmpty={messages.results.length === 0}
        empty={
          <EmptyState icon="mail" title="No contact messages">
            Messages sent through the public contact form appear here.
          </EmptyState>
        }
        footer={messages.results.length ? <LoadMore status={messages.status} count={messages.results.length} onLoadMore={() => messages.loadMore(25)} /> : undefined}
      >
        {messages.results.map((m) => (
          <tr key={m._id}>
            <td className="sm nowrap">
              {formatDate(m.createdAt)}
              <span className="tsub">{timeAgo(m.createdAt)}</span>
            </td>
            <td className="sm">
              <span className="nm">{m.name}</span>
              <a className="tsub" href={`mailto:${m.email}`}>
                {m.email}
              </a>
              {m.phone && <span className="tsub">{m.phone}</span>}
            </td>
            <td>
              <Badge tone={m.audience === "agent" ? "navy" : m.audience === "consumer" ? "b" : "n"}>{m.audience}</Badge>
            </td>
            <td className="sm" style={{ minWidth: 260, maxWidth: 380 }}>
              {excerpt(m.message)}
            </td>
            <td>
              <StatusBadge status={m.status} />
            </td>
            <td className="tr">
              <div className="b-row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                <Button variant="ghost" size="xs" onClick={() => setViewing(m)}>
                  View
                </Button>
                {m.status === "new" && (
                  <Button variant="out" size="xs" icon="check" disabled={handling} onClick={() => void handle(m)}>
                    Mark handled
                  </Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
      {viewing && <ContactMessageModal message={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function ContactMessageModal({ message, onClose }: { message: ContactMessage; onClose: () => void }) {
  const markHandled = useMutation(api.support.markContactHandled);
  const { submit, pending, error } = useModalSubmit(() => markHandled({ messageId: message._id }), { success: "Marked handled", onDone: onClose });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Message from ${message.name}`}
      subtitle={`${message.audience} · ${formatDate(message.createdAt, true)}`}
      footer={
        message.status === "new" ? (
          <ModalButtons onCancel={onClose} onConfirm={() => void submit()} label="Mark handled" pending={pending} />
        ) : (
          <Button variant="out" size="s" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <DefinitionList
        items={[
          [
            "Email",
            <a key="email" className="link" href={`mailto:${message.email}`}>
              {message.email}
            </a>,
          ],
          !!message.phone && ["Phone", message.phone],
          ["Status", <StatusBadge key="st" status={message.status} />],
          [
            "Message",
            <span key="msg" style={{ whiteSpace: "pre-wrap" }}>
              {message.message}
            </span>,
          ],
        ]}
      />
      <div style={{ marginTop: "1rem" }}>
        <Alert kind="n">Reply from your mailbox. Consumer messages may contain personal data — do not forward them outside the team.</Alert>
      </div>
      <ModalError error={error} />
    </Modal>
  );
}
