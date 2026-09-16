import type { EligibilityRule } from "./types";

/** Rule 5 — a verified, unexpired licence for the consumer's state. Never bypassed. */
export const stateLicenseRule: EligibilityRule = {
  key: "state_license",
  label: "Verified licence in lead state",
  hard: true,
  check: (a, l, ctx) => {
    const lic = a.licenseForState;
    if (!lic) return `No ${l.state} licence on file`;
    if (lic.verificationStatus !== "verified") return `${l.state} licence is ${lic.verificationStatus}`;
    if (lic.expiresAt <= ctx.now) return `${l.state} licence expired`;
    return null;
  },
};
