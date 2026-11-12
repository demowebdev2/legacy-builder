"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Alert, Skeleton } from "@/components/ui/Feedback";
import { formatDate } from "@/domain/format";
import { errorMessage } from "@/lib/errors";

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_ATTACHMENTS = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif";

export interface ChatAttachment {
  name: string;
  type: string;
  size: number;
  url: string | null;
}

const readableSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

export interface ChatMessage {
  id: string;
  fromAgent: boolean;
  senderName: string;
  body: string;
  createdAt: number;
  attachment?: ChatAttachment | null;
}

function Attachment({ attachment }: { attachment: ChatAttachment }) {
  if (!attachment.url) return <span className="chat-file">{attachment.name} (unavailable)</span>;
  return (
    <a className="chat-img" href={attachment.url} target="_blank" rel="noopener noreferrer">
      <Image src={attachment.url} alt={attachment.name} width={320} height={240} unoptimized />
    </a>
  );
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
  onSend: (body: string, file: File | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
    if ((!body && !file) || pending) return;
    if (file && file.size > MAX_ATTACHMENT_BYTES) {
      setError("Images must be 10 MB or smaller.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSend(body, file);
      setDraft("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
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
                {message.attachment && <Attachment attachment={message.attachment} />}
                {message.body && <div className="chat-b">{message.body}</div>}
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
          {file && (
            <div className="chat-pick">
              <Icon name="doc" />
              <span>
                {file.name} <small>{readableSize(file.size)}</small>
              </span>
              <button
                type="button"
                aria-label="Remove attachment"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                <Icon name="x" />
              </button>
            </div>
          )}
          <div className="chat-actions">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_ATTACHMENTS}
              className="sr-only"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                if (picked && !picked.type.startsWith("image/")) {
                  setError("Only image files can be attached.");
                  event.target.value = "";
                  return;
                }
                setError(null);
                setFile(picked);
              }}
            />
            <Button type="button" variant="out" size="s" icon="plus" onClick={() => fileRef.current?.click()}>
              Add photo
            </Button>
            <Button type="submit" variant="navy" loading={pending} disabled={!draft.trim() && !file}>
              Send
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
