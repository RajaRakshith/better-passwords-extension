# Dependency remediation (2026-10-30)

Scan: npm bulk advisory endpoint, exact versions from the committed Bun lockfile.
Run from the repository root: `bun scripts/security/audit-dependencies.ts --check`.
Exit 0 means no returned matches, 1 means advisory matches, and 2 means the scan failed.
The scanner reports all submitted versions beside each affected range; a listed version is not necessarily inside every returned range.

## Updated tooling

| Package | Before | After |
|---|---|---|
| happy-dom | 21.0.1 | 21.0.4 |
| web-ext | 10.7.0 | 10.8.0 |
| wxt | 0.21.4 | 0.21.5 |
| shell-quote (through fx-runner) | 1.10.0 | 1.12.0 |
| fast-uri | 3.1.8 | 3.1.9 |
| node-forge | 1.4.0 | 1.4.2 |
| undici | 6.29.0 / 7.30.0 | 6.29.1 / 7.30.1 |

JSON5 2.2.3, previously transitive through WXT, is now declared directly for the lockfile scanner.
No major-version overrides were used. Installation suppressed lifecycle scripts; WXT preparation ran explicitly.

## Remaining findings

The post-update scan at 2026-10-31T03:29:14Z checked 736 package names and returned:

- deepmerge 4.3.1: low, [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). Add-ons lint tooling pins this version; the published latest is also 4.3.1.
- glob 13.0.6: moderate, [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4). The release tool's npm dependency requires the 13.x line; no compatible update was returned.
- minimatch 10.2.6 / 3.1.5: moderate, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Tooling still requires older major lines; the returned patched range starts at 11.0.1.

These remain visible: the check intentionally exits 1. They are development/release dependencies, not declared browser credential-handling dependencies. This does not prove unreachable exploitation: avoid processing attacker-controlled release or lint inputs with credentials present. Resolving them may require parent-package changes or separately tested major-version migrations.

## Verification

- Scanner tests: 11 passed; tested duplicate versions, workspace exclusions, malformed lockfiles and network/advisory errors.
- Repository lint/typecheck/unit checks: 213 tests passed after updates.
- Chrome and Firefox production builds: passed.
- Firefox package validation: 0 errors, warnings or notices. Its optional update notifier could not write to the sandboxed user config directory; package validation itself exited 0.

Toolchain: temporary Bun 1.4.4, Node 22.15.0, macOS 27.0.1 arm64. This is a dependency/build check, not a live Apple-helper or Zen authentication test.
