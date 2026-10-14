# Releasing

Releases are automatic. [semantic-release](https://semantic-release.gitbook.io) runs on every push to `main` (`.github/workflows/release.yml`) and reads the [Conventional Commits](https://www.conventionalcommits.org) since the last release of each component:

| Component | Commits | Tags |
|---|---|---|
| Extension (with the shared packages) | everything not scoped `(companion)` | `extension-v*` |
| Companion app | `feat(companion): …`, `fix(companion): …` | `companion-v*` |

`scripts/release/component-commits.js` does the split, for both the version bump and the release notes.

| Commit | Release |
|---|---|
| `fix: …` | patch (1.2.3 → 1.2.4) |
| `feat: …` | minor (1.2.3 → 1.3.0) |
| `feat!: …` or a `BREAKING CHANGE:` footer | major |
| `docs:`, `chore:`, `ci:`, `test:`, `refactor:` … | no release |

When an extension release is due, CI:
1. sets the version in the checkout,
2. builds and zips the store (Chrome, Firefox) and GitHub builds,
3. creates the `extension-vX.Y.Z` tag and a GitHub release with notes and the zips,
4. attests build provenance for the zips (`gh attestation verify <zip> -R fanckush/apple-passwords-plus`),
5. submits to the Chrome Web Store and Firefox Add-ons, only once the repository variable `STORE_SUBMIT` is `true` and these secrets exist: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`, `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`. `bunx wxt submit init` walks through creating them.

Before the first store submission, replace `STORE_PUBLIC_KEY` and `STORE_EXTENSION_ID` in `apps/extension/src/config.ts` (and `CHROMIUM_IDS` in `scripts/setup-mac.sh`) with the values the Chrome Web Store assigns.

## Companion app

The companion job stays off until the repository variable `COMPANION_RELEASE` is `true`. An unsigned app would be blocked by Gatekeeper, so a release needs these secrets:

| Secret | What |
|---|---|
| `MACOS_CERTIFICATE` | Developer ID Application certificate with its private key, as a base64 `.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | Password of that `.p12` |
| `MACOS_SIGN_IDENTITY` | e.g. `Developer ID Application: Name (TEAMID)` |
| `NOTARY_KEY` | App Store Connect API key (`.p8`), base64 |
| `NOTARY_KEY_ID`, `NOTARY_ISSUER` | That key's ID and issuer |

`apps/companion/scripts/release.sh` builds a universal app, signs it with the hardened runtime, notarizes it, staples the ticket, and attaches the zip to a `companion-vX.Y.Z` GitHub release with build provenance.

Signed builds trust their native host by team ID, so the app and the host must be signed with the same Developer ID.
