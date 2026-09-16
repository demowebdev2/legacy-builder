import { v } from "convex/values";
import { DAILY_PACE_OPTIONS, MAX_PRODUCER_SEATS } from "../src/domain/constants";
import { normalizeName, normalizeUsPhone } from "../src/domain/normalize";
import { assertValidPurchaseQuantity, PurchaseRuleError } from "../src/domain/purchase";
import { DAY } from "../src/domain/time";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { currentEoPolicy } from "./eoPolicies";
import { currentLicenses } from "./licenses";
import { writeAudit } from "./lib/audit";
import { requireAccountViewer, requireViewer } from "./lib/auth";
import { forbidden, invalid } from "./lib/errors";
import { notifyStaff } from "./lib/notify";
import { enforceRateLimit } from "./lib/rateLimit";
import { getPublishedLegalDocument, loadCoverageTypes, loadFormOptions, loadServicedStates } from "./lib/settings";
import { createOrderRecord } from "./orders";
import { createTpmoRequest, tpmoState } from "./tpmo";

/** Resident state → default timezone for receiving hours and daily pace. Editable later by staff. */
const STATE_TIMEZONES: Record<string, string> = {
  AL: "America/Chicago",
  FL: "America/New_York",
  GA: "America/New_York",
  MS: "America/Chicago",
  NC: "America/New_York",
  SC: "America/New_York",
  TN: "America/Chicago",
};

export const timezoneForState = (state: string) => STATE_TIMEZONES[state] ?? "America/New_York";

/**
 * Submits an agent / agency application for the signed-in user (who created their login in step 2).
 * Everything is validated again here; nothing from the wizard is trusted.
 */
