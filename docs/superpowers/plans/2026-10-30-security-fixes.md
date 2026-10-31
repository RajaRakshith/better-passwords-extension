# BetterPasswordsClone Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix credential association, session expiry, password generation and vulnerable tooling while retaining inline suggestions in Zen.

**Architecture:** Four independently testable subsystem plans, executed sequentially because they share background wiring and settings. Use conservative native-request lifetimes, session generations, system-idle expiry and a local generator with a counted output space. Finish with cross-component tests and a manual Zen validation checklist.

**Tech Stack:** TypeScript, WXT, Web Crypto, Bun >=1.3, Vitest, Happy DOM, Playwright; existing Swift companion remains unchanged.

**Spec:** [Approved design](../specs/2026-10-30-security-fixes-design.md).

## Global Constraints

- Target Zen on macOS; retain inline suggestions. Firefox clickjacking mitigation is deferred and must not be represented as fixed.
- Password reads expire after 120 seconds; cancellation/ambiguous timeouts close the native connection and require fresh pairing.
- System-inactivity choices: 5, 15, 30, 60 minutes and Never; default 15 minutes. Preserve explicit existing screen-lock preferences; fresh Chromium default is enabled.
- Apple-style generation stays local; default distribution >=71 bits, constrained output >=64 bits, generation length <=64 characters.
- Preserve plain TypeScript/DOM UI, secure Web Crypto randomness, Apple vault integration, optional Touch ID and existing save behavior.
- No real credentials in tests/logs, remote publication, everyday-profile installation, new native permissions or private generator API.
- Execute in an isolated worktree using `superpowers:using-git-worktrees`; commit each independently verified task. Do not implement during plan review.

## Review Focus

1. A lock while an asynchronous operation is decrypting must prevent a later fill (credential plan, Task 2).
2. An old popup/menu after navigation must not reinterpret its selection for the new site (credential plan, Task 2).
3. Worker suspension or changing settings while already idle must not leave a stale unlocked session (expiry plan, Task 1).
4. Almost-deterministic password rules must not pass a naive alphabet-size strength check (generation plan, Task 1).
5. A packaging failure or remaining advisory must be visible in the handoff rather than hidden behind passing unit tests (validation below).

---

## Execution order and file ownership

1. [Dependency remediation](2026-10-30-dependency-remediation.md): establish a patched test/build environment; owns manifests, lockfile and advisory report.
2. [Credential isolation](2026-10-30-credential-isolation.md): owns protocol client, session epochs and the extracted fill coordinator; adds origin fields to fill messages and UI callers.
3. [Session expiry](2026-10-30-session-expiry.md): owns settings normalization and idle policy; wires the access guard into credential operations.
4. [Password generation](2026-10-30-password-generation.md): owns generation/counting/rules, generation UI errors and relevant background wiring.
5. Final cross-component validation and documentation below.

The dependency step precedes behavioral fixes so tests do not need to run on the vulnerable DOM dependency. It must not bundle behavioral changes. Subsystem plans can ship their own focused commits; do not execute them concurrently against shared entrypoints.

## Task 0: Establish the execution workspace and baseline

**Files:** Existing `CONTRIBUTING.md`, manifests, lockfile and tests; create no product files in this task.

**Interfaces:** Consumes the approved spec and four linked plans; produces an isolated working directory, identified runtime versions and a baseline record in the eventual validation report.

- [ ] Use `superpowers:using-git-worktrees` to create or select an isolated development workspace containing the approved design and these plans. Inspect applicable `AGENTS.md` instructions there.
- [ ] Record `git status --short`, `git rev-parse HEAD`, `node --version`, `bun --version` and `sw_vers`. Bun was absent on PATH during planning; obtain a verified Bun >=1.3 at execution time before proceeding. Do not silently substitute npm for Bun's committed lockfile.
- [ ] Install with `bun install --frozen-lockfile --ignore-scripts`, then explicitly run `bun run --filter @app/extension typecheck` for WXT preparation. Do not install git hooks or expose release credentials. If the old test dependency makes a baseline unsafe, limit the initial baseline to static checks; record that and complete the dependency plan before running DOM tests.
- [ ] Execute subsystem plans in the order above. Capture existing failures separately from regressions; do not lower assertions to produce a green baseline.

## Task 9: Integrated verification and Zen handoff

