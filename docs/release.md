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
2. builds and zips the Chromium and Firefox packages, plus reviewer source,
3. creates the `extension-vX.Y.Z` tag and a GitHub release with notes and the zips,
4. attests build provenance for the zips (`gh attestation verify <zip> -R fanckush/better-passwords-extension`),
5. submits to each browser store independently when its repository variable is `true`:
   - `CHROME_STORE_SUBMIT` submits to the Chrome Web Store (API v2) and needs `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, and `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`.
   - `FIREFOX_STORE_SUBMIT` submits to Firefox Add-ons and needs `FIREFOX_JWT_ISSUER` and `FIREFOX_JWT_SECRET`.

   For Firefox-only publishing, set `FIREFOX_STORE_SUBMIT=true` and leave `CHROME_STORE_SUBMIT` unset or `false`. `bunx wxt submit init` (in `apps/extension`) writes the credentials to the git-ignored `.env.submit`; the non-secret submit settings live in `release.yml`. To upload the secrets from that file:

   For Firefox-only publishing, upload just its two secrets:

   ```sh
   for n in FIREFOX_JWT_ISSUER FIREFOX_JWT_SECRET; do
     bun --env-file=apps/extension/.env.submit -e "process.stdout.write(process.env.$n)" | gh secret set "$n"
   done
   ```

   Add the three `CHROME_*` secrets only when enabling Chrome publishing.

The Chrome Web Store extension ID is `ocongmkplhijgajnipnhhggfcjfdilgj`. Its public key is in `apps/extension/src/config.ts`; the setup script and companion allow this same ID. The Firefox submit target is the AMO listing slug (`cabc627d04414a0086bb`), while the package's Gecko ID is the listing GUID in `apps/extension/src/config.ts`. The Chrome ZIP attached to GitHub releases keeps the manifest `key` field, so unpacked installs get this ID too; Chrome rejects that field on upload, so the store gets a copy without it from `.output/store/`. If the store identity ever changes, update the extension config, setup script, companion identity and tests, README and website links together.

## Companion app

The companion job stays off until the repository variable `COMPANION_RELEASE` is `true`. A `feat(companion): …` or `fix(companion): …` commit triggers its semantic-release job and version/tag stream independently of the extension. When enabled, CI builds the universal Mac app, signs it with Developer ID, notarizes it with Apple, packages and notarizes a DMG, then creates a `companion-vX.Y.Z` GitHub release with the DMG and Sparkle appcast attached. An unsigned app would be blocked by Gatekeeper, so a release needs these secrets:

| Secret | What |
|---|---|
| `MACOS_CERTIFICATE` | Developer ID Application certificate with its private key, as a base64 `.p12` |
| `MACOS_CERTIFICATE_PASSWORD` | Password of that `.p12` |
| `MACOS_SIGN_IDENTITY` | e.g. `Developer ID Application: Name (TEAMID)` |
| `NOTARY_KEY` | App Store Connect API key (`.p8`), base64 |
| `NOTARY_KEY_ID`, `NOTARY_ISSUER` | That key's ID and issuer |
| `SPARKLE_PRIVATE_KEY` | Sparkle's EdDSA private key, as `generate_keys --account better-passwords -x <file>` exports it. Its public half is `SUPublicEDKey` in `apps/companion/Resources/Info.plist` |

`apps/companion/scripts/release.sh`:

1. builds a universal app, signs it with the hardened runtime, notarizes it and staples the ticket,
2. puts it in a disk image next to a link to Applications, then signs, notarizes and staples the disk image,
3. runs Sparkle's `generate_appcast`, which signs the disk image and the appcast with the EdDSA key.

semantic-release attaches the disk image and `appcast.xml` to a `companion-vX.Y.Z` GitHub release, and CI attests the disk image's build provenance.

Everything links to the download as `https://betterpasswords.app/download/mac`: the extension, the landing page and the README. The site's Worker (`apps/site/worker.js`) redirects it to the disk image of the newest `companion-v*` release, or to the release list while there is none. It also serves that release's appcast at `https://betterpasswords.app/companion/appcast.xml`, the feed every installed app checks.

**Keep the Sparkle key.** Installed apps accept only updates and appcasts signed with it. It lives in the maintainer's login keychain under the account `better-passwords`; back it up outside the keychain too. If it's lost, Sparkle still accepts a disk image signed with the same Developer ID, so a release can ship a new public key. Its appcast won't match the key in installed apps, though, so they only see that release once Sparkle's signed-feed fallback expires (20 days).

Signed builds trust their native host by team ID, so the app and the host must be signed with the same Developer ID.

## Landing page

`apps/site` is served as static files by the Cloudflare Worker `better-passwords-site` at [betterpasswords.app](https://betterpasswords.app). There is no build step. `worker.js` answers only the paths that aren't files, such as `/download/mac`. `apps/site/wrangler.jsonc` holds the config, `_headers` the security headers (CSP, HSTS), and `.assetsignore` keeps those files from being served.

Pushes to `main` that touch `apps/site/**` deploy through Workers Builds, Cloudflare's Git integration, so GitHub holds no Cloudflare token. To deploy by hand:

```sh
cd apps/site && bunx wrangler deploy
```

The CSP allows only same-origin scripts, so keep JavaScript in `assets/` rather than inline `<script>` blocks.
