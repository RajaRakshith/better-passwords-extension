# Apple-Style Password Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep familiar Apple-style suggestions while refusing weak, impossible or unsupported website restrictions.

**Architecture:** Separate bounded rule parsing, output-space counting/sampling and menu presentation. Preserve the existing Apple-style default only when the entire distribution satisfies the rules; otherwise uniformly sample a counted valid space. Generate locally and send only approved successful suggestions to the existing menu.

**Tech Stack:** TypeScript BigInt, Web Crypto, existing plain DOM menus, Vitest and Playwright integration in the master plan.

**Spec:** [Approved design](../specs/2026-10-30-security-fixes-design.md); [master plan](2026-10-30-security-fixes.md).

## Global Constraints

- Default Apple-style distribution >=71 bits; site-constrained suggestions >=64 bits. Never return weaker output with a warning-only fallback.
- Default strong format is three groups of six characters separated by two hyphens: sixteen lowercase characters, one uppercase and one digit. Retain a 20-character alphanumeric alternative.
- Use secure randomness without modulo bias. No remote code/rules fetch, private native API or persistent generated-password vault.
- Maximum output length 64; contradictions/exhausted attempts/unsupported recognized restrictions yield typed errors, never a last failed candidate.

## Review Focus

1. Overlapping required classes can miscount output multiplicity (Task 1).
2. A binary alphabet with max-consecutive 1 has only two strings at any positive length (Task 1).
3. A constrained subset of Apple-shaped output may have less entropy than the unconstrained default (Task 1).
4. Hostile rule sizes/values can exhaust the background worker (Task 1).
5. A required symbol can invalidate alphanumeric output while the strong style remains usable (Task 2).

---

### Task 1: Bounded rules and a counted generation distribution

**Files:** Modify `apps/extension/src/passwords/generate.ts`, `test/generate.test.ts`; create `src/passwords/rules.ts`, `src/passwords/password-space.ts`, `test/password-rules.test.ts`, `test/password-space.test.ts`, `docs/password-generation.md`; update `NOTICE` only if reference code is actually reused. Source/test paths after the first are relative to `apps/extension/`; docs and NOTICE are at repo root.

**Interfaces:** Keep `generatePassword(style: PasswordStyle, fieldRules?: FieldRules, random?: RandomIndex): string` and re-export `parseRules` for existing callers/tests. Export `PasswordGenerationError` with `code: "weak-rules" | "invalid-rules" | "unsupported-rules" | "generation-failed"`. `rules.ts` exports `ParsedRules` (effective min/max length, unique allowed alphabet, required sets and optional maxConsecutive), `parseRules(fieldRules: FieldRules): ParsedRules` and `rulesForStyle(style: PasswordStyle, rules: ParsedRules): ParsedRules`. `password-space.ts` exports `countPasswords(rules: ParsedRules, length: number): bigint`, `samplePassword(rules: ParsedRules, length: number, random?: RandomIndex): string`, `sampleBelow(limit: bigint, random?: RandomIndex): bigint`. Internal count/sample must share the same transitions.

Test anchor:
```ts
it("rejects a long but deterministic alternating password", () => {
  expect(() => generatePassword("strong", {
    passwordRules: "allowed: [ab]; max-consecutive: 1; minlength: 64; maxlength: 64",
  })).toThrow(PasswordGenerationError);
});
```

