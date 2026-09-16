"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@convex/_generated/api";

export type Me = NonNullable<FunctionReturnType<typeof api.users.me>>;

/** Only same-site relative paths are honoured for ?next= (prevents open redirects). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

export function destinationFor(me: Me, next: string | null): string {
  if (me.kind === "staff") {
    if (me.mfa?.required && (!me.mfa.enrolled || !me.mfa.verified)) return "/auth/two-factor";
    return next?.startsWith("/admin") ? next : "/admin";
  }
  if (me.kind === "account" && me.account) {
    if (["pending_verification", "action_required", "rejected"].includes(me.account.status)) return "/apply/pending";
    return next?.startsWith("/agent") ? next : "/agent";
  }
  return next?.startsWith("/auth/invite") ? next : "/apply";
}

/** Once `active` and the viewer has loaded, route them to the right surface. */
export function usePostLoginRedirect(active: boolean, next: string | null) {
  const me = useQuery(api.users.me, active ? {} : "skip");
  const router = useRouter();
  useEffect(() => {
    if (!active || !me) return;
    router.replace(destinationFor(me, safeNext(next)));
  }, [active, me, next, router]);
  return me;
}
