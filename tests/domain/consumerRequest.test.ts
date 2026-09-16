import { describe, expect, it } from "vitest";
import {
  type ConsumerRequestInput,
  consumerRequestSchema,
  fieldErrors,
  firstIssue,
  reasonStepSchema,
  withdrawalSchema,
} from "../../src/domain/schemas/consumerRequest";

function request(overrides: Partial<Record<keyof ConsumerRequestInput, unknown>> = {}) {
  return {
    coverageType: "life",
    ageRange: "40 – 49",
    state: "GA",
    zip: "30301",
    budgetRange: "$50 – $100 a month",
    reason: "We just had our second child and want cover in place.",
    firstName: "Jane",
    lastName: "Doe",
    phone: "(404) 555-0199",
    email: "jane.doe@example.com",
    preferredContactMethod: "Phone call",
    consentDocumentId: "legalDocuments:abc123",
    consentAccepted: true,
    termsAccepted: true,
    ...overrides,
  };
}

const errorsFor = (input: unknown) => {
  const parsed = consumerRequestSchema.safeParse(input);
  return parsed.success ? {} : fieldErrors(parsed.error);
};

describe("consumer request schema", () => {
  it("accepts a complete request and fills optional defaults", () => {
    const parsed = consumerRequestSchema.parse(request());
    expect(parsed.pageUrl).toBe("");
    expect(parsed.bestTimeToCall).toBe("");
    expect(parsed.consentAccepted).toBe(true);
  });

  describe("reason (required, 10–1000 characters)", () => {
    it.each([
      ["missing", undefined],
      ["empty", ""],
      ["9 characters", "a".repeat(9)],
      ["only whitespace padding around 9 characters", `   ${"a".repeat(9)}   `],
      ["1001 characters", "a".repeat(1001)],
    ])("rejects %s", (_label, reason) => {
      expect(errorsFor(request({ reason }))).toHaveProperty("reason");
    });

    it.each([
      ["10 characters", "a".repeat(10)],
      ["1000 characters", "a".repeat(1000)],
    ])("accepts %s", (_label, reason) => {
      expect(errorsFor(request({ reason }))).toEqual({});
    });

    it("trims before measuring and explains the minimum", () => {
      const parsed = reasonStepSchema.safeParse({ reason: "  too short " });
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(firstIssue(parsed.error)).toMatch(/at least 10 characters/);
      expect(reasonStepSchema.parse({ reason: "  long enough now  " }).reason).toBe("long enough now");
    });
  });

  describe("consent", () => {
    it.each([false, "true", 1, undefined, null])("consentAccepted must be literally true (got %j)", (consentAccepted) => {
      expect(errorsFor(request({ consentAccepted }))).toHaveProperty("consentAccepted");
    });

    it("terms must be accepted", () => {
      expect(errorsFor(request({ termsAccepted: false }))).toHaveProperty("termsAccepted");
    });

    it("the displayed consent version id is required", () => {
      expect(errorsFor(request({ consentDocumentId: "" }))).toHaveProperty("consentDocumentId");
    });
  });

  it.each([
    ["phone", "555-0199"],
    ["email", "jane@example"],
    ["zip", "3030"],
    ["state", "Georgia"],
    ["state", "ga"],
    ["firstName", "   "],
    ["budgetRange", ""],
    ["preferredContactMethod", ""],
    ["ageRange", ""],
  ])("rejects an invalid %s (%j)", (field, value) => {
    expect(errorsFor(request({ [field]: value }))).toHaveProperty(field);
  });

  it("reports every invalid field once, keyed by field name", () => {
    const errors = errorsFor(request({ phone: "123", email: "nope", reason: "short" }));
    expect(Object.keys(errors).sort()).toEqual(["email", "phone", "reason"]);
  });
});

describe("withdrawal lookup schema", () => {
  it("requires a reference and a contact", () => {
    expect(withdrawalSchema.safeParse({ reference: "LB-2609-ABCDE", contact: "jane@example.com" }).success).toBe(true);
    expect(withdrawalSchema.safeParse({ reference: "LB", contact: "jane@example.com" }).success).toBe(false);
    expect(withdrawalSchema.safeParse({ reference: "LB-2609-ABCDE", contact: "" }).success).toBe(false);
  });
});
