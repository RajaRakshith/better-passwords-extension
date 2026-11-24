# Touch ID companion

The companion is an optional Mac app (`apps/companion`, Swift). With it, the extension unlocks by reading Apple's 6-digit pairing code for you. Without it, password filling and generation still work through the setup script. Contact email suggestions also need the companion.

The code is still the pairing password in Apple's protocol. The companion reads it off Apple's own window and hands it to the extension, without a Touch ID prompt. That needs the Accessibility permission, which the companion holds so that the browser never needs it.

## Pieces

```
extension ── sendNativeMessage ──► better-passwords-host      (launched by the browser)
                                        │ XPC, both sides check code signatures
                                        ▼
                                   BetterPasswords --agent      (launched by launchd on demand)
                                        │ Accessibility
                                        ▼
                                   Apple's helper window (the browser's own copy)
```

| Part                      | What it does                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `BetterPasswords` (setup) | The app you open. Connects your browsers (writes host manifests), turns on the agent, and asks for Accessibility.           |
| `BetterPasswords --agent` | Same executable, started by launchd when the host connects. Holds the Accessibility permission. Quits after a quiet minute. |
| `better-passwords-host`   | The native-messaging host the browser launches. No permissions; it only relays to the agent.                                |
| `CompanionCore`           | Everything testable: framing, code parsing, process checks, manifests.                                                      |

The setup window and the agent are one executable with one signature. That's why the Accessibility permission you grant in setup also covers the agent, and why System Settings lists it as "Better Passwords".

## Why the agent can't be pointed at the wrong window

The host sends no arguments. The agent works everything out from what the kernel tells it:

1. **Who is asking.** The XPC connection must come from our signed host.
   - Local builds use an Apple Development identity; releases use our Developer ID identity.
   - Both sides require the same signing team. Without a team-signed identity, the agent refuses every connection.
2. **Which browser.** It looks up the browser as the parent of the connecting host process.
3. **Which helper.** It accepts only processes that:
   - are children of that browser,
   - run from Apple's helper path, and
   - satisfy `anchor apple and identifier "com.apple.PasswordManagerBrowserExtensionHelper"`.
4. **What it returns.** It returns only six digits, and only if exactly one code is visible. It re-checks the helpers on every read. Reading does not wait for Touch ID.

Steps 1 to 3 also guard the contact card: the agent reads it only for a browser running Apple's helper. Any program can run our signed host itself and so pass step 1, but macOS lets only browsers start Apple's helper, so step 3 stops it. Without that, any program could read the "Me" card's emails without Contacts permission.

The host checks that the agent is signed by the same team. It sends nothing secret to the agent. A fake agent could at worst supply a wrong code, which fails the SRP handshake.

## Building and trying it

Local builds automatically use an Apple Development identity from the sole team represented in your keychain. The script selects it by certificate fingerprint, so duplicate display names are fine. If identities from multiple teams are present, pass the chosen SHA-1 fingerprint with `--sign`. Create a certificate in Xcode under **Settings → Accounts → Manage Certificates → + → Apple Development**, then build and install:

```sh
cd apps/companion
swift test
scripts/bundle.sh
ditto "dist/Better Passwords.app" "/Applications/Better Passwords.app" && rm -rf dist/*.app
open "/Applications/Better Passwords.app"
```

Why both:

- **The certificate:** macOS ties the background agent's registration and the Accessibility and Contacts permissions to the app's signing identity. Rebuilding with the same Apple Development team keeps that identity stable. The build script refuses to fall back to ad-hoc signing; if there is no valid Apple Development identity, or identities from multiple teams, it prints instructions instead.
- **/Applications:** a single copy in a fixed place. Replacing an app in place, or having two copies with the same identity, can leave macOS checking the agent against an older build.

In the window:

1. Click **Connect**. This writes the bridge manifest (the same one as `scripts/setup-mac.sh`) and the companion's manifest for every installed browser.
2. Click **Turn On** for the background agent. macOS may ask you to allow it in Login Items.
3. Click **Allow…**, then turn on Better Passwords under Accessibility.
4. Optionally, click **Allow…** for Contacts. The extension then suggests the emails on your contact card ("Me") in email fields. They are read when the extension asks, kept in the extension's memory for ten minutes, and never stored.

Reload the extension. Its popup and inline menu then enter the pairing code for you.

If the agent won't start, `launchctl print gui/$(id -u)/io.github.fanckush.betterpasswords.agent` shows why. "Launch Constraint Violation" in a crash report means a stale registration: click **Remove Setup**, then **Turn On** again. A rebuilt app also re-registers by itself when its window opens.

### If Zen still asks for the pairing code

First distinguish a waiting-for-code screen from a companion failure. If the popup shows a code field without an error and the **Enter it for me** button, the extension is already in `awaiting-code`. It deliberately skips auto-entry in this state to avoid starting a second pairing request. Click **Enter it for me** once; if that unlocks, Zen, native messaging, the signed helper, and Accessibility are communicating correctly. The issue was the extension's current session state, not signing or permissions.

Use the visible error only if **Enter it for me** fails. The companion's `hello` check only verifies that the native host can reach the agent and that Accessibility is trusted; it does not test reading the code. Reinstalling the extension or changing Accessibility cannot fix a request that succeeds when retried from the button.

When diagnosing this flow, don't use a stale browser screenshot or the Zen DevTools pairing as proof of the popup state. Zen 1.24.3b reported a Firefox 160.0.1 runtime mismatch in `about:debugging`, and its DevTools accessibility tree/screenshots did not reliably reflect the active page. Check the actual popup UI and its error, then use the agent's launch state only to confirm the host reached macOS.

An ad-hoc build can leave macOS authorizations attached to the previous signed copy. The companion window may show the agent as enabled while launchd refuses to start it, or System Settings may show Accessibility enabled while the companion still shows **Allow…**. Check both layers:

1. In the companion, click **Remove Setup**, then **Connect** and **Turn On** again. Approve Better Passwords in **System Settings → General → Login Items** if prompted. This replaces the stale launchd registration and reconnects browser manifests.
2. If the companion still shows **Allow…**, remove the old Better Passwords entry from **System Settings → Privacy & Security → Device Control and Data Access** (Accessibility), then use **Allow…** in the companion to add the copy in `/Applications/Better Passwords.app` and enable it. macOS may ask you to authenticate.
3. Confirm the companion says **You're all set**. Check `launchctl print gui/$(id -u)/io.github.fanckush.betterpasswords.agent` for a current registration; a team-identifier constraint from an older signed copy or a `Launch Constraint Violation` means the registration is still stale.
4. Reload the extension in Zen/Firefox and open its popup again. If you restarted the browser, its temporarily loaded add-on is gone; load `apps/extension/.output/firefox-mv2/manifest.json` again from `about:debugging`.

The first team-signed build may need Accessibility approval again if it replaces an older ad-hoc copy. After approving that build, keep using the same Apple Development team identity so macOS can recognize it across rebuilds.

Signed releases: `scripts/bundle.sh --version 1.2.3 --sign "Developer ID Application: …"`, then notarize. See [release.md](release.md).

## Known limits

- macOS reports Apple's helper at its real location (`/System/Volumes/Preboot/Cryptexes/…`), behind the `/System/Cryptexes` link. Both are accepted; the code-signature check is what matters.
- The agent finds the browser through its parent process. A browser that launches native hosts through an intermediate process would not work. Chromium browsers and Firefox launch hosts directly.
- Accessibility can be removed only in System Settings. **Remove Setup** in the app removes the browser connections and the agent.
