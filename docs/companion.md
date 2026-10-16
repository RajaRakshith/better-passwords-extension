# Touch ID companion

The companion is an optional Mac app (`apps/companion`, Swift). With it, the extension unlocks with Touch ID instead of asking you to type the 6-digit code. Without it, password filling and generation still work through the setup script. Contact email suggestions also need the companion.

Touch ID can't replace the code in Apple's protocol: the code is the pairing password. Instead, after you confirm with Touch ID, the companion reads the code off Apple's own window and hands it to the extension. That needs the Accessibility permission, which the companion holds so that the browser never needs it.

## Pieces

```
extension ── sendNativeMessage ──► better-passwords-host      (launched by the browser)
                                        │ XPC, both sides check code signatures
                                        ▼
                                   BetterPasswords --agent      (launched by launchd on demand)
                                        │ Touch ID, then Accessibility
                                        ▼
                                   Apple's helper window (the browser's own copy)
```

| Part | What it does |
|---|---|
| `BetterPasswords` (setup) | The app you open. Connects your browsers (writes host manifests), turns on the agent, and asks for Accessibility. |
| `BetterPasswords --agent` | Same executable, started by launchd when the host connects. Holds the Accessibility permission. Quits after a quiet minute. |
| `better-passwords-host` | The native-messaging host the browser launches. No permissions; it only relays to the agent. |
| `CompanionCore` | Everything testable: framing, code parsing, process checks, manifests. |

The setup window and the agent are one executable with one signature. That's why the Accessibility permission you grant in setup also covers the agent, and why System Settings lists it as "Better Passwords".

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

Steps 1 to 3 also guard the contact card: the agent reads it only for a browser running Apple's helper. Any program can run our signed host itself and so pass step 1, but macOS lets only browsers start Apple's helper, so step 3 stops it. Without that, any program could read the "Me" card's emails without Contacts permission.

The host checks the agent too: release builds require our team, and development builds require our identifier. The host sends nothing secret to the agent. A fake agent could at worst supply a wrong code, which fails the SRP handshake.

## Building and trying it

Sign local builds with an Apple Development certificate and install them in /Applications:

```sh
cd apps/companion
swift test
scripts/bundle.sh --sign "Apple Development: Your Name (XXXXXXXXXX)"
ditto "dist/Better Passwords.app" "/Applications/Better Passwords.app" && rm -rf dist/*.app
open "/Applications/Better Passwords.app"
```

Why both:
- **The certificate:** macOS ties the background agent's registration and the Accessibility and Contacts permissions to the app's signature. A team-signed build keeps them across rebuilds. An ad-hoc build (`scripts/bundle.sh` without `--sign`) is a new app every time: the old registration then fails with "Launch Constraint Violation", and the permissions must be granted again.
- **/Applications:** a single copy in a fixed place. Replacing an app in place, or having two copies with the same identity, can leave macOS checking the agent against an older build.

In the window:
1. Click **Connect**. This writes the bridge manifest (the same one as `scripts/setup-mac.sh`) and the companion's manifest for every installed browser.
2. Click **Turn On** for the background agent. macOS may ask you to allow it in Login Items.
3. Click **Allow…**, then turn on Better Passwords under Accessibility.
4. Optionally, click **Allow…** for Contacts. The extension then suggests the emails on your contact card ("Me") in sign-up forms. They are read when the extension asks, kept in the extension's memory for ten minutes, and never stored.

Reload the extension. Its popup now unlocks with Touch ID, and so does the inline menu ("Unlock with Touch ID").

If the agent won't start, `launchctl print gui/$(id -u)/io.github.fanckush.betterpasswords.agent` shows why. "Launch Constraint Violation" in a crash report means a stale registration: click **Remove Setup**, then **Turn On** again. A rebuilt app also re-registers by itself when its window opens.

Signed releases: `scripts/bundle.sh --version 1.2.3 --sign "Developer ID Application: …"`, then notarize. See [release.md](release.md).

## Known limits

- macOS reports Apple's helper at its real location (`/System/Volumes/Preboot/Cryptexes/…`), behind the `/System/Cryptexes` link. Both are accepted; the code-signature check is what matters.
- The agent finds the browser through its parent process. A browser that launches native hosts through an intermediate process would not work. Chromium browsers and Firefox launch hosts directly.
- Accessibility can be removed only in System Settings. **Remove Setup** in the app removes the browser connections and the agent.

## Moving from Apple Passwords Plus

Better Passwords uses new app, background-agent and native-host identities. Existing permissions and browser registrations do not transfer automatically.

1. Open the old **Apple Passwords Plus** app and choose **Remove Setup** before deleting it. If you used only the old setup script, run that version with `--uninstall` before replacing it.
2. Remove the old extension, then install Better Passwords and move **Better Passwords.app** to Applications.
3. Connect your browsers again, turn on the new background agent, and grant Accessibility and optional Contacts access to Better Passwords.
4. The former GitHub build shared Apple's extension ID. After removing that build, you can re-enable or reinstall Apple's iCloud Passwords extension.

The new setup does not remove old registrations, migrate extension settings or modify your saved passwords. Old permission entries can be removed manually in System Settings.
