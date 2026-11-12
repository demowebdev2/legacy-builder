"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { ChatThread } from "@/components/chat/ChatThread";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { Id } from "@convex/_generated/dataModel";

/** Live chat with the consumer on this assignment. */
export function LeadChatCard({ assignmentId, readOnly }: { assignmentId: Id<"leadAssignments">; readOnly?: boolean }) {
  const thread = useQuery(api.messages.agentThread, { assignmentId });
  const send = useMutation(api.messages.agentSend);
  if (thread === null) return null;

  return (
    <Card>
      <CardHeader title="Messages" description={thread ? `Chat with ${thread.consumerName} in real time.` : undefined} />
      <CardBody>
        <ChatThread
          messages={thread?.messages}
          mine="agent"
          closed={readOnly ? "Messaging is disabled while your account is read-only." : thread?.closed}
          placeholder="Write a message…"
          emptyHint="No messages yet. Say hello — they see it the moment you send it."
          onSend={async (body) => void (await send({ assignmentId, body }))}
        />
      </CardBody>
    </Card>
  );
}
