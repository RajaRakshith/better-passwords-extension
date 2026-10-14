# Touch ID companion

The companion is an optional Mac app (`apps/companion`, Swift). With it, the extension unlocks with Touch ID instead of asking you to type the 6-digit code. Without it, everything else works the same.

Touch ID can't replace the code in Apple's protocol: the code is the pairing password. Instead, after you confirm with Touch ID, the companion reads the code off Apple's own window and hands it to the extension. That needs the Accessibility permission, which the companion holds so that the browser never needs it.

## Pieces

```
extension ── sendNativeMessage ──► apple-passwords-plus-host      (launched by the browser)
                                        │ XPC, both sides check code signatures
                                        ▼
                                   ApplePasswordsPlus --agent      (launched by launchd on demand)
                                        │ Touch ID, then Accessibility
                                        ▼
                                   Apple's helper window (the browser's own copy)
```

| Part | What it does |
|---|---|
| `ApplePasswordsPlus` (setup) | The app you open. Connects your browsers (writes host manifests), turns on the agent, and asks for Accessibility. |
| `ApplePasswordsPlus --agent` | Same executable, started by launchd when the host connects. Holds the Accessibility permission. Quits after a quiet minute. |
| `apple-passwords-plus-host` | The native-messaging host the browser launches. No permissions; it only relays to the agent. |
| `CompanionCore` | Everything testable: framing, code parsing, process checks, manifests. |

The setup window and the agent are one executable with one signature. That's why the Accessibility permission you grant in setup also covers the agent, and why System Settings lists it as "Apple Passwords Plus".

## Why the agent can't be pointed at the wrong window

The host sends no arguments. The agent works everything out from what the kernel tells it:

1. **Who is asking.** The XPC connection must come from our signed host.
   - Release builds require our Developer ID team.
   - Ad-hoc development builds pin the host's exact cdhash, which `scripts/bundle.sh` writes into `Info.plist`.
   - With neither, the agent refuses every connection.
2. **Which browser.** It looks up the browser as the parent of the connecting host process.
3. **Which helper.** It accepts only processes that:
   - are children of that browser,
   - run from Apple's helper path, and
   - satisfy `anchor apple and identifier "com.apple.PasswordManagerBrowserExtensionHelper"`.
4. **You.** It requires Touch ID, or your login password on Macs without Touch ID.
5. **What it returns.** It returns only six digits, and only if exactly one code is visible. It re-checks the helpers on every read.

The host checks the agent too: release builds require our team, and development builds require our identifier. The host sends nothing secret to the agent. A fake agent could at worst supply a wrong code, which fails the SRP handshake.

## Building and trying it

```sh
cd apps/companion
swift test
scripts/bundle.sh          # ad-hoc signed app in dist/
open "dist/Apple Passwords Plus.app"
```

In the window:
1. Click **Connect**. This writes the bridge manifest (the same one as `scripts/setup-mac.sh`) and the companion's manifest for every installed browser.
2. Click **Turn On** for the background agent. macOS may ask you to allow it in Login Items.
3. Click **Allow…**, then turn on Apple Passwords Plus under Accessibility.

Reload the extension. Its popup now unlocks with Touch ID, and so does the inline menu ("Unlock with Touch ID").

Every ad-hoc build has a new signature, so macOS treats it as a new app. After rebuilding, remove the old entry from Accessibility and allow the new one.

Signed releases: `scripts/bundle.sh --version 1.2.3 --sign "Developer ID Application: …"`, then notarize. See [release.md](release.md).

## Known limits

- The agent finds the browser through its parent process. A browser that launches native hosts through an intermediate process would not work. Chromium browsers and Firefox launch hosts directly.
- Accessibility can be removed only in System Settings. **Remove Setup** in the app removes the browser connections and the agent.
