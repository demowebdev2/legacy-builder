import { formatDate } from "../src/domain/format";
import { DAY } from "../src/domain/time";
import { internalMutation } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { SYSTEM_ACTOR } from "./lib/auth";
import { notifyAccount } from "./lib/notify";

const LICENSE_WARNING_DAYS = 30;
const EO_WARNING_DAYS = 60;

/** Daily: warn before licences / E&O lapse, and mark lapsed ones expired. Eligibility already checks dates. */
export const dailyExpiryChecks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let warned = 0;
    let expired = 0;

    const verified = await ctx.db
      .query("licenses")
      .withIndex("by_status", (q) => q.eq("verificationStatus", "verified"))
      .collect();
    for (const lic of verified.filter((l) => !l.supersededAt)) {
      if (lic.expiresAt <= now) {
        await ctx.db.patch(lic._id, { verificationStatus: "expired" });
        await writeAudit(ctx, SYSTEM_ACTOR, {
          action: "license.expired",
          entityType: "license",
          entityId: lic._id,
          accountId: lic.accountId,
          summary: `${lic.state} licence ${lic.licenseNumber} expired`,
        });
        await notifyAccount(ctx, {
          accountId: lic.accountId,
          type: "licence",
          title: `${lic.state} licence expired`,
          body: `Leads for ${lic.state} are paused until a renewed licence is verified.`,
          link: "/agent/licenses",
        });
        expired++;
      } else if (lic.expiresAt - now <= LICENSE_WARNING_DAYS * DAY && !lic.expiryWarningSentAt) {
        await ctx.db.patch(lic._id, { expiryWarningSentAt: now });
        await notifyAccount(ctx, {
          accountId: lic.accountId,
          type: "licence",
          title: "Licence expiring",
          body: `Your ${lic.state} licence expires ${formatDate(lic.expiresAt)}. Upload the renewal so ${lic.state} leads keep flowing.`,
          link: "/agent/licenses",
        });
        warned++;
      }
    }

    for (const status of ["verified", "unverified"] as const) {
      const policies = await ctx.db
        .query("eoPolicies")
        .withIndex("by_status", (q) => q.eq("verificationStatus", status))
        .collect();
      for (const policy of policies.filter((p) => !p.supersededAt)) {
        if (policy.expiresAt <= now) {
          await ctx.db.patch(policy._id, { verificationStatus: "expired" });
          await notifyAccount(ctx, {
            accountId: policy.accountId,
            type: "licence",
            title: "E&O cover lapsed",
            body: "Lead flow has stopped across all states until renewal evidence is on file.",
            link: "/agent/licenses",
            channels: ["in_app", "email", "sms"],
          });
          expired++;
        } else if (policy.expiresAt - now <= EO_WARNING_DAYS * DAY && !policy.expiryWarningSentAt) {
          await ctx.db.patch(policy._id, { expiryWarningSentAt: now });
          await notifyAccount(ctx, {
            accountId: policy.accountId,
            type: "licence",
            title: "E&O cover expiring",
            body: `Your E&O cover expires ${formatDate(policy.expiresAt)}. Lead flow halts across all states the day it lapses.`,
            link: "/agent/licenses",
          });
          warned++;
        }
      }
    }
    return { warned, expired };
  },
});
