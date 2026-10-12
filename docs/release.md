# Releasing

Releases are automatic. [semantic-release](https://semantic-release.gitbook.io) runs on every push to `main` (`.github/workflows/release.yml`) and reads the [Conventional Commits](https://www.conventionalcommits.org) since the last `extension-v*` tag:

| Commit | Release |
|---|---|
| `fix: …` | patch (1.2.3 → 1.2.4) |
| `feat: …` | minor (1.2.3 → 1.3.0) |
| `feat!: …` or a `BREAKING CHANGE:` footer | major |
| `docs:`, `chore:`, `ci:`, `test:`, `refactor:` … | no release |

When a release is due, CI:
1. sets the version in the checkout,
2. builds and zips the store (Chrome, Firefox) and GitHub builds,
3. creates the `extension-vX.Y.Z` tag and a GitHub release with notes and the zips,
4. attests build provenance for the zips (`gh attestation verify <zip> -R fanckush/apple-passwords-plus`),
5. submits to the Chrome Web Store and Firefox Add-ons, only once the repository variable `STORE_SUBMIT` is `true` and these secrets exist: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`, `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`. `bunx wxt submit init` walks through creating them.

Before the first store submission, replace `STORE_PUBLIC_KEY` and `STORE_EXTENSION_ID` in `apps/extension/src/config.ts` (and `CHROMIUM_IDS` in `scripts/setup-mac.sh`) with the values the Chrome Web Store assigns.
