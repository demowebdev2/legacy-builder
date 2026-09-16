"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@convex/_generated/api";
import { type Permission, roleHasPermission } from "@/domain/permissions";

/**
 * The signed-in staff member and a permission check. Used only to hide controls a role cannot use —
 * every Convex function enforces the same matrix server-side.
 */
export function useStaff() {
  const me = useQuery(api.users.me);
  const role = me?.kind === "staff" ? (me.role as string | null) : null;
  const can = useCallback((permission: Permission) => roleHasPermission(role, permission), [role]);
  return { me, role, can, loading: me === undefined };
}

/** A clock for relative times ("12m ago") that re-renders once a minute without reading Date.now() during render. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** URL search-param state (filters, tabs) so admin views are linkable. */
export function useSearchParamState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const update = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
  return [params, update] as const;
}

/** Debounces a value (search boxes → URL/query args). */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
