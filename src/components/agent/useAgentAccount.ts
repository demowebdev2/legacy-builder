"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";

/**
 * The signed-in agent's chrome data (`users.me`). The agent layout already subscribes to the same query,
 * so this resolves from the client cache. Returns `undefined` while loading and `null` if the login has no
 * account (the layout redirects in that case).
 */
export function useAgentAccount() {
  const me = useQuery(api.users.me);
  if (me === undefined) return undefined;
  if (!me || me.kind !== "account" || !me.account) return null;
  const role = me.role;
  return {
    me,
    account: me.account,
    role,
    producer: role === "PRODUCER",
    principal: role === "AGENCY_PRINCIPAL",
    readOnly: me.account.readOnly,
    active: me.account.status === "active",
  };
}

export type AgentAccount = NonNullable<ReturnType<typeof useAgentAccount>>;

/** A render-stable "now" captured once per mount (for relative dates that do not need to tick). */
export function useMountTime() {
  const [now] = useState(() => Date.now());
  return now;
}
