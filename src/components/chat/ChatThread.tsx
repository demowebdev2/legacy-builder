"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { formatDate } from "@/domain/format";
import { errorMessage } from "@/lib/errors";

export const MAX_MESSAGE_LENGTH = 2000;

export interface ChatMessage {
  id: string;
  fromAgent: boolean;
  senderName: string;
  body: string;
  createdAt: number;
}

/**
 * Live one-to-one thread for a lead assignment. `mine` says which side is reading, so the same
 * component renders for the agent and for the consumer.
 */
export function ChatThread({
  messages,
  mine,
  closed,
  placeholder,
  emptyHint,
  onSend,
}: {
  messages: ChatMessage[] | undefined;
  mine: "agent" | "consumer";
  closed?: string | null;
  placeholder: string;
  emptyHint: string;
  onSend: (body: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const count = messages?.length ?? 0;

  useEffect(() => {
    if (count) endRef.current?.scrollIntoView({ block: "nearest" });
  }, [count]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSend(body);
      setDraft("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="chat">
      <div className="chat-log">
        {messages === undefined ? (
          <>
            <Skeleton height={44} width="70%" />
            <Skeleton height={44} width="55%" className="mt-3" />
          </>
        ) : count === 0 ? (
          <p className="sm tc" style={{ margin: "auto", maxWidth: "36ch" }}>
            {emptyHint}
          </p>
        ) : (
          messages.map((message) => {
            const isMine = message.fromAgent === (mine === "agent");
            return (
              <div key={message.id} className={isMine ? "chat-m me" : "chat-m"}>
                <div className="chat-b">{message.body}</div>
                <div className="chat-meta">
                  {isMine ? "You" : message.senderName} · {formatDate(message.createdAt, true)}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {closed ? (
        <Alert kind="n">{closed}</Alert>
      ) : (
        <form onSubmit={submit} className="chat-form">
          {error && <Alert kind="e">{error}</Alert>}
          <textarea
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={placeholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) submit(event);
            }}
          />
          <Button type="submit" variant="navy" loading={pending} disabled={!draft.trim()}>
            Send
          </Button>
        </form>
      )}
    </div>
  );
}
