import { describe, expect, it } from "vitest";
import { parseRules, rulesForStyle } from "../src/passwords/rules.ts";

describe("bounded password rules", () => {
  it("unions allowed and required classes and tightens repeated lengths", () => {
    const rules = parseRules({
      minLength: 12,
      maxLength: 30,
      passwordRules: "minlength: 10; maxlength: 25; required: [ab]; allowed: [bc]; required: [ab]",
    });
    expect(rules).toMatchObject({ minLength: 12, maxLength: 25, allowed: "abc", required: ["ab"] });
  });
  it("keeps literal clause punctuation and closing brackets inside custom sets", () => {
    expect(parseRules({ passwordRules: "allowed: [a;,]]" }).allowed).toBe("a;,]");
  });
  it("does not discard a symbol requirement to generate an alphanumeric password", () => {
    expect(() =>
      rulesForStyle("alphanumeric", parseRules({ passwordRules: "allowed: ascii-printable; required: [!]" })),
    ).toThrow();
  });
  it.each([
    { minLength: 65 },
    { minLength: -1 },
    { maxLength: 1.5 },
    { maxLength: Number.NaN },
    { minLength: 20, maxLength: 10 },
    { passwordRules: "maxlength: -3" },
    { passwordRules: "required:" },
    { passwordRules: "allowed: constructor" },
    { passwordRules: "allowed: __proto__" },
    { passwordRules: "allowed: unicode" },
    { passwordRules: "max-sequential: 2" },
    { passwordRules: "allowed: [a-z]" },
    { passwordRules: "allowed: [💥]" },
    { passwordRules: "x".repeat(4097) },
    { passwordRules: "minlength: 1;".repeat(129) },
    {
      passwordRules:
        "required: [a];required: [b];required: [c];required: [d];required: [e];required: [f];required: [g];required: [h];required: [i]",
    },
  ])("refuses invalid or unsupported input %j", (rules) => {
    expect(() => parseRules(rules)).toThrow();
  });
});
