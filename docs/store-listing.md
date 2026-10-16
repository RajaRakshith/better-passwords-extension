# Store listings (draft)

Text and answers for the Chrome Web Store and Firefox Add-ons forms. Nothing here is submitted yet.

## Name and compatibility

The product name is **Better Passwords**. Use the separate compatibility line:

> A browser companion for Apple Passwords.

`DISPLAY_NAME` in `apps/extension/src/config.ts` controls the extension name. Use the same name for the Mac companion. Describe Apple Passwords, iCloud and Touch ID as compatibility or features, without implying Apple authorship or endorsement. Every listing should carry "Not affiliated with or endorsed by Apple Inc." This branding does not establish trademark clearance or guarantee store approval.

## Short description (Chrome: 132 characters max)

> Fill logins from Apple Passwords on your Mac. Pair once per browser session, or unlock with Touch ID.

## Detailed description

> Use the passwords you keep in Apple Passwords (iCloud Keychain) in Chrome, Edge, Brave, Arc and other browsers on your Mac.
>
> Apple's own extension asks for a 6-digit code from your Mac every time the browser idles it. Better Passwords keeps the connection open, so you pair once per browser session. With the optional, free companion app, you can unlock with Touch ID instead of typing a code.
>
> • Suggestions in login fields: click a field, pick your account
> • Fill from the toolbar button
> • Open the Passwords app for the current site
> • Lock any time, or automatically when your Mac locks
>
> Your passwords stay where they are. Every request goes to the password helper built into macOS, over Apple's own encrypted pairing. The extension stores nothing and talks to no server.
>
> Requires macOS 14 or later, signed in to iCloud with Passwords turned on, and a one-time setup command (or the companion app): https://github.com/fanckush/apple-passwords-plus#setup
>
> Free and open source (MIT). Not affiliated with or endorsed by Apple Inc.

## Chrome Web Store: privacy practices tab

**Single purpose:** Fill website logins from the user's Apple Passwords on macOS.

**Permission justifications:**

| Permission | Why |
|---|---|
| `nativeMessaging` | To talk to the password helper built into macOS (and, if installed, to the companion app for Touch ID). This is the only way to reach Apple Passwords. |
| `host_permissions` `https://*/*`, `http://localhost/*` | To show login suggestions in login fields on any site the user visits, and to fill the login the user picks. |
| `activeTab`, `scripting` | To fill the chosen login into the current tab when the user picks it from the toolbar popup. |
| `storage` | To remember the user's settings. |
| `alarms` | To keep the connection to the Mac alive, so the user isn't asked for a new code. |
| `idle` | To lock when the Mac's screen locks, if the user turned that on. |
| `declarativeNetRequestWithHostAccess` | Only for the opt-in Hide My Email feature: iCloud's web service accepts requests only with icloud.com's Origin, so while the user has it on, a session rule sets that header on the extension's own requests to iCloud. Websites' requests are never modified. |

**Remote code:** No. All code ships in the package.

**Data usage:** Declare **Authentication information** (passwords and usernames are read to fill them). Certify that data is not sold, not used for unrelated purposes, and not used for creditworthiness. Password lookup and filling are local; opt-in Hide My Email sends requests and site labels to the user's iCloud account.

**Privacy policy URL:** `https://github.com/fanckush/apple-passwords-plus/blob/main/PRIVACY.md`

## Firefox Add-ons

- **Data collection:** the manifest declares `data_collection_permissions: { required: ["none"] }`. Before submitting, check whether opt-in Hide My Email (it sends the site's hostname to the user's own iCloud as an address label) needs an optional category such as `websiteActivity`.
- **Source code:** the build bundles code, so upload the sources zip (`bun run zip:all` makes `better-passwords-<version>-sources.zip`). It includes the workspace packages and root lockfile; run the reviewer commands from its root.
- **Notes for reviewers:**
  > Built with Bun 1.3 and WXT. To reproduce: `bun install --frozen-lockfile --ignore-scripts && bun run --filter @app/extension build:firefox`. The output is `apps/extension/.output/firefox-mv2`. The extension uses native messaging to reach Apple's PasswordManagerBrowserExtensionHelper, which ships with macOS. Testing needs a Mac signed in to iCloud and the setup in scripts/setup-mac.sh.

## Screenshots to take (1280×800)

1. The inline menu open under a login field (light mode).
2. The same in dark mode.
3. The popup listing logins for a site.
4. The popup asking for the code, next to Apple's code window.
5. The companion app's setup window.

Use a test account. Never show real passwords, real usernames or real pairing codes.
