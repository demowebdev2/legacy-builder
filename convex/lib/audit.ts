import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { Actor } from "./auth";

/**
 * Append-only audit trail. This is the only writer for `auditLogs`; there is deliberately no update
 * or delete function anywhere in the codebase.
 */
export async function writeAudit(
  ctx: MutationCtx,
  actor: Actor,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    accountId?: Id<"accounts">;
    summary: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    actorUserId: actor.kind === "user" ? actor.userId : undefined,
    actorName: actor.kind === "user" ? actor.name : (actor.name ?? "System"),
    actorRole: actor.kind === "user" ? actor.role : "SYSTEM",
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    accountId: entry.accountId,
    summary: entry.summary,
    metadata: entry.metadata,
    createdAt: Date.now(),
  });
}
