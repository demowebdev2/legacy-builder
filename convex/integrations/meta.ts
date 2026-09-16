import { v } from "convex/values";
import { META_FIELD_MAP } from "../../src/domain/schemas/partnerLead";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { readEnv } from "../lib/env";

interface GraphLead {
  id: string;
  created_time?: string;
  field_data?: Array<{ name: string; values: string[] }>;
}

/**
 * Fetches the full lead from the Graph API (the webhook only carries the leadgen id), maps form
 * fields into our shape and ingests it. Without a page access token the raw payload is kept and
 * the lead waits for configuration.
 */
export const processLeadgen = internalAction({
  args: { rawPayloadId: v.id("leadRawPayloads"), leadgenId: v.string(), createdTime: v.optional(v.number()) },
  handler: async (ctx, { rawPayloadId, leadgenId, createdTime }): Promise<{ ok: boolean; reference?: string; error?: string }> => {
    const token = readEnv("META_PAGE_ACCESS_TOKEN");
    if (!token) {
      console.warn(`[meta] leadgen ${leadgenId} stored but not fetched — META_PAGE_ACCESS_TOKEN is not configured`);
      return { ok: false, error: "Graph API token not configured" };
    }
    const version = readEnv("META_GRAPH_VERSION") ?? "v21.0";
    const response = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}?fields=id,created_time,field_data&access_token=${encodeURIComponent(token)}`,
    );
    if (!response.ok) {
      console.error(`[meta] Graph API ${response.status} for leadgen ${leadgenId}`);
      return { ok: false, error: `Graph API ${response.status}` };
    }
    const lead = (await response.json()) as GraphLead;
    const fields: Record<string, string> = {};
    for (const field of lead.field_data ?? []) {
      const key = META_FIELD_MAP[field.name];
      if (key && field.values?.[0]) fields[key] = field.values[0];
    }
    const agreedAt = lead.created_time ? Date.parse(lead.created_time) : (createdTime ?? Date.now());
    return await ctx.runMutation(internal.intake.ingestExternal, {
      source: "meta",
      rawPayloadId,
      marketingSource: "meta_lead_ads",
      externalId: leadgenId,
      fields,
      consent: { agreedAt: Number.isFinite(agreedAt) ? agreedAt : Date.now() },
    });
  },
});
