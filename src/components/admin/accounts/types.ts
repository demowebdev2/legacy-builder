import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

/** `accounts.adminGet` payload for a found account. */
export type AdminAccount = NonNullable<FunctionReturnType<typeof api.accounts.adminGet>>;

export type StaffAccess = {
  role: string | null;
  can: (permission: import("@/domain/permissions").Permission) => boolean;
};

/** True when the timestamp is in the past (kept out of render bodies so components stay pure). */
export function isPast(timestamp: number): boolean {
  return timestamp <= Date.now();
}
