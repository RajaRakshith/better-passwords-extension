# Dependency Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove known vulnerable development/release dependency versions where compatible fixes exist and report unresolved findings accurately.

**Architecture:** Scan exact versions from Bun's lockfile, trace each finding to its parent tooling, update manifests/lockfile and repeat checks. No browser runtime behavior changes.

**Tech Stack:** Bun >=1.3, TypeScript, npm bulk advisory API, existing test/build tools.

**Spec:** [Approved design](../specs/2026-10-30-security-fixes-design.md); execution context and global constraints in [master plan](2026-10-30-security-fixes.md).

## Global Constraints

- Suppress initial dependency install scripts; run only explicit required preparation. No release credentials during installation.
- Update affected direct/parent packages before using narrow documented overrides; preserve the existing stack and lockfile integrity.
- Separate package-level matches from demonstrated reachable vulnerabilities; no claim that every advisory implies browser password exposure.

## Review Focus

1. Duplicate package versions must all be scanned (Task 1).
2. Workspace/file references must not be sent as npm versions (Task 1).
3. Offline/invalid advisory responses must fail the check, never mean zero findings (Task 1).
4. A vulnerable dependency pinned by a parent may survive a direct update (Task 1).
5. Build/install compatibility matters beyond unit tests (Task 1 and master Task 9).

---

### Task 1: Auditable dependency remediation

**Files:** Modify root `package.json`, `apps/extension/package.json`, `bun.lock` as needed; create `scripts/security/audit-dependencies.ts`, `scripts/security/audit-dependencies.test.ts`, `docs/dependency-security.md`.

**Interfaces:** Export `lockedNpmVersions(lockText: string): Record<string, string[]>` and `auditDependencies(packages: Record<string, string[]>, fetchImpl: typeof fetch): Promise<AdvisoryMatch[]>`; `AdvisoryMatch` contains `name`, `versions: string[]`, `id`, `severity`, `vulnerableRange`, `url`. CLI `bun scripts/security/audit-dependencies.ts --check` exits 0 for no matches, 1 for matches, 2 for scan/network/parse failure. Return raw advisory ranges without claiming each returned version matches every range. No silent allowlist.

Test anchor (construct the lockfile fixture inline, using Bun's actual `packages` tuple format):
```ts
it("preserves duplicate versions without scanning workspace references", () => {
  expect(lockedNpmVersions(lockFixture)).toEqual({ undici: ["6.29.0", "7.30.0"] });
});
```

- [ ] Add fixture tests with assertions: two Undici versions are retained once each; `workspace:*` is excluded; trailing commas parse correctly; malformed lockfile throws; a fake high advisory produces a match; HTTP 503 or malformed JSON rejects. Example: `expect(lockedNpmVersions(fixture).undici).toEqual(["6.29.0", "7.30.0"])` after deterministic sorting.
- [ ] Run `bunx --no-install vitest run scripts/security/audit-dependencies.test.ts`; expect failure because the scanner exports do not exist.
- [ ] Implement the scanner using JSON5 (already present transitively through WXT; declare it as an audited root devDependency before importing it directly) so its parser works both in Bun CLI and Node-based Vitest. Do not regex-remove comments inside strings. Query only public package names/versions, validate the advisory response shape, de-duplicate records and preserve raw evidence in the report. Importing the module must not trigger network access; CLI entrypoint alone runs a scan.
- [ ] Run the test command; expect all scanner tests to pass. Run the CLI against the original lockfile and record the fresh findings/parent chains in `docs/dependency-security.md`. Treat previous audit versions as leads, not current truth.
- [ ] Update affected direct/parent packages and resolve the lockfile with scripts suppressed. Check current registry releases/advisories before selecting versions. Known previous leads: Happy DOM 21.0.1, shell-quote 1.10.0 through fx-runner, node-forge 1.4.0 through adbkit, Undici 6.29.0/7.30.0, fast-uri 3.1.8 and deepmerge 4.3.1. If no compatible parent update exists, explain and test any override; otherwise leave the match visible and document it.
- [ ] Run explicit WXT preparation, `bun run check`, `bun run build`, `bun run --filter @app/extension lint:firefox` and the CLI. Expect all code/build checks to pass; expect scan exit 0 or an explicit unresolved-finding record. Update docs with before/after versions, fixed ranges, runtime versus tooling roles and compatibility results.
- [ ] Run `git diff --check`; stage only scanner/tests/manifests/lockfile/report and commit `chore: remediate vulnerable development dependencies`.
