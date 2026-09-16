import { describe, expect, it } from "vitest";
import { STAFF_ROLES } from "../../src/domain/constants";
import { type Permission, PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } from "../../src/domain/permissions";

describe("staff permission matrix", () => {
  it("ADMIN holds every permission", () => {
    for (const permission of PERMISSIONS) expect(roleHasPermission("ADMIN", permission)).toBe(true);
  });

  it.each<[string, Permission]>([
    ["FINANCE", "leads.pii"],
    ["FINANCE", "legal.publish"],
    ["FINANCE", "leads.manage"],
    ["FINANCE", "disputes.decide"],
    ["FINANCE", "distribution.manage"],
    ["CONTENT", "refunds.issue"],
    ["CONTENT", "legal.publish"],
    ["CONTENT", "leads.read"],
    ["CONTENT", "ledger.adjust"],
    ["SUPPORT", "ledger.adjust"],
    ["SUPPORT", "refunds.issue"],
    ["SUPPORT", "pricing.manage"],
    ["SUPPORT", "distribution.manage"],
    ["SUPPORT", "legal.publish"],
    ["SUPPORT", "users.manage"],
  ])("%s cannot %s", (role, permission) => {
    expect(roleHasPermission(role, permission)).toBe(false);
  });

  it.each<[string, Permission]>([
    ["FINANCE", "ledger.adjust"],
    ["FINANCE", "refunds.issue"],
    ["FINANCE", "pricing.manage"],
    ["FINANCE", "leads.read"],
    ["SUPPORT", "leads.pii"],
    ["SUPPORT", "disputes.decide"],
    ["SUPPORT", "leads.manage"],
    ["SUPPORT", "suppression.manage"],
    ["CONTENT", "legal.draft"],
    ["CONTENT", "cms.manage"],
  ])("%s can %s", (role, permission) => {
    expect(roleHasPermission(role, permission)).toBe(true);
  });

  it("legal.publish is ADMIN-only (four-eyes approver pool)", () => {
    expect(STAFF_ROLES.filter((role) => roleHasPermission(role, "legal.publish"))).toEqual(["ADMIN"]);
  });

  it("distribution.manage and users.manage are ADMIN-only", () => {
    expect(STAFF_ROLES.filter((role) => roleHasPermission(role, "distribution.manage"))).toEqual(["ADMIN"]);
    expect(STAFF_ROLES.filter((role) => roleHasPermission(role, "users.manage"))).toEqual(["ADMIN"]);
  });

  it("account roles, unknown roles and missing roles have no staff permissions", () => {
    for (const role of ["AGENT", "AGENCY_PRINCIPAL", "PRODUCER", "admin", "ROOT", "", null, undefined]) {
      for (const permission of PERMISSIONS) expect(roleHasPermission(role, permission)).toBe(false);
    }
  });

  it("every role only lists known permissions", () => {
    const known = new Set<string>(PERMISSIONS);
    for (const role of STAFF_ROLES) for (const permission of ROLE_PERMISSIONS[role]) expect(known.has(permission)).toBe(true);
  });
});
