import { describe, expect, it } from "vitest";
import {
  formatUsPhone,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizeName,
  normalizeStateCode,
  normalizeUsPhone,
  normalizeZip,
} from "../../src/domain/normalize";
import { isWithinReceivingHours, localHour, startOfLocalDay } from "../../src/domain/time";

describe("US phone → E.164", () => {
  it.each([
    ["(404) 555-0148", "+14045550148"],
    ["404-555-0148", "+14045550148"],
    ["404.555.0148", "+14045550148"],
    ["4045550148", "+14045550148"],
    ["1 404 555 0148", "+14045550148"],
    ["+1 (404) 555-0148", "+14045550148"],
    ["  +14045550148  ", "+14045550148"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeUsPhone(input)).toBe(expected);
  });

  it("the same number typed differently normalises to the same value (dedup + suppression match)", () => {
    const variants = ["(912) 555-0233", "912 555 0233", "+19125550233", "1-912-555-0233"];
    expect(new Set(variants.map(normalizeUsPhone))).toEqual(new Set(["+19125550233"]));
  });

  it.each([
    ["too short", "404-555-014"],
    ["too long", "404-555-01488"],
    ["11 digits without the country code 1", "24045550148"],
    ["area code starting with 0", "(004) 555-0148"],
    ["area code starting with 1", "(104) 555-0148"],
    ["exchange starting with 0", "(404) 055-0148"],
    ["exchange starting with 1", "(404) 155-0148"],
    ["non-US country code", "+44 20 7946 0958"],
    ["letters", "call me"],
    ["empty", ""],
  ])("rejects %s", (_label, input) => {
    expect(normalizeUsPhone(input)).toBeNull();
  });

  it("handles null / undefined", () => {
    expect(normalizeUsPhone(null)).toBeNull();
    expect(normalizeUsPhone(undefined)).toBeNull();
  });

  it("formats and masks E.164 numbers", () => {
    expect(formatUsPhone("+14045550148")).toBe("(404) 555-0148");
    expect(formatUsPhone(null)).toBe("—");
    expect(maskPhone("+14045550148")).toBe("•••0148");
  });
});

describe("email", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
  });

  it.each(["jane@example", "jane doe@example.com", "@example.com", "jane@", "jane@example.c", "", "jane@@example.com"])("rejects %j", (input) => {
    expect(normalizeEmail(input)).toBeNull();
  });

  it("masks the local part", () => {
    expect(maskEmail("jane.doe@example.com")).toBe("j•••@example.com");
    expect(maskEmail("not-an-email")).toBe("••••");
  });
});

describe("ZIP, state and name", () => {
  it.each([
    ["30301", "30301"],
    [" 30301 ", "30301"],
    ["30301-1234", "30301"],
    ["303011234", "30301"],
  ])("ZIP %j → %s", (input, expected) => {
    expect(normalizeZip(input)).toBe(expected);
  });

  it.each(["3030", "303011", "ABCDE", "30301-12", "", null])("rejects ZIP %j", (input) => {
    expect(normalizeZip(input)).toBeNull();
  });

  it("normalises state codes", () => {
    expect(normalizeStateCode(" ga ")).toBe("GA");
    expect(normalizeStateCode("Georgia")).toBeNull();
    expect(normalizeStateCode("G1")).toBeNull();
  });

  it("collapses whitespace in names", () => {
    expect(normalizeName("  Mary   Ann  ")).toBe("Mary Ann");
    expect(normalizeName(undefined)).toBe("");
  });
});

describe("timezone helpers", () => {
  const instant = Date.UTC(2026, 8, 16, 18, 0, 0); // EDT = UTC-4, CDT = UTC-5

  it("reports the local hour in the account timezone", () => {
    expect(localHour(instant, "America/New_York")).toBe(14);
    expect(localHour(instant, "America/Chicago")).toBe(13);
  });

  it("finds local midnight for the daily pace", () => {
    expect(startOfLocalDay(instant, "America/New_York")).toBe(Date.UTC(2026, 8, 16, 4, 0, 0));
    expect(startOfLocalDay(instant, "America/Chicago")).toBe(Date.UTC(2026, 8, 16, 5, 0, 0));
    // 02:00 UTC on the 17th is still the 16th in Chicago.
    expect(startOfLocalDay(Date.UTC(2026, 8, 17, 2, 0, 0), "America/Chicago")).toBe(Date.UTC(2026, 8, 16, 5, 0, 0));
  });

  it("falls back to Eastern time for an unknown timezone", () => {
    expect(localHour(instant, "Not/AZone")).toBe(14);
  });

  it("supports overnight receiving windows", () => {
    const threeAmEastern = Date.UTC(2026, 8, 16, 7, 0, 0);
    expect(isWithinReceivingHours(threeAmEastern, "America/New_York", 22, 6)).toBe(true);
    expect(isWithinReceivingHours(instant, "America/New_York", 22, 6)).toBe(false);
    expect(isWithinReceivingHours(instant, "America/New_York", 9, 9)).toBe(true);
  });
});
