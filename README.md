# Better Passwords

**A browser companion for Apple Passwords.**

A browser extension that fills your logins from Apple Passwords (iCloud Keychain) on macOS, without asking for a 6-digit code every few hours.

> Not affiliated with or endorsed by Apple Inc. "Apple" and "iCloud" are trademarks of Apple Inc.

## Why

Apple's iCloud Passwords extension loses its connection whenever the browser idles its background worker, and every reconnect means typing a new code from your Mac. This extension keeps the connection open, so you pair **once per browser launch**.

It talks to the same Apple helper that ships with macOS, through the same encrypted pairing, so your passwords never leave Apple's own software except to fill the page you choose.

## Status

Early development. Working today:
- pairing, and keeping the session alive
- an inline menu on login fields
- filling from the toolbar popup
- an optional Mac companion app that enters the code for you after Touch ID ([details](docs/companion.md))

Planned:
- Firefox polish
- store listings

## Setup

Requirements: macOS 14 (Sonoma) or later, signed in to iCloud with Passwords turned on.

### Store build (recommended once published)

1. Install the extension from the Chrome Web Store or Firefox Add-ons (coming soon).
2. Run the one-time setup in Terminal:
   ```sh
   curl -fsSL https://github.com/fanckush/apple-passwords-plus/raw/main/scripts/setup-mac.sh | sh
   ```
   The script lets the extension reach Apple's built-in password helper. It writes one small file per browser and needs no admin rights. [Read it](scripts/setup-mac.sh) first, and undo it any time with `--uninstall`.

   Or install the [Touch ID companion app](docs/companion.md) instead. Its setup does the same, and it lets you unlock with Touch ID.
3. Click the toolbar icon, type the code your Mac shows, done.

### GitHub build (no setup, Chromium browsers only)

This build uses Apple's own extension ID, so macOS's preinstalled connection already allows it:

1. Disable Apple's iCloud Passwords extension (the two share an ID).
2. Download `…-github-chrome.zip` from the [latest release](https://github.com/fanckush/apple-passwords-plus/releases) and unzip it.
3. On `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the folder.

It can't auto-update. Download new releases yourself.

## How it works

See [docs/architecture.md](docs/architecture.md), [docs/protocol.md](docs/protocol.md) and [docs/threat-model.md](docs/threat-model.md). Nothing is collected or sent anywhere: see the [privacy policy](PRIVACY.md).

## Upgrading from the previous name

Existing Apple Passwords Plus installations need fresh setup and permissions. [Follow the transition steps](docs/companion.md#moving-from-apple-passwords-plus) before replacing the old app or extension.

## Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup (Bun), tests, and how to try changes against the real helper. Please report security issues privately, as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The protocol knowledge builds on earlier Apache-2.0 projects, credited in [NOTICE](NOTICE).