- [ ] Add small exhaustive-space tests independent of production strength floors: alphabet ab, length 3 → count 8; same with maxConsecutive 1 → count 2; required sets `[ab]` and `[bc]` over abc at length 1 → count 1; disjoint required sets at insufficient length → count 0. Enumerate all ranks of tiny spaces through an injected rank/byte source and assert every valid string appears exactly once. Keep deterministic test randomness out of production configuration.
- [ ] Add generation tests: default shape/counts and independently calculated support >=2^71; alphanumeric contains no symbols; maxlength 12 with normal alphabet succeeds with proven count >=2^64; only eight digits at length 8 rejects weak-rules; digit-only length up to 64 increases to a length whose count >=2^64; allowed `[a]` maxlength1 and binary/no-repeat reject weak-rules; minlength greater than maxlength rejects invalid-rules; required symbols plus alphanumeric style rejects rather than dropping the requirement; impossible rules never return a final attempt. Use count assertions rather than uniqueness samples as evidence of entropy.
- [ ] Add bounded-input tests: negative/fractional/nonfinite/inconsistent HTML length values; rule text >4096 characters; >8 distinct required sets; >64 minimum length; >95 printable ASCII alphabet characters; excessive parser tokens (>128); and count computation budgets exceeded all terminate explicitly. Validate policy for unknown directives versus recognized unsupported directives. The chosen policy is to reject unknown/nonempty directives with unsupported-rules and malformed recognized directives with invalid-rules; empty trailing separators are allowed. Document this stricter compatibility choice.
- [ ] Run `bunx --no-install vitest run --project extension`; expect failing count/rules/generation regressions. Preserve tests that establish secure randomness/shape; replace old tests that explicitly expect insecure numeric-only or alternating output to succeed.
- [ ] Implement parser according to Apple's published grammar for supported clauses, including required/allowed union semantics and bracket literals; compare against the official reference parser and add fixtures for any divergence. Use existing printable ASCII generation alphabets unless a documented rule requires additional printable characters. If source is vendored, pin its revision/license and preserve notices; otherwise record the reference and deviations in comments/docs. No runtime parser download.
- [ ] Implement memoized BigInt completion counts by `(position, satisfied-required-mask, previous-character, run-length)`, capped at 50,000 memo states and 2,000,000 explored transitions; overflow yields unsupported-rules. Sample uniformly by choosing an unbiased BigInt rank then walking branches weighted by completion counts. `sampleBelow` draws bytes through the existing unbiased `RandomIndex(256)`, masks unused high bits and rejects out-of-range candidates; stop after 128 failed draws with generation-failed. Test bounds with injected sources; no modulo reduction of the final rank.
- [ ] Choose the shortest supported length at least the preferred 20 (or a shorter site maximum), increasing within 64 until count >=2^64. A zero count means impossible requirements; positive insufficient count means weak restrictions. Retain the Apple-shaped path only when a conservative compatibility predicate proves every possible shaped output satisfies every supported restriction. Its support is `LOWER.length^16 * UPPER.length * DIGIT.length * 18 * 17` for strong style; account separately for the alphanumeric suffix distribution. Otherwise use counted sampling. Never multiply an unconstrained alphabet estimate for a restricted shaped subset.
- [ ] Run the full extension project and `bun run typecheck`; expect success. Document the exact distribution proof, computation limits and rule policy in `docs/password-generation.md`, then commit `fix: enforce counted strength in Apple-style password generation` after `git diff --check`.

### Task 2: Safe per-style suggestions and useful errors

**Files:** Modify `apps/extension/src/messages.ts`, `entrypoints/background.ts`, `entrypoints/menu/main.ts`; create `src/passwords/suggestions.ts`, `test/password-suggestions.test.ts`, `test/generation-menu.test.ts`; update `docs/architecture.md` and `docs/password-generation.md`.

**Interfaces:** Change `GeneratedPasswords` to `{strong?: string; alphanumeric?: string; errors?: Partial<Record<PasswordStyle, string>>; account?: string}`. Export `passwordSuggestions(rules: FieldRules): GeneratedPasswords` from `suggestions.ts`, returning only successful style outputs plus safe user-facing errors. `generate-passwords` keeps its existing response type name; `use-generated-password` must reject an unavailable style. Keep account guessing in the background and merge it into the response, not in the pure generator.

Test anchor:
```ts
it("offers no candidate under a predictable single-character rule", () => {
  const result = passwordSuggestions({ passwordRules: "allowed: [a]; maxlength: 1" });
  expect(result.strong).toBeUndefined();
  expect(result.alphanumeric).toBeUndefined();
  expect(result.errors?.strong).toBe("This site's restrictions prevent a strong password suggestion.");
});
```

- [ ] Add tests: required `[!]` can yield a valid strong suggestion and an unavailable alphanumeric choice; restrictive low-entropy rules yield neither password and an explanation; background cache never stores a failed candidate; selecting an unavailable style returns a recoverable error and never relays a fill. Existing valid default suggestions still offer both styles.
- [ ] Add DOM assertions against the actual menu rendering: no button labelled Strong Password exists for rejected output, weak/conflicting/unsupported errors are readable text, a successful alternate style remains selectable, manual field entry is unaffected, and no error message includes candidate passwords. Extract a small rendering helper only if required to test the real behavior rather than a duplicate implementation.
- [ ] Run `bunx --no-install vitest run --project extension`; expect new message/UI assertions to fail.
- [ ] Implement per-style result handling and adjust every `GeneratedPasswords` consumer, including generatedForMenu and account-preserving fill paths. Error copy: weak → `This site's restrictions prevent a strong password suggestion.`; invalid → `This site's password requirements conflict or are invalid.`; unsupported → `This site's password requirements aren't supported.`; exhausted randomness → `Couldn't generate a password. Try again.` Keep the existing manually typed save flow and deferred clickjacking guards unchanged.
- [ ] Run `bunx --no-install vitest run --project extension`, `bun run typecheck`, `bun run build`; expect all to pass. Commit `fix: surface password rule failures without weak suggestions` after `git diff --check`. Master Task 9 adds real-browser signup/save coverage.
