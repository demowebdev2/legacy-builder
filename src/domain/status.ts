/** Status → badge mapping (prototype `ST_MAP`). Tone keys map to `.bg-*` classes. */

export type BadgeTone = "g" | "a" | "r" | "b" | "n" | "gold" | "navy";

export const STATUS_MAP: Record<string, readonly [BadgeTone, string]> = {
  // accounts
  active: ["g", "Active"],
  pending_verification: ["a", "Pending verification"],
  action_required: ["a", "Action required"],
  suspended: ["a", "Suspended"],
  blocked: ["r", "Blocked"],
  rejected: ["n", "Rejected"],
  closed: ["n", "Closed"],
  // assignments
  new: ["b", "New"],
  contacted: ["a", "Contacted"],
  qualified: ["gold", "Qualified"],
  sold: ["g", "Sold"],
  lost: ["n", "Lost"],
  revoked: ["n", "Revoked"],
  disputed: ["r", "Disputed"],
  // leads
  queued: ["b", "Queued"],
  assigned: ["g", "Assigned"],
  partially_assigned: ["gold", "Partially assigned"],
  unassigned_pending: ["a", "Unassigned"],
  unassignable: ["r", "Unassignable"],
  duplicate: ["n", "Duplicate"],
  out_of_area: ["n", "Out of area"],
  spam: ["n", "Spam"],
  suppressed: ["r", "Suppressed"],
  withdrawn: ["n", "Withdrawn"],
  // verification
  verified: ["g", "Verified"],
  unverified: ["a", "Unverified"],
  failed: ["r", "Failed"],
  expired: ["r", "Expired"],
  not_required: ["n", "n/a"],
  // generic
  pending: ["a", "Pending"],
  requested: ["a", "Requested"],
  approved: ["g", "Approved"],
  upheld: ["g", "Upheld"],
  published: ["g", "Published"],
  draft: ["a", "Draft"],
  pending_approval: ["b", "Awaiting approval"],
  superseded: ["n", "Superseded"],
  // payments & orders
  paid: ["g", "Paid"],
  succeeded: ["g", "Succeeded"],
  authorized: ["b", "Authorised"],
  refunded: ["n", "Refunded"],
  partially_refunded: ["n", "Part refunded"],
  canceled: ["n", "Cancelled"],
  requires_payment: ["a", "Awaiting payment"],
  // members
  invited: ["b", "Invited"],
  deactivated: ["n", "Deactivated"],
  // messages & tickets
  sent: ["g", "Sent"],
  bypassed: ["gold", "Bypassed"],
  open: ["a", "Open"],
  answered: ["b", "Answered"],
  handled: ["g", "Handled"],
  lifted: ["n", "Lifted"],
};

export function statusBadge(status: string): readonly [BadgeTone, string] {
  return STATUS_MAP[status] ?? ["n", status.replace(/_/g, " ")];
}
