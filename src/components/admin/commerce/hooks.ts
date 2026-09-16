"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { api } from "@convex/_generated/api";
import { type Permission, roleHasPermission } from "@/domain/permissions";

/** Current staff viewer plus a permission check that mirrors the server matrix (UI hiding only). */
export function useStaff() {
  const me = useQuery(api.users.me);
  const staff = me?.kind === "staff" ? me : null;
  const role = staff?.role ?? null;
  const can = useCallback((permission: Permission) => roleHasPermission(role, permission), [role]);
  return { loading: me === undefined, staff, can };
}

/** `?tab=` URL state (linkable views). The fallback tab is kept out of the URL. */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T, param = "tab") {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = searchParams.get(param);
  const tab = raw && (tabs as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const setTab = useCallback(
    (key: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (key === fallback) next.delete(param);
      else next.set(param, key);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [fallback, param, pathname, router, searchParams],
  );
  return [tab, setTab] as const;
}
