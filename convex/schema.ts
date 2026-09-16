import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  accountStatusV,
  accountTypeV,
  assignmentStatusV,
  channelV,
  cmsContentV,
  disputeReasonV,
  disputeStatusV,
  formOptionGroupV,
  leadSourceV,
  leadStatusV,
  leadTypeV,
  ledgerEntryTypeV,
  legalDocTypeV,
  legalStatusV,
  notificationTypeV,
  orderKindV,
  orderStatusV,
  paymentKindV,
  paymentProviderV,
  paymentStatusV,
  rankingWeightsV,
  roleV,
  scoreSnapshotV,
  staffRoleV,
  traceRuleV,
  verificationStatusV,
} from "./lib/validators";

export default defineSchema({
  ...authTables,

  // ─────────────────────────── identity & accounts ───────────────────────────
  users: defineTable({
    // Convex Auth fields
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Application fields — never set from client-supplied sign-up params
    role: v.optional(roleV),
    accountId: v.optional(v.id("accounts")),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    disabled: v.optional(v.boolean()),
    lastSeenAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_accountId", ["accountId"])
    .index("by_role", ["role"]),

  staffInvitations: defineTable({
    email: v.string(),
    role: staffRoleV,
    tokenHash: v.string(),
    expiresAt: v.number(),
    invitedBy: v.id("users"),
    invitedAt: v.number(),
    acceptedAt: v.optional(v.number()),
    acceptedBy: v.optional(v.id("users")),
    revokedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_email", ["email"]),

  mfaFactors: defineTable({
    userId: v.id("users"),
    secretCiphertext: v.string(),
    secretIv: v.string(),
    confirmedAt: v.optional(v.number()),
    lastUsedStep: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  mfaSessions: defineTable({
    sessionId: v.id("authSessions"),
    userId: v.id("users"),
    verifiedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"]),

  accounts: defineTable({
    type: accountTypeV,
    status: accountStatusV,
    name: v.string(),
    businessName: v.optional(v.string()),
    email: v.string(),
    phone: v.string(),
    npn: v.optional(v.string()),
    ein: v.optional(v.string()),
    principalName: v.optional(v.string()),
    producerCountBand: v.optional(v.string()),
    requestedSeats: v.optional(v.number()),
    residentState: v.string(),
    city: v.optional(v.string()),
    timezone: v.string(),
    appliedAt: v.number(),
    approvedAt: v.optional(v.number()),
    approvedBy: v.optional(v.id("users")),
    statusReason: v.optional(v.string()),
    statusChangedAt: v.optional(v.number()),
    statusChangedBy: v.optional(v.id("users")),
    openingQuantity: v.number(),
    openingOrderId: v.optional(v.id("orders")),
    agreementDocumentId: v.optional(v.id("legalDocuments")),
    agreementAcceptedAt: v.optional(v.number()),
    qualityHold: v.boolean(),
    declinedPurchaseOutstanding: v.boolean(),
    lastAssignedAt: v.optional(v.number()),
    closureRequestedAt: v.optional(v.number()),
    // Stripe — identifiers only; card data never touches Convex
    stripeCustomerId: v.optional(v.string()),
    defaultPaymentMethodId: v.optional(v.string()),
    cardBrand: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    cardExpMonth: v.optional(v.number()),
    cardExpYear: v.optional(v.number()),
    searchText: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_npn", ["npn"])
    .index("by_ein", ["ein"])
    .index("by_email", ["email"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .searchIndex("search", { searchField: "searchText", filterFields: ["status", "type"] }),

  accountBalances: defineTable({
    accountId: v.id("accounts"),
    exclusive: v.number(),
    standard: v.number(),
    exclusiveIssued: v.number(),
    standardIssued: v.number(),
    exclusivePurchased: v.number(),
    standardPurchased: v.number(),
    exclusiveDelivered: v.number(),
    standardDelivered: v.number(),
    updatedAt: v.number(),
  }).index("by_account", ["accountId"]),

  agencyMembers: defineTable({
    accountId: v.id("accounts"),
    userId: v.optional(v.id("users")),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    npn: v.optional(v.string()),
    seatRole: v.union(v.literal("principal"), v.literal("producer"), v.literal("billing_contact")),
    status: v.union(v.literal("invited"), v.literal("pending"), v.literal("active"), v.literal("deactivated")),
    verificationStatus: v.union(verificationStatusV, v.literal("not_required")),
    inviteTokenHash: v.optional(v.string()),
    inviteExpiresAt: v.optional(v.number()),
    invitedBy: v.optional(v.id("users")),
    invitedAt: v.number(),
    activatedAt: v.optional(v.number()),
    deactivatedAt: v.optional(v.number()),
    verifiedAt: v.optional(v.number()),
    verifiedBy: v.optional(v.id("users")),
  })
    .index("by_account", ["accountId"])
    .index("by_user", ["userId"])
    .index("by_inviteTokenHash", ["inviteTokenHash"])
    .index("by_email", ["email"]),

  agentPreferences: defineTable({
    accountId: v.id("accounts"),
    coverageTypes: v.array(v.string()),
    states: v.array(v.string()),
    dailyPace: v.number(),
    receivingStartHour: v.number(),
    receivingEndHour: v.number(),
    paused: v.boolean(),
    pausedUntil: v.optional(v.number()),
    notifyEmailOnLead: v.boolean(),
    notifySmsOnLead: v.boolean(),
    autoReloadEnabled: v.boolean(),
    autoReloadThreshold: v.number(),
    autoReloadQuantity: v.number(),
    autoReloadPendingOrderId: v.optional(v.id("orders")),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_account", ["accountId"]),

  licenses: defineTable({
    accountId: v.id("accounts"),
    memberId: v.optional(v.id("agencyMembers")),
    state: v.string(),
    licenseNumber: v.string(),
    expiresAt: v.number(),
    verificationStatus: verificationStatusV,
    verificationNotes: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
    verifiedBy: v.optional(v.id("users")),
    submittedAt: v.number(),
    submittedBy: v.optional(v.id("users")),
    expiryWarningSentAt: v.optional(v.number()),
    supersededAt: v.optional(v.number()),
  })
    .index("by_account", ["accountId"])
    .index("by_account_state", ["accountId", "state"])
    .index("by_member", ["memberId"])
    .index("by_status", ["verificationStatus"]),

  eoPolicies: defineTable({
    accountId: v.id("accounts"),
    carrier: v.string(),
    policyNumber: v.optional(v.string()),
    expiresAt: v.number(),
    verificationStatus: verificationStatusV,
    verificationNotes: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
    verifiedBy: v.optional(v.id("users")),
    documentStorageId: v.optional(v.id("_storage")),
    submittedAt: v.number(),
    submittedBy: v.optional(v.id("users")),
    expiryWarningSentAt: v.optional(v.number()),
    supersededAt: v.optional(v.number()),
  })
    .index("by_account", ["accountId"])
    .index("by_status", ["verificationStatus"]),

  tpmoApprovals: defineTable({
    accountId: v.id("accounts"),
    status: v.union(v.literal("requested"), v.literal("approved"), v.literal("rejected"), v.literal("revoked")),
    requestedAt: v.number(),
    requestedBy: v.optional(v.id("users")),
    attestationDocumentId: v.optional(v.id("legalDocuments")),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("users")),
    decisionNotes: v.optional(v.string()),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
  })
    .index("by_account", ["accountId"])
    .index("by_status", ["status"]),

  // ─────────────────────────── leads & distribution ───────────────────────────
  leadRawPayloads: defineTable({
    source: leadSourceV,
    receivedAt: v.number(),
    payload: v.string(),
    contentHash: v.string(),
    headers: v.optional(v.record(v.string(), v.string())),
    signatureVerified: v.boolean(),
    externalId: v.optional(v.string()),
  })
    .index("by_contentHash", ["contentHash"])
    .index("by_source_externalId", ["source", "externalId"]),

  leads: defineTable({
    reference: v.string(),
    source: leadSourceV,
    marketingSource: v.optional(v.string()),
    externalId: v.optional(v.string()),
    gclid: v.optional(v.string()),
    status: leadStatusV,
    leadType: leadTypeV,
    gradeSequence: v.optional(v.number()),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    phone: v.string(),
    state: v.string(),
    zip: v.string(),
    city: v.optional(v.string()),
    coverageType: v.string(),
    coverageUndetermined: v.boolean(),
    ageRange: v.optional(v.string()),
    coverageAmount: v.optional(v.string()),
    protecting: v.optional(v.string()),
    budgetRange: v.optional(v.string()),
    reason: v.string(),
    bestTimeToCall: v.optional(v.string()),
    preferredContactMethod: v.optional(v.string()),
    consentId: v.optional(v.id("consents")),
    rawPayloadId: v.optional(v.id("leadRawPayloads")),
    duplicateOfLeadId: v.optional(v.id("leads")),
    processingNote: v.optional(v.string()),
    qualityScore: v.optional(v.number()),
    capturedAt: v.number(),
    recipientTarget: v.number(),
    assignedCount: v.number(),
    firstAssignedAt: v.optional(v.number()),
    retryAttempt: v.number(),
    /** Retry ladder, admin alert and unassignable timings are measured from the first real attempt. */
    retryBaseAt: v.optional(v.number()),
    nextRetryAt: v.optional(v.number()),
    adminAlertedAt: v.optional(v.number()),
    unassignableAt: v.optional(v.number()),
    withdrawnAt: v.optional(v.number()),
    suppressedAt: v.optional(v.number()),
    confirmationTokenHash: v.optional(v.string()),
    consumerNotifiedAt: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
    searchText: v.string(),
  })
    .index("by_reference", ["reference"])
    .index("by_status", ["status", "capturedAt"])
    .index("by_capturedAt", ["capturedAt"])
    .index("by_phone", ["phone", "capturedAt"])
    .index("by_email", ["email", "capturedAt"])
    .index("by_status_nextRetryAt", ["status", "nextRetryAt"])
    .index("by_source_externalId", ["source", "externalId"])
    .searchIndex("search", {
      searchField: "searchText",
      filterFields: ["status", "state", "coverageType", "leadType"],
    }),

  consents: defineTable({
    leadId: v.id("leads"),
    /** Published consumer-consent version shown to the consumer (absent for partner-supplied consent). */
    legalDocumentId: v.optional(v.id("legalDocuments")),
    documentVersion: v.optional(v.number()),
    /** Human-readable version identifier, e.g. "Consumer consent v4" or "partner:acme:2026-01". */
    versionLabel: v.string(),
    /** SHA-256 of the exact consent wording agreed to. */
    contentHash: v.string(),
    termsDocumentId: v.optional(v.id("legalDocuments")),
    privacyDocumentId: v.optional(v.id("legalDocuments")),
    agreedAt: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    method: v.union(v.literal("web_form"), v.literal("meta_lead_form"), v.literal("partner_api"), v.literal("admin_manual")),
    phoneSnapshot: v.string(),
    emailSnapshot: v.string(),
    evidence: v.optional(v.string()),
    recordedBy: v.optional(v.id("users")),
  }).index("by_lead", ["leadId"]),

  consentWithdrawals: defineTable({
    leadId: v.id("leads"),
    consentId: v.optional(v.id("consents")),
    method: v.union(v.literal("reference_lookup"), v.literal("sms_stop"), v.literal("admin")),
    requestedAt: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    note: v.optional(v.string()),
    processedBy: v.optional(v.id("users")),
    ceaseContactNotices: v.number(),
  }).index("by_lead", ["leadId"]),

  leadAssignments: defineTable({
    leadId: v.id("leads"),
    accountId: v.id("accounts"),
    leadType: leadTypeV,
    method: v.union(v.literal("auto"), v.literal("manual")),
    assignedAt: v.number(),
    assignedBy: v.optional(v.id("users")),
    /** Set in the same transaction immediately after the ASSIGNMENT debit is written. */
    ledgerEntryId: v.optional(v.id("leadBalanceLedger")),
    distributionRunId: v.optional(v.id("distributionRuns")),
    settingsVersionId: v.optional(v.id("distributionSettings")),
    scoreSnapshot: v.optional(scoreSnapshotV),
    status: assignmentStatusV,
    statusUpdatedAt: v.number(),
    openedAt: v.optional(v.number()),
    contactedAt: v.optional(v.number()),
    producerMemberId: v.optional(v.id("agencyMembers")),
    handedOutAt: v.optional(v.number()),
    handedOutBy: v.optional(v.id("users")),
    disputeDeadlineAt: v.number(),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
    revokedReason: v.optional(v.string()),
    ceaseContactAt: v.optional(v.number()),
  })
    .index("by_lead", ["leadId"])
    .index("by_account_assignedAt", ["accountId", "assignedAt"])
    .index("by_account_status", ["accountId", "status"])
    .index("by_assignedAt", ["assignedAt"])
    .index("by_producer", ["producerMemberId"]),

  assignmentEvents: defineTable({
    assignmentId: v.id("leadAssignments"),
    leadId: v.id("leads"),
    accountId: v.id("accounts"),
    kind: v.union(
      v.literal("released"),
      v.literal("status"),
      v.literal("note"),
      v.literal("handout"),
      v.literal("revoked"),
      v.literal("cease_contact"),
      v.literal("dispute"),
      v.literal("opened"),
    ),
    status: v.optional(v.string()),
    note: v.optional(v.string()),
    actorUserId: v.optional(v.id("users")),
    actorName: v.string(),
    at: v.number(),
  }).index("by_assignment", ["assignmentId", "at"]),

  distributionRuns: defineTable({
    leadId: v.id("leads"),
    trigger: v.union(
      v.literal("capture"),
      v.literal("retry"),
      v.literal("requeue"),
      v.literal("release_queue"),
      v.literal("manual"),
    ),
    startedAt: v.number(),
    settingsVersionId: v.optional(v.id("distributionSettings")),
    engineEnabled: v.boolean(),
    slotsTarget: v.number(),
    slotsFilledBefore: v.number(),
    evaluatedCount: v.number(),
    eligibleCount: v.number(),
    assignedCount: v.number(),
    outcome: v.union(
      v.literal("assigned"),
      v.literal("partial"),
      v.literal("none"),
      v.literal("held"),
      v.literal("skipped"),
    ),
    reason: v.optional(v.string()),
    actorUserId: v.optional(v.id("users")),
    trace: v.array(
      v.object({
        accountId: v.id("accounts"),
        accountName: v.string(),
        eligible: v.boolean(),
        failedRule: v.optional(v.string()),
        rules: v.array(traceRuleV),
        score: v.optional(scoreSnapshotV),
        assigned: v.boolean(),
      }),
    ),
    traceTruncated: v.boolean(),
  })
    .index("by_lead", ["leadId", "startedAt"])
    .index("by_startedAt", ["startedAt"]),

  // ─────────────────────────── ledger & commerce ───────────────────────────
  leadBalanceLedger: defineTable({
    accountId: v.id("accounts"),
    leadType: leadTypeV,
    direction: v.union(v.literal("credit"), v.literal("debit")),
    quantity: v.number(),
    delta: v.number(),
    balanceAfter: v.number(),
    entryType: ledgerEntryTypeV,
    reason: v.string(),
    source: v.union(v.literal("stripe"), v.literal("mock_payment"), v.literal("engine"), v.literal("admin"), v.literal("system")),
    relatedOrderId: v.optional(v.id("orders")),
    relatedLeadId: v.optional(v.id("leads")),
    relatedAssignmentId: v.optional(v.id("leadAssignments")),
    relatedDisputeId: v.optional(v.id("disputes")),
    reversesEntryId: v.optional(v.id("leadBalanceLedger")),
    createdBy: v.optional(v.id("users")),
    createdByName: v.string(),
    createdAt: v.number(),
  })
    .index("by_account", ["accountId", "createdAt"])
    .index("by_account_type", ["accountId", "leadType", "createdAt"])
    .index("by_order", ["relatedOrderId"])
    .index("by_assignment", ["relatedAssignmentId"])
    .index("by_createdAt", ["createdAt"]),

  pricingVersions: defineTable({
    standardRateCents: v.number(),
    exclusiveRateCents: v.number(),
    displayMode: v.union(v.literal("public"), v.literal("agent_only")),
    acquisitionCostStandardCents: v.number(),
    acquisitionCostExclusiveCents: v.number(),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
    createdByName: v.string(),
    note: v.optional(v.string()),
  }).index("by_createdAt", ["createdAt"]),

  bundles: defineTable({
    name: v.string(),
    quantity: v.number(),
    discountPercent: v.number(),
    blurb: v.string(),
    featured: v.boolean(),
    active: v.boolean(),
    sortOrder: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_active_sort", ["active", "sortOrder"]),

  orders: defineTable({
    accountId: v.id("accounts"),
    orderNumber: v.string(),
    kind: orderKindV,
    label: v.string(),
    bundleId: v.optional(v.id("bundles")),
    quantity: v.number(),
    exclusiveQty: v.number(),
    standardQty: v.number(),
    standardRateCents: v.number(),
    exclusiveRateCents: v.number(),
    listCents: v.number(),
    discountPercent: v.number(),
    discountCents: v.number(),
    totalCents: v.number(),
    pricingVersionId: v.id("pricingVersions"),
    status: orderStatusV,
    provider: paymentProviderV,
    stripePaymentIntentId: v.optional(v.string()),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
    authorizedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    canceledAt: v.optional(v.number()),
    creditedAt: v.optional(v.number()),
    refundedCents: v.number(),
    receiptSentAt: v.optional(v.number()),
    attemptCount: v.number(),
    declineResolvedAt: v.optional(v.number()),
  })
    .index("by_account", ["accountId", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_kind", ["kind", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_paymentIntent", ["stripePaymentIntentId"])
    .index("by_orderNumber", ["orderNumber"]),

  payments: defineTable({
    orderId: v.id("orders"),
    accountId: v.id("accounts"),
    provider: paymentProviderV,
    kind: paymentKindV,
    amountCents: v.number(),
    status: paymentStatusV,
    documentNumber: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    stripeChargeId: v.optional(v.string()),
    stripeRefundId: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    cardBrand: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    reason: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_order", ["orderId", "createdAt"])
    .index("by_account", ["accountId", "createdAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_status", ["status", "createdAt"]),

  stripeEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_eventId", ["eventId"]),

  // ─────────────────────────── disputes & compliance ───────────────────────────
  disputes: defineTable({
    assignmentId: v.id("leadAssignments"),
    leadId: v.id("leads"),
    accountId: v.id("accounts"),
    leadType: leadTypeV,
    reason: disputeReasonV,
    details: v.optional(v.string()),
    submittedAt: v.number(),
    submittedBy: v.id("users"),
    status: disputeStatusV,
    decisionNotes: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id("users")),
    decidedByName: v.optional(v.string()),
    autoDecided: v.boolean(),
    returnLedgerEntryId: v.optional(v.id("leadBalanceLedger")),
  })
    .index("by_account", ["accountId", "submittedAt"])
    .index("by_status", ["status", "submittedAt"])
    .index("by_assignment", ["assignmentId"])
    .index("by_lead", ["leadId"]),

  suppressionEntries: defineTable({
    channel: v.union(v.literal("phone"), v.literal("email")),
    value: v.string(),
    reason: v.union(
      v.literal("consumer_withdrawal"),
      v.literal("sms_stop"),
      v.literal("admin"),
      v.literal("complaint"),
    ),
    leadId: v.optional(v.id("leads")),
    note: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
    liftedAt: v.optional(v.number()),
    liftedBy: v.optional(v.id("users")),
    liftReason: v.optional(v.string()),
  })
    .index("by_channel_value", ["channel", "value"])
    .index("by_createdAt", ["createdAt"])
    .index("by_active", ["active", "createdAt"]),

  notifications: defineTable({
    audience: v.union(v.literal("account"), v.literal("staff")),
    accountId: v.optional(v.id("accounts")),
    userId: v.optional(v.id("users")),
    type: notificationTypeV,
    title: v.string(),
    body: v.string(),
    link: v.optional(v.string()),
    channels: v.array(channelV),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
    relatedLeadId: v.optional(v.id("leads")),
  })
    .index("by_account", ["accountId", "createdAt"])
    .index("by_audience", ["audience", "createdAt"]),

  outboundMessages: defineTable({
    channel: v.union(v.literal("email"), v.literal("sms")),
    template: v.string(),
    to: v.string(),
    subject: v.optional(v.string()),
    bodyPreview: v.optional(v.string()),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("bypassed"), v.literal("failed")),
    provider: v.string(),
    providerMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
    leadId: v.optional(v.id("leads")),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_status", ["status", "createdAt"]),

  auditLogs: defineTable({
    actorUserId: v.optional(v.id("users")),
    actorName: v.string(),
    actorRole: v.string(),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    accountId: v.optional(v.id("accounts")),
    summary: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_entity", ["entityType", "entityId", "createdAt"])
    .index("by_account", ["accountId", "createdAt"])
    .index("by_action", ["action", "createdAt"])
    .index("by_actor", ["actorUserId", "createdAt"]),

  // ─────────────────────────── settings ───────────────────────────
  distributionSettings: defineTable({
    engineEnabled: v.boolean(),
    weights: rankingWeightsV,
    standardRecipientCount: v.number(),
    retryScheduleMinutes: v.array(v.number()),
    adminAlertAfterMinutes: v.number(),
    unassignableAfterMinutes: v.number(),
    disputeWindowHours: v.number(),
    starvationGuardHours: v.number(),
    waitNormalizationHours: v.number(),
    holdOnDeclinedPurchase: v.boolean(),
    disputePenaltyThreshold: v.number(),
    disputePenaltyMinAssignments: v.number(),
    contactRateWindowDays: v.number(),
    gradingMode: v.union(v.literal("ratio"), v.literal("source")),
    exclusiveEvery: v.number(),
    dedupWindowDays: v.number(),
    dedupMatchPhone: v.boolean(),
    dedupMatchEmail: v.boolean(),
    dedupSameCoverageOnly: v.boolean(),
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
    createdByName: v.string(),
    note: v.optional(v.string()),
  }).index("by_createdAt", ["createdAt"]),

  retentionSettings: defineTable({
    consentArtifactYears: v.number(),
    leadPiiMonthsAfterClosure: v.number(),
    leadVisibilityDaysAfterClosure: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }),

  counters: defineTable({ name: v.string(), value: v.number() }).index("by_name", ["name"]),

  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),

  // ─────────────────────────── content & reference data ───────────────────────────
  cmsPages: defineTable({
    slug: v.string(),
    title: v.string(),
    status: v.union(v.literal("published"), v.literal("draft")),
    version: v.number(),
    content: cmsContentV,
    draftContent: v.optional(cmsContentV),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
    updatedByName: v.string(),
  }).index("by_slug", ["slug"]),

  faqs: defineTable({
    audience: v.union(v.literal("consumer"), v.literal("agent")),
    question: v.string(),
    answer: v.string(),
    published: v.boolean(),
    sortOrder: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_audience", ["audience", "sortOrder"]),

  media: defineTable({
    storageId: v.optional(v.id("_storage")),
    externalUrl: v.optional(v.string()),
    filename: v.string(),
    altText: v.string(),
    contentType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    uploadedAt: v.number(),
    uploadedBy: v.optional(v.id("users")),
  }).index("by_uploadedAt", ["uploadedAt"]),

  legalDocuments: defineTable({
    docType: legalDocTypeV,
    slug: v.string(),
    title: v.string(),
    version: v.number(),
    content: v.string(),
    contentHash: v.string(),
    status: legalStatusV,
    createdAt: v.number(),
    createdBy: v.optional(v.id("users")),
    createdByName: v.string(),
    submittedAt: v.optional(v.number()),
    submittedBy: v.optional(v.id("users")),
    publishedAt: v.optional(v.number()),
    publishedBy: v.optional(v.id("users")),
    publishedByName: v.optional(v.string()),
    supersededAt: v.optional(v.number()),
  })
    .index("by_type_status", ["docType", "status"])
    .index("by_type_version", ["docType", "version"])
    .index("by_slug_status", ["slug", "status"]),

  referenceStates: defineTable({
    code: v.string(),
    name: v.string(),
    serviced: v.boolean(),
    sortOrder: v.number(),
  }).index("by_code", ["code"]),

  coverageTypes: defineTable({
    key: v.string(),
    name: v.string(),
    icon: v.string(),
    cardDescription: v.string(),
    wizardDescription: v.string(),
    requiresTpmo: v.boolean(),
    imageUrl: v.optional(v.string()),
    active: v.boolean(),
    sortOrder: v.number(),
  }).index("by_key", ["key"]),

  leadTypeLabels: defineTable({
    key: leadTypeV,
    name: v.string(),
    description: v.string(),
  }).index("by_key", ["key"]),

  marketingSources: defineTable({
    key: v.string(),
    name: v.string(),
    channel: v.string(),
    defaultLeadType: v.optional(leadTypeV),
    active: v.boolean(),
    sortOrder: v.number(),
  }).index("by_key", ["key"]),

  formOptions: defineTable({
    group: formOptionGroupV,
    label: v.string(),
    active: v.boolean(),
    sortOrder: v.number(),
  }).index("by_group", ["group", "sortOrder"]),

  // ─────────────────────────── support ───────────────────────────
  supportTickets: defineTable({
    accountId: v.id("accounts"),
    userId: v.id("users"),
    kind: v.union(v.literal("general"), v.literal("closure_request"), v.literal("data_export")),
    category: v.string(),
    message: v.string(),
    status: v.union(v.literal("open"), v.literal("answered"), v.literal("closed")),
    response: v.optional(v.string()),
    respondedBy: v.optional(v.id("users")),
    respondedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_account", ["accountId", "createdAt"])
    .index("by_status", ["status", "createdAt"]),

  contactMessages: defineTable({
    audience: v.union(v.literal("consumer"), v.literal("agent"), v.literal("other")),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    message: v.string(),
    status: v.union(v.literal("new"), v.literal("handled")),
    createdAt: v.number(),
    handledBy: v.optional(v.id("users")),
  }).index("by_status", ["status", "createdAt"]),
});
