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

### 1. Install the extension

- **Browser stores:** Chrome Web Store and Firefox Add-ons listings are coming soon.
- **GitHub (Chromium browsers):** download `better-passwords-<version>-chrome.zip` from the [latest release](https://github.com/fanckush/better-passwords-extension/releases), unzip it, then open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**. These installs need manual updates.
- **Firefox:** use the Firefox Add-ons listing once published, or an explicitly signed XPI if provided. The Firefox ZIP is a submission package; the sources ZIP is for reviewers. Neither should be presented as a directly installable release. Contributors can test a local build using Firefox's temporary add-on loading.

All downloads use the same Better Passwords identity and setup. Apple's iCloud Passwords extension can remain installed; avoid enabling two competing autofill menus if they get in your way.

### 2. Connect your browser once

Install the optional [companion Mac app](docs/companion.md), open **Better Passwords.app**, and choose **Connect**. It also enables Touch ID and contact email suggestions after you allow the required permissions.

Or run the setup script without the companion app:

```sh
curl -fsSL https://github.com/fanckush/better-passwords-extension/raw/main/scripts/setup-mac.sh | sh
```

The script lets the extension reach Apple's built-in password helper. It writes one small file per browser and needs no admin rights. [Read it](scripts/setup-mac.sh) first, and undo it any time with `--uninstall`.

### 3. Unlock

Click the toolbar icon and enter the code your Mac shows, or unlock with Touch ID through the companion. Hide My Email is optional, requires iCloud+, and uses your icloud.com sign-in in this browser.

## How it works

See [docs/architecture.md](docs/architecture.md), [docs/protocol.md](docs/protocol.md) and [docs/threat-model.md](docs/threat-model.md). There is no project backend or tracking. Opt-in Hide My Email connects to Apple’s iCloud: see the [privacy policy](PRIVACY.md).

## Upgrading from the previous name

Existing Apple Passwords Plus installations need fresh setup and permissions. [Follow the transition steps](docs/companion.md#moving-from-apple-passwords-plus) before replacing the old app or extension.

## Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup (Bun), tests, and how to try changes against the real helper. Please report security issues privately, as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The protocol knowledge builds on earlier Apache-2.0 projects, credited in [NOTICE](NOTICE).
