# Architecture

Apple Passwords Plus is a browser extension that reads logins from Apple Passwords (iCloud Keychain) on macOS. It doesn't store passwords and doesn't run a server: every request goes to Apple's own helper program, which ships with macOS 14 and later.

```
popup · inline menu (our extension pages)      autofill content script (on login pages)
   │ runtime messages                              │ one read-only question: "show a menu here?"
   ▼                                               ▼
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
| `apps/companion` | The optional Touch ID companion app (Swift). See [companion.md](companion.md). |
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

The helper's code signature has *parent launch constraints*: macOS kills it unless an approved browser is its parent process. So a helper of ours cannot sit between the browser and Apple's helper. The extension always talks to Apple's helper directly. Native code of ours, such as the [Touch ID companion](companion.md), runs beside it, never in front of it.

## Sessions

Apple's helper keeps the pairing key only in its own memory. When the native port closes, the helper exits and the key is gone, and the next connection needs a new 6-digit code. Apple's extension lets that happen whenever its background worker goes idle, which is why it asks so often.

Our background worker keeps the port open. Chrome keeps an extension's worker alive while it has an open native-messaging port (Chrome 105+), and a 30-second `chrome.alarms` fallback is armed while unlocked. The result is one pairing per browser launch. Optionally, the session also ends when the Mac locks (`idle.onStateChanged`).

## The inline menu

When a login field gets focus, the content script asks the background one question: show logins, offer to unlock, or stay out of the way. That answer is all it learns; it never sees usernames or passwords.

To show the menu, the content script opens a top-layer popover holding a closed shadow root with an iframe of our own `menu.html`. The menu page is an extension page, so:
- the web page can't read the usernames in it
- the web page can't listen to keys typed into it, which includes the pairing code, typed inline when locked

Every menu gets a random nonce in its URL fragment. The fragment is invisible to the page, because the shadow root is closed. When the user picks a login, the menu asks the background, which fetches the password and relays it to the content script with the nonce. The content script then:
1. refuses nonces that aren't its current menu's (so a copy of `menu.html` framed by the page is useless),
2. refuses if the menu is not genuinely visible (see the [threat model](threat-model.md)),
3. fills around the field the menu was opened on, within that field's form.

The content script runs in the top frame only. Logins inside cross-origin iframes are a later step.

## Filling (popup)

1. The popup asks the background for the active tab's logins.
2. The background reads the tab URL itself (granted by `activeTab` when the user opens the popup) and refuses anything that is not `https:` (or `http://localhost`).
3. On click, the background fetches the password from the helper. macOS may ask for Touch ID here.
4. It injects `fillCredentials` into the tab's top frame with the expected origin. If the page navigated elsewhere in the meantime, nothing is filled.
5. The fill function skips hidden and zero-size fields, and fills the username field from the password field's own form.

## New passwords (sign-up and change-password forms)

Password fields on sign-up and change-password forms get a menu with two generated passwords: Apple's style (`xxxxxx-xxxxxx-xxxxxx`) and one without special characters. Both follow the field's `minlength`, `maxlength` and `passwordrules`. They are generated in the background worker, and shown masked until the user hovers the eye.

Like Safari, the chosen password is filled right away, and Apple Passwords is asked to save it once the page moves on with it. Apple's helper shows macOS's "Save password?" prompt but never reports the outcome, so the background then looks the login up until it appears.

"Moves on" means the tab navigates or changes URL (watched by the background, so leaving the page can't lose it), or the password field goes away: a dialog closes, or a multi-step form moves on (`src/autofill/submission.ts`). An invalid or rejected form keeps the field and the URL, so nothing is asked then. Otherwise, asking once too often beats missing a save: the prompt has Not Now, and it's asked only once per generated password.

The username is the one in the form, tracked as the user types, or the last username or email typed on the page (multi-step sign-ups). Without one, macOS asks for it in its dialog, and the new login that appears tells us which name was saved.

Until Apple Passwords confirms a new login, the password is kept in memory and listed in the popup with a Copy button for the rest of the session. An update to an existing login can't be confirmed (the list looks the same), so it is assumed and kept listed too.

## Your email addresses (with the companion app)

Below Hide My Email, sign-up email fields list the emails on the user's own contact card ("Me" in Contacts), as Safari does. The extension can't read Contacts; the companion app can, once the user allows it in the app's setup window. It answers the extension's `my-emails` request through its native host. Without the app, the menu shows a hint pointing to it, with a ✕ to dismiss it for good.

## Hide My Email (opt-in)

Sign-up email fields get a menu that offers Hide My Email. Until the user turns it on, it's a hint with a ✕ that dismisses it for good (the popup can still turn it on). Once on, the menu shows the address made for this site before, or creates one: "Hide My Email…" proposes a random address ("Try Another" for a new one), and choosing it reserves it with the site as its label, then fills it in.

Apple's helper has no Hide My Email, so this uses icloud.com's web service with the browser's icloud.com sign-in (`src/icloud/hide-my-email.ts`, background only). That service accepts only icloud.com's Origin. While the feature is on, a session rule sets Origin and Referer on requests to iCloud that come from outside any tab, which means our background's own. Turning the feature off removes the rule. See the [threat model](threat-model.md).
