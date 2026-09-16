import type { StaffRole } from "./constants";

/**
 * Staff permission matrix. Enforced in Convex (`convex/lib/auth.ts`). The admin UI uses the same
 * table only to hide controls a user cannot use — hiding is never the security boundary.
 */
export const PERMISSIONS = [
  "accounts.read",
  "accounts.manage",
  "licenses.verify",
  "tpmo.decide",
  "leads.read",
  "leads.pii",
  "leads.manage",
  "disputes.read",
  "disputes.decide",
  "ledger.read",
  "ledger.adjust",
  "payments.read",
  "refunds.issue",
  "purchases.retry",
  "pricing.manage",
  "distribution.read",
  "distribution.manage",
  "reports.read",
  "cms.manage",
  "media.manage",
  "legal.draft",
  "legal.publish",
  "users.manage",
  "audit.read",
  "suppression.read",
  "suppression.manage",
  "settings.read",
  "settings.manage",
  "support.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  ADMIN: ALL,
  SUPPORT: [
    "accounts.read",
    "accounts.manage",
    "licenses.verify",
    "tpmo.decide",
    "leads.read",
    "leads.pii",
    "leads.manage",
    "disputes.read",
    "disputes.decide",
    "ledger.read",
    "distribution.read",
    "reports.read",
    "audit.read",
    "suppression.read",
    "suppression.manage",
    "settings.read",
    "support.manage",
  ],
  FINANCE: [
    "accounts.read",
    "leads.read",
    "disputes.read",
    "ledger.read",
    "ledger.adjust",
    "payments.read",
    "refunds.issue",
    "purchases.retry",
    "pricing.manage",
    "distribution.read",
    "reports.read",
    "audit.read",
    "settings.read",
  ],
  CONTENT: ["cms.manage", "media.manage", "legal.draft", "settings.read"],
};

export function roleHasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const list = ROLE_PERMISSIONS[role as StaffRole];
  return !!list && list.includes(permission);
}

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  ADMIN: "Everything, including settings, distribution and legal publishing.",
  SUPPORT: "Accounts, leads, disputes, licences and suppression. No finance writes, no settings.",
  FINANCE: "Payments, purchases, refunds, pricing, ledger adjustments and reports. Leads read-only.",
  CONTENT: "CMS pages, FAQs, media and legal drafts. Cannot publish legal documents.",
};
