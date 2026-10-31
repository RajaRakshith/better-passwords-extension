import { describe, expect, it } from "vitest";
import { countPasswords, sampleBelow, samplePassword } from "../src/passwords/password-space.ts";
import type { ParsedRules } from "../src/passwords/rules.ts";

const base: ParsedRules = { minLength: 0, maxLength: 64, allowed: "ab", required: [] };

describe("counted uniform password space", () => {
  it("counts unrestricted and repetition-constrained strings exactly", () => {
    expect(countPasswords(base, 3)).toBe(8n);
    expect(countPasswords({ ...base, maxConsecutive: 1 }, 64)).toBe(2n);
    expect(countPasswords({ ...base, allowed: "abc", required: ["ab", "bc"] }, 1)).toBe(1n);
    expect(countPasswords({ ...base, required: ["a", "b"] }, 1)).toBe(0n);
  });
  it("maps each uniformly sampled rank to one different valid string", () => {
    expect(Array.from({ length: 8 }, (_, rank) => samplePassword(base, 3, () => rank))).toEqual([
      "aaa",
      "aab",
      "aba",
      "abb",
      "baa",
      "bab",
      "bba",
      "bbb",
    ]);
    expect([0, 1].map((rank) => samplePassword({ ...base, maxConsecutive: 1 }, 3, () => rank))).toEqual(["aba", "bab"]);
  });
  it("rejects out-of-range randomness without modulo bias and stops after bounded attempts", () => {
    const bytes = [255, 4];
    expect(sampleBelow(5n, () => bytes.shift() ?? 255)).toBe(4n);
    expect(() => sampleBelow(5n, () => 255)).toThrow();
    expect(() => sampleBelow(5n, () => -1)).toThrow();
  });
  it("fails explicitly when hostile rules exceed the counting budget", () => {
    const allowed = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
    expect(() => countPasswords({ ...base, allowed, required: [..."abcdefgh"], maxConsecutive: 2 }, 64)).toThrow();
  });
});