**Files:** Create `apps/extension/e2e/security.spec.ts` and `docs/security-validation.md`; modify `docs/architecture.md`, `docs/protocol.md`, `docs/threat-model.md`, `apps/extension/e2e/fixtures.ts`, `packages/fake-helper/src/main.ts`; use existing `pages/login.html`, `pages/signup.html`.

**Interfaces:** Consumes origin-bound fill messages, session epochs/access checks, `idleTimeoutMinutes` and generation errors from the four subsystem plans. Produces a checked build and a truthful automated/manual test report.

Test-local fixture additions: `holdPasswordReplies: boolean` (default false) and `releasePasswordReplies(): void`. When enabled, the native fake host holds replies at a file gate under the temporary profile via `FAKE_HELPER_REPLY_GATE`; release creates that file. Restrict the gate to the test host, bound waiting to 10 seconds, and always release it in fixture teardown. Existing `passwordReads()` lets tests wait until the request reached the helper before navigating/locking. Avoid timing-only sleeps to establish ordering.

- [ ] Write failing integration scenarios before changing integration code: selected origin changes before fill (password remains empty), Lock occurs while lookup is pending (no subsequent fill), incompatible signup rules display an error and leave the field empty, default inactivity setting is 15 and saved choices survive popup reopening. Use fake-helper controls scoped to test profiles; never add production test bypasses.
- [ ] Run `bun run --filter @app/extension build:chrome`, then from `apps/extension` run `bunx --no-install playwright test e2e/security.spec.ts`; verify the new scenarios expose any remaining integration defects. If they already pass from subsystem work, record them as integration coverage rather than claiming they were failing regression tests.
- [ ] Repair only demonstrated wiring defects and rerun the affected subsystem tests plus `security.spec.ts`. Keep each new defect's red/green evidence and commit focused repairs separately.
- [ ] Run from repository root: `bun run check`, `bun run build`, `bun run --filter @app/extension lint:firefox`, `bun run test:e2e`. Expect exit code 0 for every command and no newly skipped tests. Install Playwright Chromium only when needed via the existing documented workflow; identify unavailable system/network prerequisites explicitly.
- [ ] Run `bun scripts/security/audit-dependencies.ts --check` after the final install/build. Record exact lockfile versions, advisory timestamp and any remaining package-level matches, even if not runtime reachable.
- [ ] Inspect both output manifests/bundles for unexpected permissions, new network endpoints or test-only controls. Record that local builds retain the upstream extension identity and are not a separately signed/updateable fork distribution.
- [ ] Write `docs/security-validation.md`: commands/results, before/after regression evidence, entropy-count reasoning, dependency findings, unchanged Firefox clickjacking limitation and manual checks outstanding.
- [ ] Include manual Zen steps: create a separate profile, load the Firefox build using temporary add-on tooling, connect through the supported Firefox/Zen setup, pair using disposable logins only; check site metadata acceptance, cancelled Touch ID recovery through Lock/re-pair, same username across two sites, navigation during a pending request, sequential fills, 5-minute inactivity, generated signup and save/recovery. Do not run these steps against personal accounts without explicit user direction. Temporary add-on persistence/signing constraints must be reported; do not disable Firefox signature enforcement in an everyday profile.
- [ ] Update protocol/session/generation documentation to match implemented behavior. Run `git diff --check`, review the full diff, invoke `superpowers:requesting-code-review`, address substantive feedback and rerun only affected checks.
- [ ] Commit docs/tests with `test: verify security fixes and document Zen validation`. Use `superpowers:verification-before-completion` and `superpowers:finishing-a-development-branch` for the final handoff; do not publish or merge automatically.

## Plan self-review

- Spec coverage: credential request association and stale selection → credential Tasks 1–2; expiry/settings/update policy → expiry Tasks 1–2; format/strength/rules/errors → generation Tasks 1–2; dependency cleanup → dependency Task 1; integration/live-helper limitations → Task 9 above.
- All tasks use concrete interfaces and red/green steps; runtime version/dependency availability are checked at execution, not assumed from planning.
- Security floors and timeout values match the approved spec. No source code, dependencies, permissions or browser settings have been changed by writing this plan.
- Execution method is not yet selected. Recommend task-by-task subagent implementation/review because credential mistakes have high impact; native execution with final independent review is the lower-overhead alternative.

Tool references checked during planning: [Bun local-only package execution](https://bun.sh/docs/pm/bunx) and [Bun installation/script controls](https://bun.sh/docs/pm/cli/install). The plan uses `--no-install` for test commands and `--ignore-scripts` for initial installation; actual runtime compatibility is verified during execution.
