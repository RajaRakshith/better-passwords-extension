# Reviewer build and test instructions

This source archive contains the extension and its workspace dependencies. It does not require the optional Swift companion to build or use the core password features.

## Build

Use Bun 1.3.14. From the archive root:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run --filter @app/extension build:chrome
bun run --filter @app/extension build:firefox
```

Outputs are `apps/extension/.output/chrome-mv3` and `apps/extension/.output/firefox-mv2`. To reproduce the submitted ZIPs, run `bun run --filter @app/extension zip:all`. The submitted Chrome ZIP is `.output/store/better-passwords-<version>-chrome.zip`, which omits the manifest `key` field that only unpacked installs need.

## Test on macOS

Core functionality requires macOS 14 or later and a Mac account with Apple Passwords enabled. Use a test account and test credentials; no developer account or subscription to this extension is required.

1. Install the extension in a test browser profile. Firefox is supported on desktop macOS, not Android or other operating systems.
2. Run `sh scripts/setup-mac.sh` from the source root. This registers Apple's built-in `PasswordManagerBrowserExtensionHelper` as a native messaging host for the extension. No administrator rights are required. The script can be inspected before running and undone with `sh scripts/setup-mac.sh --uninstall`.
3. Save a test login for an HTTPS test site in Apple Passwords. Open that site in the browser.
4. Open the extension popup, request a pairing code and enter the code displayed by macOS. Choose the test login to fill it, or click a login field to use inline suggestions.
5. Use the popup's Lock button to end the session. A new pairing code is then required. Chromium also offers optional locking when the Mac screen locks; this setting is absent on Firefox because its idle API does not report that state.
6. On a sign-up form, use the generated password suggestion. On submission, the extension asks Apple's local helper to save the login.

## Optional features

- **Hide My Email:** off by default; requires an existing icloud.com sign-in in the test browser and an Apple iCloud+ subscription. Turn it on in the extension popup or from its sign-up email-field hint. Firefox asks for optional data permissions. Declining them leaves core password filling available. Creating an alias sends its address and the current hostname to Apple, authenticated by the user's iCloud session cookies. Turning the feature off or revoking its data permissions prevents further iCloud requests.
- **Mac companion:** optional for Touch ID pairing and the user's own contact-card email suggestions. The core extension can be reviewed using the setup script without installing the companion. Companion source and its separate release/signing instructions are in the repository.

## Data and code

All extension code is bundled in the package; there is no remote executable code or developer backend. Native messaging transfers password and site information to Apple's local helper. Firefox's required data declarations describe that exchange. Hide My Email is the only feature that makes network requests from the extension, to Apple iCloud. See `PRIVACY.md` for retention and disclosure details, and `NOTICE` for third-party attribution.
