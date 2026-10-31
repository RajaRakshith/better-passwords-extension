import { describe, expect, it } from "vitest";
import { passwordForStyle, passwordSuggestions } from "../src/passwords/suggestions.ts";

describe("per-style password suggestions", () => {
  it("offers both default styles", () => {
    const result = passwordSuggestions({});
    expect(result.strong).toMatch(/^[a-zA-Z0-9]{6}-[a-zA-Z0-9]{6}-[a-zA-Z0-9]{6}$/);
    expect(result.alphanumeric).toMatch(/^[a-zA-Z0-9]{20}$/);
    expect(result.errors).toBeUndefined();
  });
  it("keeps a valid strong option when alphanumeric cannot meet a symbol requirement", () => {
    const result = passwordSuggestions({
      passwordRules: "required: lower; required: upper; required: digit; required: [!]; allowed: [-]",
    });
    expect(result.strong).toContain("!");
    expect(result.alphanumeric).toBeUndefined();
    expect(result.errors?.alphanumeric).toBeTruthy();
    expect(passwordForStyle(result, "strong")).toBe(result.strong);
    expect(() => passwordForStyle(result, "alphanumeric")).toThrow();
  });
  it("never caches a candidate for predictable rules", () => {
    const result = passwordSuggestions({ passwordRules: "allowed: [a]; maxlength: 1" });
    expect(result.strong).toBeUndefined();
    expect(result.alphanumeric).toBeUndefined();
    expect(result.errors?.strong).toBe("This site's restrictions prevent a strong password suggestion.");
    expect(() => passwordForStyle(result, "strong")).toThrow();
  });
  it.each(["__proto__", "errors", "account", "", null])("refuses invalid style %j", (style) => {
    expect(() => passwordForStyle({ strong: "valid-test-password", account: "test-account" }, style)).toThrow();
  });
});
