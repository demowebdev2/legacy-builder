"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { ChatThread } from "@/components/chat/ChatThread";
import type { Id } from "@convex/_generated/dataModel";

/** Consumer side of the lead chat — one thread per agent holding the request. */
export function ConsumerChat({ reference, token }: { reference: string; token: string }) {
  const threads = useQuery(api.messages.consumerThreads, { reference, token });
  const send = useMutation(api.messages.consumerSend);
  const [active, setActive] = useState<Id<"leadAssignments"> | null>(null);

  if (!threads || threads.length === 0) return null;
  const current = threads.find((t) => t.assignmentId === active) ?? threads[0];

  return (
    <div className="card card-p" style={{ marginTop: "1.2rem", textAlign: "left" }}>
      <h2 className="h3" style={{ marginBottom: ".3rem" }}>
        Message your agent
      </h2>
      <p className="sm" style={{ marginBottom: "1rem" }}>
        Ask a question here and {threads.length > 1 ? "the agent" : current.agentName} will see it straight away. Keep this page bookmarked to come back to
        the conversation.
      </p>

      {threads.length > 1 && (
        <div className="b-row" style={{ marginBottom: "1rem" }}>
          {threads.map((thread) => (
            <button
              key={thread.assignmentId}
              type="button"
              className={thread.assignmentId === current.assignmentId ? "jump-tab" : "jump-tab"}
              aria-current={thread.assignmentId === current.assignmentId ? "page" : undefined}
              onClick={() => setActive(thread.assignmentId)}
            >
              {thread.agentName}
            </button>
          ))}
        </div>
      )}

      <ChatThread
        messages={current.messages}
        mine="consumer"
        closed={current.closed}
        placeholder={`Message ${current.agentName}…`}
        emptyHint={`No messages yet. Ask ${current.agentName} anything about your cover.`}
        onSend={async (body) => void (await send({ reference, token, assignmentId: current.assignmentId, body }))}
      />
    </div>
  );
}
