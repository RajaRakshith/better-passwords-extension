# Architecture

Apple Passwords Plus is a browser extension that reads logins from Apple Passwords (iCloud Keychain) on macOS. It doesn't store passwords and doesn't run a server: every request goes to Apple's own helper program, which ships with macOS 14 and later.

```
popup (our UI)
   │ runtime messages (only from our own extension pages)
   ▼
background worker ─── Session: one connection, kept open for the whole browser session
   │ runtime.connectNative(host)
   ▼
Apple's PasswordManagerBrowserExtensionHelper   ← launched by the browser itself
   │ Apple's private APIs
   ▼
Apple Passwords / iCloud Keychain
```

## Packages

| Path | What it is |
|---|---|
| `packages/protocol` | Client for the helper's protocol: SRP-6a pairing, the AES-GCM channel, login and password queries. Pure TypeScript with no browser APIs, so it is unit-tested directly. |
| `packages/fake-helper` | A test double of Apple's helper. Used in-process by unit tests and as a real native-messaging host by the e2e tests. |
| `apps/extension` | The WXT extension: background worker, popup, the page-fill function, and the build variants. |
| `scripts/setup-mac.sh` | One-time setup for the store build (see below). |

## Two builds, one codebase

A browser only lets an extension start a native program if a small JSON *host manifest* names that extension's ID. macOS installs one, `com.apple.passwordmanager`, which allows only Apple's own extension IDs.

| | Store build (`VARIANT=store`) | GitHub build (`VARIANT=github`) |
|---|---|---|
| Extension ID | our own | Apple's (the manifest carries Apple's public key) |
| Host | `org.applepasswordsplus.bridge` | `com.apple.passwordmanager` |
| Setup | `scripts/setup-mac.sh` (or the companion app) writes our host manifest, which points at Apple's unmodified helper | none, uses Apple's own manifest |
| Distribution | Chrome Web Store, Firefox Add-ons | zip on GitHub releases, loaded unpacked |
| Browsers | Chromium browsers, Firefox | Chromium browsers only |
| Next to Apple's extension | yes | no: it has the same ID, so disable Apple's first |

The only differences between the two builds are the manifest `key`, the host name and the display name. They are selected in `apps/extension/wxt.config.ts` and `src/config.ts`.

## Why the browser has to launch Apple's helper

The helper's code signature has *parent launch constraints*: macOS kills it unless an approved browser is its parent process. So a helper of ours cannot sit between the browser and Apple's helper. The extension always talks to Apple's helper directly, and any native code of ours (such as the planned Touch ID companion) runs beside it, never in front of it.

## Sessions

Apple's helper keeps the pairing key only in its own memory. When the native port closes, the helper exits and the key is gone, and the next connection needs a new 6-digit code. Apple's extension lets that happen whenever its background worker goes idle, which is why it asks so often.

Our background worker keeps the port open. Chrome keeps an extension's worker alive while it has an open native-messaging port (Chrome 105+), and a 30-second `chrome.alarms` fallback is armed while unlocked. The result is one pairing per browser launch. Optionally, the session also ends when the Mac locks (`idle.onStateChanged`).

## Filling

1. The popup asks the background for the active tab's logins.
2. The background reads the tab URL itself (granted by `activeTab` when the user opens the popup) and refuses anything that is not `https:` (or `http://localhost`).
3. On click, the background fetches the password from the helper. macOS may ask for Touch ID here.
4. It injects `fillCredentials` into the tab's top frame with the expected origin. If the page navigated elsewhere in the meantime, nothing is filled.
5. The fill function skips hidden and zero-size fields, and fills the username field from the password field's own form.