export const submit = mutation({
  args: {
    entityType: v.union(v.literal("individual"), v.literal("agency")),
    firstName: v.string(),
    lastName: v.string(),
    phone: v.string(),
    businessName: v.optional(v.string()),
    ein: v.optional(v.string()),
    producerCount: v.optional(v.string()),
    npn: v.string(),
    residentState: v.string(),
    licenses: v.array(v.object({ state: v.string(), licenseNumber: v.string(), expiresAt: v.number() })),
    eoCarrier: v.string(),
    eoPolicyNumber: v.optional(v.string()),
    eoExpiresAt: v.number(),
    coverageTypes: v.array(v.string()),
    dailyPace: v.number(),
    seats: v.number(),
    requestTpmo: v.boolean(),
    tpmoAttested: v.boolean(),
    quantity: v.number(),
    autoReload: v.boolean(),
    agreementDocumentId: v.id("legalDocuments"),
    agreements: v.object({ licensed: v.boolean(), contactLaw: v.boolean(), terms: v.boolean() }),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    if (viewer.user.role || viewer.user.accountId) throw forbidden("This login already belongs to an account.");
    await enforceRateLimit(ctx, `application:${viewer.userId}`, { max: 5, windowMs: DAY });
    const email = viewer.user.email;
    if (!email) throw invalid("Your login has no email address.");

    const firstName = normalizeName(args.firstName);
    const lastName = normalizeName(args.lastName);
    if (!firstName || !lastName) throw invalid("First and last name are required.");
    const phone = normalizeUsPhone(args.phone);
    if (!phone) throw invalid("Enter a valid US mobile number.");
    const isAgency = args.entityType === "agency";
    const businessName = normalizeName(args.businessName);
    if (isAgency && !businessName) throw invalid("Agency legal name is required.");
    const ein = args.ein?.replace(/\D/g, "") ?? "";
    if (isAgency && ein.length !== 9) throw invalid("Enter a 9-digit EIN.");
    const formattedEin = isAgency ? `${ein.slice(0, 2)}-${ein.slice(2)}` : undefined;
    if (isAgency) {
      const bands = await loadFormOptions(ctx, "producer_count");
      if (!args.producerCount || !bands.includes(args.producerCount)) throw invalid("Choose how many producers.");
    }
    const npn = args.npn.replace(/\D/g, "");
    if (npn.length < 4 || npn.length > 10) throw invalid("Enter a valid National Producer Number.");

    if (isAgency) {
      const dupe = await ctx.db.query("accounts").withIndex("by_ein", (q) => q.eq("ein", formattedEin)).first();
      if (dupe && dupe.status !== "rejected") throw invalid("An account already exists for this EIN.");
    } else {
      const dupe = await ctx.db.query("accounts").withIndex("by_npn", (q) => q.eq("npn", npn)).first();
      if (dupe && dupe.status !== "rejected") throw invalid("An account already exists for this producer number.");
    }

    const serviced = new Set((await loadServicedStates(ctx)).map((s) => s.code));
    if (!serviced.has(args.residentState)) throw invalid("Choose a serviced resident state.");
    if (!args.licenses.length) throw invalid("Add at least one licensed state.");
    const seenStates = new Set<string>();
    const now = Date.now();
    for (const lic of args.licenses) {
      if (!serviced.has(lic.state)) throw invalid(`${lic.state} is not a serviced state.`);
      if (seenStates.has(lic.state)) throw invalid(`${lic.state} is listed twice.`);
      seenStates.add(lic.state);
      if (lic.licenseNumber.trim().length < 3) throw invalid(`Enter the ${lic.state} licence number.`);
      if (lic.expiresAt <= now) throw invalid(`Your ${lic.state} licence has expired.`);
    }
    if (args.eoCarrier.trim().length < 2) throw invalid("Enter your E&O carrier.");
    if (args.eoExpiresAt <= now) throw invalid("Your E&O cover has expired.");

    const coverage = await loadCoverageTypes(ctx);
    const coverageKeys = new Set(coverage.map((c) => c.key));
    if (!args.coverageTypes.length || args.coverageTypes.some((k) => !coverageKeys.has(k))) throw invalid("Choose valid products.");
    const needsTpmo = args.coverageTypes.some((k) => coverage.find((c) => c.key === k)?.requiresTpmo);
    if (needsTpmo && (!args.requestTpmo || !args.tpmoAttested)) {
      throw invalid("Medicare leads need a TPMO request and attestation.");
    }
    if (!(DAILY_PACE_OPTIONS as readonly number[]).includes(args.dailyPace)) throw invalid("Choose a daily pace.");
    const seats = isAgency ? Math.trunc(args.seats) : 1;
    if (seats < 1 || seats > MAX_PRODUCER_SEATS) throw invalid(`Seats must be between 1 and ${MAX_PRODUCER_SEATS}.`);
    try {
      assertValidPurchaseQuantity(args.quantity);
    } catch (error) {
      throw invalid(error instanceof PurchaseRuleError ? error.message : "Invalid quantity.");
    }
    const agreement = await ctx.db.get(args.agreementDocumentId);
    const publishedAgreement = await getPublishedLegalDocument(ctx, "agent_agreement");
    if (!agreement || !publishedAgreement || agreement._id !== publishedAgreement._id) {
      throw invalid("The agent agreement has been updated — please reload and review it.");
    }
    if (!args.agreements.licensed || !args.agreements.contactLaw || !args.agreements.terms) {
      throw invalid("Please accept all three agreements.");
    }

    const principalName = `${firstName} ${lastName}`;
    const name = isAgency ? businessName : principalName;
    const accountId = await ctx.db.insert("accounts", {
      type: args.entityType,
      status: "pending_verification",
      name,
      businessName: isAgency ? businessName : businessName || undefined,
      email,
      phone,
      npn: isAgency ? undefined : npn,
      ein: formattedEin,
      principalName: isAgency ? principalName : undefined,
      producerCountBand: isAgency ? args.producerCount : undefined,
      requestedSeats: seats,
      residentState: args.residentState,
      timezone: timezoneForState(args.residentState),
      appliedAt: now,
      openingQuantity: args.quantity,
      agreementDocumentId: agreement._id,
      agreementAcceptedAt: now,
      qualityHold: false,
      declinedPurchaseOutstanding: false,
      searchText: [name, businessName, principalName, email, npn, formattedEin].filter(Boolean).join(" "),
    });

    await ctx.db.patch(viewer.userId, {
      role: isAgency ? "AGENCY_PRINCIPAL" : "AGENT",
      accountId,
      firstName,
      lastName,
      name: principalName,
      phone,
    });

    let principalMemberId: Id<"agencyMembers"> | undefined;
    if (isAgency) {
      principalMemberId = await ctx.db.insert("agencyMembers", {
        accountId,
        userId: viewer.userId,
        name: principalName,
        email,
        phone,
        npn,
        seatRole: "principal",
        status: "pending",
        verificationStatus: "unverified",
        invitedAt: now,
        activatedAt: now,
      });
    }

    for (const lic of args.licenses) {
      await ctx.db.insert("licenses", {
        accountId,
        state: lic.state,
        licenseNumber: lic.licenseNumber.trim(),
        expiresAt: lic.expiresAt,
        verificationStatus: "unverified",
        submittedAt: now,
        submittedBy: viewer.userId,
      });
    }
    await ctx.db.insert("eoPolicies", {
      accountId,
      carrier: args.eoCarrier.trim(),
      policyNumber: args.eoPolicyNumber?.trim() || undefined,
      expiresAt: args.eoExpiresAt,
      verificationStatus: "unverified",
      submittedAt: now,
      submittedBy: viewer.userId,
    });
    if (args.requestTpmo) await createTpmoRequest(ctx, accountId, viewer.userId);

    await ctx.db.insert("agentPreferences", {
      accountId,
      coverageTypes: args.coverageTypes,
      states: args.licenses.map((l) => l.state),
      dailyPace: args.dailyPace,
      receivingStartHour: 8,
      receivingEndHour: 20,
      paused: false,
      notifyEmailOnLead: true,
      notifySmsOnLead: true,
      autoReloadEnabled: args.autoReload,
      autoReloadThreshold: 3,
      autoReloadQuantity: args.quantity,
      updatedAt: now,
      updatedBy: viewer.userId,
    });
    await ctx.db.insert("accountBalances", {
      accountId,
      exclusive: 0,
      standard: 0,
      exclusiveIssued: 0,
      standardIssued: 0,
      exclusivePurchased: 0,
      standardPurchased: 0,
      exclusiveDelivered: 0,
      standardDelivered: 0,
      updatedAt: now,
    });

    const account = (await ctx.db.get(accountId))!;
    const actor = { kind: "user" as const, userId: viewer.userId, name: principalName, role: isAgency ? "AGENCY_PRINCIPAL" : "AGENT" };
    const order = await createOrderRecord(ctx, { account, kind: "opening", quantity: args.quantity, label: "Opening purchase", actor });
    await ctx.db.patch(accountId, { openingOrderId: order._id });

    await writeAudit(ctx, actor, {
      action: "application.submit",
      entityType: "account",
      entityId: accountId,
      accountId,
      summary: `${isAgency ? "Agency" : "Individual"} application: ${name} · ${args.licenses.map((l) => l.state).join(", ")} · ${args.quantity} leads`,
      metadata: { principalMemberId, agreementVersion: agreement.version },
    });
    await notifyStaff(ctx, {
      type: "account",
      title: `New application — ${name}`,
      body: `${args.licenses.length} state licence(s) to verify. Opening purchase of ${args.quantity} leads awaits card authorisation.`,
      link: `/admin/accounts/${accountId}`,
    });
    return { accountId, orderId: order._id };
  },
});

/** Status page for an applicant (pending, action required, rejected). */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireAccountViewer(ctx, "support", { allowPending: true });
    const account = viewer.account;
    const order = account.openingOrderId ? await ctx.db.get(account.openingOrderId) : null;
    return {
      account: {
        id: account._id,
        name: account.name,
        type: account.type,
        status: account.status,
        statusReason: account.statusReason ?? null,
        appliedAt: account.appliedAt,
        openingQuantity: account.openingQuantity,
      },
      openingOrder: order
        ? {
            id: order._id,
            status: order.status,
            provider: order.provider,
            totalCents: order.totalCents,
            exclusiveQty: order.exclusiveQty,
            standardQty: order.standardQty,
            orderNumber: order.orderNumber,
          }
        : null,
      licenses: await currentLicenses(ctx, account._id),
      eo: await currentEoPolicy(ctx, account._id),
      tpmo: await tpmoState(ctx, account._id),
    };
  },
});
