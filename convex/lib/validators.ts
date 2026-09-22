import { v } from "convex/values";

/** Shared enum validators. Keep in sync with src/domain/constants.ts and src/domain/status.ts. */

export const leadTypeV = v.union(v.literal("exclusive"), v.literal("standard"));

export const staffRoleV = v.union(v.literal("ADMIN"), v.literal("SUPPORT"), v.literal("FINANCE"), v.literal("CONTENT"));
export const accountRoleV = v.union(v.literal("AGENT"), v.literal("AGENCY_PRINCIPAL"), v.literal("PRODUCER"));
export const roleV = v.union(
  v.literal("AGENT"),
  v.literal("AGENCY_PRINCIPAL"),
  v.literal("PRODUCER"),
  v.literal("ADMIN"),
  v.literal("SUPPORT"),
  v.literal("FINANCE"),
  v.literal("CONTENT"),
);

export const accountTypeV = v.union(v.literal("individual"), v.literal("agency"));
export const accountStatusV = v.union(
  v.literal("pending_verification"),
  v.literal("action_required"),
  v.literal("active"),
  v.literal("suspended"),
  v.literal("blocked"),
  v.literal("rejected"),
  v.literal("closed"),
);

export const leadStatusV = v.union(
  v.literal("queued"),
  v.literal("assigned"),
  v.literal("partially_assigned"),
  v.literal("unassigned_pending"),
  v.literal("unassignable"),
  v.literal("duplicate"),
  v.literal("out_of_area"),
  v.literal("rejected"),
  v.literal("suppressed"),
  v.literal("withdrawn"),
);

export const leadSourceV = v.union(v.literal("website"), v.literal("meta"), v.literal("partner"), v.literal("admin"));

export const assignmentStatusV = v.union(
  v.literal("new"),
  v.literal("contacted"),
  v.literal("qualified"),
  v.literal("sold"),
  v.literal("lost"),
);

export const verificationStatusV = v.union(
  v.literal("unverified"),
  v.literal("verified"),
  v.literal("failed"),
  v.literal("expired"),
);

export const disputeStatusV = v.union(v.literal("pending"), v.literal("upheld"), v.literal("rejected"));
export const disputeReasonV = v.union(
  v.literal("disconnected"),
  v.literal("wrong_number"),
  v.literal("never_enquired"),
  v.literal("duplicate"),
  v.literal("out_of_area"),
  v.literal("deceased"),
);

export const ledgerEntryTypeV = v.union(
  v.literal("PURCHASE"),
  v.literal("AUTO_RELOAD"),
  v.literal("ASSIGNMENT"),
  v.literal("DISPUTE_RETURN"),
  v.literal("REVOCATION_RETURN"),
  v.literal("ADMIN_ADJUSTMENT"),
  v.literal("REFUND_REVERSAL"),
  v.literal("REVERSAL"),
);

export const orderKindV = v.union(v.literal("opening"), v.literal("top_up"), v.literal("bundle"), v.literal("auto_reload"));
export const orderStatusV = v.union(
  v.literal("requires_payment"),
  v.literal("authorized"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("canceled"),
  v.literal("refunded"),
  v.literal("partially_refunded"),
);
export const paymentProviderV = v.union(v.literal("stripe"), v.literal("mock"));
export const paymentKindV = v.union(v.literal("authorization"), v.literal("capture"), v.literal("charge"), v.literal("refund"));
export const paymentStatusV = v.union(
  v.literal("pending"),
  v.literal("requires_action"),
  v.literal("authorized"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("canceled"),
);

export const channelV = v.union(v.literal("in_app"), v.literal("email"), v.literal("sms"));
export const notificationTypeV = v.union(
  v.literal("lead"),
  v.literal("leads"),
  v.literal("billing"),
  v.literal("dispute"),
  v.literal("licence"),
  v.literal("account"),
  v.literal("compliance"),
  v.literal("system"),
);

export const legalDocTypeV = v.union(
  v.literal("consumer_consent"),
  v.literal("privacy_policy"),
  v.literal("terms_of_use"),
  v.literal("agent_agreement"),
  v.literal("medicare_tpmo_addendum"),
  v.literal("do_not_sell"),
);
export const legalStatusV = v.union(
  v.literal("draft"),
  v.literal("pending_approval"),
  v.literal("published"),
  v.literal("superseded"),
);

export const formOptionGroupV = v.union(
  v.literal("age_range"),
  v.literal("coverage_amount"),
  v.literal("protecting"),
  v.literal("call_time"),
  v.literal("budget_range"),
  v.literal("contact_method"),
  v.literal("producer_count"),
  v.literal("request_why"),
);

export const rankingWeightsV = v.object({
  waitingLongest: v.number(),
  contactRate: v.number(),
  balanceRemaining: v.number(),
  volumePurchased: v.number(),
});

export const scoreSnapshotV = v.object({
  total: v.number(),
  tier: v.number(),
  starved: v.boolean(),
  penalized: v.boolean(),
  parts: v.array(v.object({ key: v.string(), label: v.string(), points: v.number(), max: v.number() })),
  position: v.number(),
});

export const traceRuleV = v.object({
  key: v.string(),
  label: v.string(),
  pass: v.boolean(),
  skipped: v.optional(v.boolean()),
  reason: v.optional(v.string()),
});

export const cmsContentV = v.object({
  heroTitle: v.string(),
  heroBody: v.string(),
  badge: v.string(),
  sections: v.array(v.object({ heading: v.string(), body: v.string() })),
  seoTitle: v.string(),
  seoDescription: v.string(),
});
