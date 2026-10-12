# Security policy

This extension handles passwords, so security reports get top priority.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through GitHub:
[Security → Report a vulnerability](https://github.com/fanckush/apple-passwords-plus/security/advisories/new).

Include what you found, how to reproduce it, and the impact you expect. Never include real passwords or pairing codes. You should get a first reply within 7 days. We'll keep you updated, and we'll credit you in the advisory unless you prefer not to be named.

## Scope

In scope:
- the extension (all builds)
- `packages/*`
- `scripts/setup-mac.sh`
- the release pipeline

Problems in Apple's own helper or in macOS belong with [Apple](https://security.apple.com). If you're unsure, report it here and we'll help route it.

## Supported versions

Only the latest release gets security fixes.

See [docs/threat-model.md](docs/threat-model.md) for what the extension defends against and why.
