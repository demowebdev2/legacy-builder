import { formatDate } from "../../../src/domain/format";
import type { EligibilityRule } from "./types";

/** Rule 6 — errors & omissions cover on file and in force. */
export const eoCoverRule: EligibilityRule = {
  key: "eo_cover",
  label: "E&O cover not expired",
  hard: true,
  check: (a, _l, ctx) => {
    const eo = a.eoPolicy;
    if (!eo) return "No E&O policy on file";
    if (eo.verificationStatus === "failed") return "E&O evidence failed review";
    if (eo.expiresAt <= ctx.now) return `E&O expired ${formatDate(eo.expiresAt)}`;
    return null;
  },
};
