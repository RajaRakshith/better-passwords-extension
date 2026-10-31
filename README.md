# Better Passwords (extension for Apple Passwords)

[![CI](https://github.com/fanckush/better-passwords-extension/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fanckush/better-passwords-extension/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Ffanckush%2Fbetter-passwords-extension%2Fbadges%2Fcoverage.json)](https://github.com/fanckush/better-passwords-extension/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/fanckush/better-passwords-extension?filter=extension-v*&label=release)](https://github.com/fanckush/better-passwords-extension/releases/latest)
[![License: MIT](https://img.shields.io/github/license/fanckush/better-passwords-extension)](LICENSE)
[![macOS 14+](https://img.shields.io/badge/macOS-14%2B-informational)](#setup)

**An alternative to Apple's iCloud Passwords extension for Chromium and firefox based browsers**

## Why

I am honestly sick of seeing this all the time

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/apple-autofill-prompt-dark.png">
  <img src="docs/images/apple-autofill-prompt-light.png" width="340" alt="Apple's extension asking again: Enable Password AutoFill. Click here to allow iCloud Passwords to AutoFill your passwords.">
</picture>

also, Apple's extension **doesn't** suggest passwords when signing up!

## Demo

Visit [betterpasswords.app](https://betterpasswords.app) for an interactive dummy form

[Chrome Web Store][chrome-web-store] · [Firefox Add-ons][firefox-addons] · [Website](https://betterpasswords.app) · [Setup](#setup)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/screenshot-dark.png">
  <img src="docs/images/screenshot-light.png" width="856" alt="Better Passwords suggesting saved Apple Passwords logins under a sign-in field, with its toolbar popup open">
</picture>

## Features

- ✏️ login suggestions
- 🔐 password generatino on sign-ups
- ✨ NO MORE 6 DIGIT CODES!! *
- 💾 asks to save/update new logins you type (obviously)
- ☁️ generate Hide My Email in email fields (needs iCloud+)
- 👤 suggest yoru email addresses from your contact card *

\* Needs [companion Mac app](docs/companion.md)

## Installotion

- **Chrome, Arc, Brave, Edge, Vivaldi and other Chromium browsers:** [Chrome Web Store][chrome-web-store]
- **Firefox and Zen:** [Firefox Add-ons][firefox-addons]

Or manually download `better-passwords-<version>-chrome.zip` from the [latest release](https://github.com/fanckush/better-passwords-extension/releases/latest), unzip it, open `chrome://extensions`, turn on **Developer mode** and choose **Load unpacked**. Manual installs don't support auto updates (similar steps for FF)

### Connect to apple passwords

[Download the optional companion Mac app](https://betterpasswords.app/companion) ([how it works](docs/companion.md)), move it to Applications, open **Better Passwords.app**, and choose **Connect**. It also enables Touch ID and contact email suggestions after you allow the required permissions.

Or run the setup script without the companion app:

```sh
curl -fsSL https://github.com/fanckush/better-passwords-extension/raw/main/scripts/setup-mac.sh | sh
```

The script lets the extension reach Apple's built-in password helper. You can find it [here](scripts/setup-mac.sh). To undo use it with `--uninstall`.

The setup connects Chrome, Brave, Edge, Vivaldi, Arc, Helium, Crest, Chromium, Firefox and Zen. Using another browser? [Ask for it](https://github.com/fanckush/better-passwords-extension/issues/new?template=browser.yml).

## Contributing

Contributions are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup (Bun), tests, and how to try changes against the real helper. Please report security issues privately, as described in [SECURITY.md](SECURITY.md).

## Reproduce the Firefox submission (Mozilla reviewers)

The submitted extension was built on **macOS 27.0.1, Apple Silicon (arm64), Node.js 22.15.0 and Bun 1.4.4**. A POSIX shell and network access to the npm registry are required. No Apple account, password helper, Swift compiler, signing credentials, browser installation or native setup is needed to build it. Other build operating systems have not been verified for this submission; running the extension requires macOS 14 or later.

1. Install **Node.js 22.15.0** using the macOS installer linked from the [official release page](https://nodejs.org/en/blog/release/v22.15.0), or extract its matching binary archive and add its `bin` directory to PATH. Confirm `node --version` prints `v22.15.0`. npm is included with Node; it is used only to install Bun in the next step.
2. Extract this source ZIP and open a terminal at its root (the folder containing this README, `package.json` and `bun.lock`). Install **Bun 1.4.4** locally using npm, an [officially supported Bun installation method](https://bun.com/docs/installation):

   ```sh
   npm install --prefix .review-tools bun@1.4.4
   export PATH="$PWD/.review-tools/node_modules/.bin:$PATH"
   bun --version
   ```

   The last command must print `1.4.4`. The build uses Bun and the submitted `bun.lock`; do not run `npm install` on the workspace or substitute an npm lockfile.
3. Run the complete build script:

   ```sh
   sh scripts/build-firefox-review.sh
   ```

   It verifies the runtime versions, installs the frozen dependencies with lifecycle scripts disabled, then builds the Firefox extension using the workspace's pinned WXT/Vite tooling. It does not register a native host or access passwords. All build inputs and workspace protocol sources are included in this archive; there are no private dependencies or environment secrets.
4. Compare **every file** under `apps/extension/.output/firefox-mv2/` with the contents of the uploaded `better-passwords-1.0.0-firefox.zip`. The paths and file bytes must match; ZIP timestamps/compression metadata are not extension code. No generated output or installed dependencies are included in the source archive.

Additional runtime test instructions and the personal fork's add-on ID are in [docs/reviewer-build.md](docs/reviewer-build.md).

## Credits

Thanks to the authors of the following projects for inspiring me to build this:

- [Open Passwords](https://github.com/ManiForoughi2/open-passwords) fills from Apple Passwords in Chrome and Edge. It showed that keeping the connection to Apple's helper open means far fewer six-digit codes.
- [iCloud Hide My Email](https://github.com/dedoussis/icloud-hide-my-email-browser-extension) by Dimitrios Dedoussis showed how to use Hide My Email from a browser.

## License

[MIT](LICENSE). The protocol knowledge builds on earlier Apache-2.0 projects, credited in [NOTICE](NOTICE).

<!-- Store listings: apps/site/assets/browser.js links the same pages. -->

[chrome-web-store]: https://chromewebstore.google.com/detail/better-passwords/ocongmkplhijgajnipnhhggfcjfdilgj
[firefox-addons]: https://addons.mozilla.org/firefox/addon/better-passwords/

> Not affiliated with or endorsed by Apple Inc. "Apple" and "iCloud" are trademarks of Apple Inc.
