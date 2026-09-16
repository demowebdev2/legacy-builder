import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Safety net for the per-lead retry ladder (primary path is ctx.scheduler.runAt).
crons.interval("sweep overdue lead retries", { minutes: 5 }, internal.distribution.retry.sweepOverdueRetries, {});

// Licence / E&O expiry warnings and automatic expiry marking.
crons.daily("compliance expiry checks", { hourUTC: 11, minuteUTC: 0 }, internal.compliance.dailyExpiryChecks, {});

// Old rate-limit windows.
crons.daily("clean rate limit windows", { hourUTC: 7, minuteUTC: 30 }, internal.maintenance.cleanRateLimits, {});

export default crons;
