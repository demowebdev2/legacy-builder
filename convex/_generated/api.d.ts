/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountActions from "../accountActions.js";
import type * as accounts from "../accounts.js";
import type * as adminAccountViews from "../adminAccountViews.js";
import type * as adminLeadViews from "../adminLeadViews.js";
import type * as adminSettingsViews from "../adminSettingsViews.js";
import type * as agencyMembers from "../agencyMembers.js";
import type * as agentViews from "../agentViews.js";
import type * as applications from "../applications.js";
import type * as assignments from "../assignments.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as autoReload from "../autoReload.js";
import type * as bootstrap from "../bootstrap.js";
import type * as cms from "../cms.js";
import type * as compliance from "../compliance.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as disputes from "../disputes.js";
import type * as distribution_admin from "../distribution/admin.js";
import type * as distribution_assignment from "../distribution/assignment.js";
import type * as distribution_context from "../distribution/context.js";
import type * as distribution_eligibility from "../distribution/eligibility.js";
import type * as distribution_engine from "../distribution/engine.js";
import type * as distribution_evaluate from "../distribution/evaluate.js";
import type * as distribution_retry from "../distribution/retry.js";
import type * as distribution_rules_accountRules from "../distribution/rules/accountRules.js";
import type * as distribution_rules_eoCover from "../distribution/rules/eoCover.js";
import type * as distribution_rules_index from "../distribution/rules/index.js";
import type * as distribution_rules_leadRules from "../distribution/rules/leadRules.js";
import type * as distribution_rules_preferences from "../distribution/rules/preferences.js";
import type * as distribution_rules_stateLicense from "../distribution/rules/stateLicense.js";
import type * as distribution_rules_types from "../distribution/rules/types.js";
import type * as eoPolicies from "../eoPolicies.js";
import type * as http from "../http.js";
import type * as intake from "../intake.js";
import type * as integrations_messaging from "../integrations/messaging.js";
import type * as integrations_meta from "../integrations/meta.js";
import type * as integrations_providers from "../integrations/providers.js";
import type * as integrations_templates from "../integrations/templates.js";
import type * as leads from "../leads.js";
import type * as ledger from "../ledger.js";
import type * as legalDocuments from "../legalDocuments.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_counterNames from "../lib/counterNames.js";
import type * as lib_counters from "../lib/counters.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_validators from "../lib/validators.js";
import type * as licenses from "../licenses.js";
import type * as maintenance from "../maintenance.js";
import type * as mfa from "../mfa.js";
import type * as notifications from "../notifications.js";
import type * as orders from "../orders.js";
import type * as payments from "../payments.js";
import type * as preferences from "../preferences.js";
import type * as pricing from "../pricing.js";
import type * as publicViews from "../publicViews.js";
import type * as referenceData from "../referenceData.js";
import type * as reports from "../reports.js";
import type * as seed from "../seed.js";
import type * as seedHelpers from "../seedHelpers.js";
import type * as stripeActions from "../stripeActions.js";
import type * as stripeEvents from "../stripeEvents.js";
import type * as support from "../support.js";
import type * as suppression from "../suppression.js";
import type * as tpmo from "../tpmo.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountActions: typeof accountActions;
  accounts: typeof accounts;
  adminAccountViews: typeof adminAccountViews;
  adminLeadViews: typeof adminLeadViews;
  adminSettingsViews: typeof adminSettingsViews;
  agencyMembers: typeof agencyMembers;
  agentViews: typeof agentViews;
  applications: typeof applications;
  assignments: typeof assignments;
  audit: typeof audit;
  auth: typeof auth;
  autoReload: typeof autoReload;
  bootstrap: typeof bootstrap;
  cms: typeof cms;
  compliance: typeof compliance;
  crons: typeof crons;
  dashboard: typeof dashboard;
  disputes: typeof disputes;
  "distribution/admin": typeof distribution_admin;
  "distribution/assignment": typeof distribution_assignment;
  "distribution/context": typeof distribution_context;
  "distribution/eligibility": typeof distribution_eligibility;
  "distribution/engine": typeof distribution_engine;
  "distribution/evaluate": typeof distribution_evaluate;
  "distribution/retry": typeof distribution_retry;
  "distribution/rules/accountRules": typeof distribution_rules_accountRules;
  "distribution/rules/eoCover": typeof distribution_rules_eoCover;
  "distribution/rules/index": typeof distribution_rules_index;
  "distribution/rules/leadRules": typeof distribution_rules_leadRules;
  "distribution/rules/preferences": typeof distribution_rules_preferences;
  "distribution/rules/stateLicense": typeof distribution_rules_stateLicense;
  "distribution/rules/types": typeof distribution_rules_types;
  eoPolicies: typeof eoPolicies;
  http: typeof http;
  intake: typeof intake;
  "integrations/messaging": typeof integrations_messaging;
  "integrations/meta": typeof integrations_meta;
  "integrations/providers": typeof integrations_providers;
  "integrations/templates": typeof integrations_templates;
  leads: typeof leads;
  ledger: typeof ledger;
  legalDocuments: typeof legalDocuments;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/counterNames": typeof lib_counterNames;
  "lib/counters": typeof lib_counters;
  "lib/env": typeof lib_env;
  "lib/errors": typeof lib_errors;
  "lib/notify": typeof lib_notify;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/settings": typeof lib_settings;
  "lib/validators": typeof lib_validators;
  licenses: typeof licenses;
  maintenance: typeof maintenance;
  mfa: typeof mfa;
  notifications: typeof notifications;
  orders: typeof orders;
  payments: typeof payments;
  preferences: typeof preferences;
  pricing: typeof pricing;
  publicViews: typeof publicViews;
  referenceData: typeof referenceData;
  reports: typeof reports;
  seed: typeof seed;
  seedHelpers: typeof seedHelpers;
  stripeActions: typeof stripeActions;
  stripeEvents: typeof stripeEvents;
  support: typeof support;
  suppression: typeof suppression;
  tpmo: typeof tpmo;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
