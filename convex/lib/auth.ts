import { getAuthSessionId, getAuthUserId } from "@convex-dev/auth/server";
import type { AccountRole, StaffRole } from "../../src/domain/constants";
import { type Permission, roleHasPermission } from "../../src/domain/permissions";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { staffMfaRequired } from "./env";
import { appError, forbidden, notFound, unauthenticated } from "./errors";

type Ctx = QueryCtx | MutationCtx;

export const STAFF_ROLE_SET = new Set<string>(["ADMIN", "SUPPORT", "FINANCE", "CONTENT"]);
export const ACCOUNT_ROLE_SET = new Set<string>(["AGENT", "AGENCY_PRINCIPAL", "PRODUCER"]);

export interface Viewer {
  userId: Id<"users">;
  user: Doc<"users">;
  sessionId: Id<"authSessions"> | null;
  name: string;
}

export interface StaffViewer extends Viewer {
  role: StaffRole;
}

export interface AccountViewer extends Viewer {
  role: AccountRole;
  account: Doc<"accounts">;
  /** Seat for agency principals and producers; null for individual agents. */
  member: Doc<"agencyMembers"> | null;
}

export function displayName(user: Doc<"users">): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return full || user.name || user.email || "Unknown user";
}

export async function getViewer(ctx: Ctx): Promise<Viewer | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  if (!user || user.disabled) return null;
  const sessionId = await getAuthSessionId(ctx);
  return { userId, user, sessionId, name: displayName(user) };
}

export async function requireViewer(ctx: Ctx): Promise<Viewer> {
  const viewer = await getViewer(ctx);
  if (!viewer) throw unauthenticated();
  return viewer;
}

export function isStaffRole(role: string | undefined): role is StaffRole {
  return !!role && STAFF_ROLE_SET.has(role);
}

export function isAccountRole(role: string | undefined): role is AccountRole {
  return !!role && ACCOUNT_ROLE_SET.has(role);
}

/** Staff check that also enforces two-factor verification for the current session when required. */
export async function requireStaff(
  ctx: Ctx,
  permission: Permission,
  options: { skipMfa?: boolean } = {},
): Promise<StaffViewer> {
  const viewer = await requireViewer(ctx);
  const role = viewer.user.role;
  if (!isStaffRole(role)) throw forbidden("This area is for Legacy Builders staff.");
  if (!roleHasPermission(role, permission)) throw forbidden();
  if (!options.skipMfa) await assertStaffMfa(ctx, viewer);
  return { ...viewer, role };
}

export async function getStaffViewer(ctx: Ctx, permission: Permission): Promise<StaffViewer | null> {
  const viewer = await getViewer(ctx);
  const role = viewer?.user.role;
  if (!viewer || !isStaffRole(role) || !roleHasPermission(role, permission)) return null;
  return { ...viewer, role };
}

export async function assertStaffMfa(ctx: Ctx, viewer: Viewer): Promise<void> {
  if (!staffMfaRequired()) return;
  const factor = await ctx.db
    .query("mfaFactors")
    .withIndex("by_user", (q) => q.eq("userId", viewer.userId))
    .unique();
  if (!factor?.confirmedAt) throw appError("MFA_SETUP_REQUIRED", "Set up two-factor authentication to continue.");
  if (!viewer.sessionId) throw appError("MFA_REQUIRED", "Two-factor verification required.");
  const sessionId = viewer.sessionId;
  const verified = await ctx.db
    .query("mfaSessions")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .unique();
  if (!verified) throw appError("MFA_REQUIRED", "Two-factor verification required.");
}

export type AccountCapability =
  | "leads.read"
  | "leads.work"
  | "leads.handout"
  | "balance.read"
  | "purchase"
  | "preferences"
  | "compliance"
  | "team"
  | "dispute"
  | "notifications"
  | "support";

const CAPABILITIES: Record<AccountRole, ReadonlySet<AccountCapability>> = {
  AGENT: new Set<AccountCapability>([
    "leads.read",
    "leads.work",
    "balance.read",
    "purchase",
    "preferences",
    "compliance",
    "dispute",
    "notifications",
    "support",
  ]),
  AGENCY_PRINCIPAL: new Set<AccountCapability>([
    "leads.read",
    "leads.work",
    "leads.handout",
    "balance.read",
    "purchase",
    "preferences",
    "compliance",
    "team",
    "dispute",
    "notifications",
    "support",
  ]),
  PRODUCER: new Set<AccountCapability>(["leads.read", "leads.work", "dispute", "notifications", "support", "balance.read"]),
};

export function accountRoleCan(role: AccountRole, capability: AccountCapability): boolean {
  return CAPABILITIES[role].has(capability);
}

/**
 * Resolves the caller's own account. The account is ALWAYS derived from the authenticated user,
 * never from a client-supplied id.
 */
export async function requireAccountViewer(
  ctx: Ctx,
  capability: AccountCapability,
  options: { allowPending?: boolean } = {},
): Promise<AccountViewer> {
  const viewer = await requireViewer(ctx);
  const role = viewer.user.role;
  if (!isAccountRole(role) || !viewer.user.accountId) throw forbidden("No agent account is linked to this login.");
  const account = await ctx.db.get(viewer.user.accountId);
  if (!account) throw notFound("Account");
  if (!options.allowPending && (account.status === "pending_verification" || account.status === "rejected")) {
    throw forbidden("Your application has not been approved yet.");
  }
  if (!accountRoleCan(role, capability)) throw forbidden();
  let member: Doc<"agencyMembers"> | null = null;
  if (role !== "AGENT") {
    member = await ctx.db
      .query("agencyMembers")
      .withIndex("by_user", (q) => q.eq("userId", viewer.userId))
      .unique();
    if (!member || member.accountId !== account._id || member.status === "deactivated") {
      throw forbidden("Your seat on this agency is not active.");
    }
  }
  return { ...viewer, role, account, member };
}

export async function getAccountViewer(ctx: Ctx, capability: AccountCapability): Promise<AccountViewer | null> {
  try {
    return await requireAccountViewer(ctx, capability);
  } catch {
    return null;
  }
}

const READ_ONLY_STATUSES = new Set(["blocked", "suspended", "closed"]);

/** Blocked / suspended / closed accounts keep read access; most writes are refused. */
export function assertAccountWritable(account: Doc<"accounts">, what = "This change"): void {
  if (READ_ONLY_STATUSES.has(account.status)) {
    throw appError("READ_ONLY", `${what} is disabled while your account is ${account.status}.`);
  }
}

export function isAccountReadOnly(account: Doc<"accounts">): boolean {
  return READ_ONLY_STATUSES.has(account.status);
}

/** Producers may only see assignments that were handed to their seat. */
export function canViewAssignment(viewer: AccountViewer, assignment: Doc<"leadAssignments">): boolean {
  if (assignment.accountId !== viewer.account._id) return false;
  if (viewer.role === "PRODUCER") return !!viewer.member && assignment.producerMemberId === viewer.member._id;
  return true;
}

export type Actor =
  | { kind: "user"; userId: Id<"users">; name: string; role: string }
  | { kind: "system"; name?: string };

export function actorFromViewer(viewer: Viewer): Actor {
  return { kind: "user", userId: viewer.userId, name: viewer.name, role: viewer.user.role ?? "USER" };
}

export const SYSTEM_ACTOR: Actor = { kind: "system", name: "System" };
