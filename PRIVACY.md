# Privacy policy

Apple Passwords Plus (the browser extension and the optional Mac companion app) collects nothing. It sends nothing anywhere, except to Apple's iCloud if you turn on Hide My Email.

## What it handles, and where

- **Passwords and usernames.** The extension asks the password helper built into macOS for the usernames saved for the site you're on. When you choose a login, it asks for that password and fills it into the page. It doesn't store usernames or passwords, and nothing leaves your Mac except what you fill into a website yourself.
- **The site's address.** The extension sends the current site's hostname to Apple's helper, on your Mac, to look up matching logins.
- **The pairing key.** Pairing with your Mac creates a key that stays in the browser's memory until you quit the browser or press Lock. It is never written to disk.
- **Settings.** Your settings (for example, whether to show suggestions in login fields) are saved in the browser's extension storage on your device.
- **Hide My Email (only if you turn it on).** The extension asks iCloud, using your icloud.com sign-in in that browser, for your Hide My Email addresses and creates new ones when you ask. It sends iCloud the site's hostname as the new address's label, as Safari does. Nothing is stored by the extension.
- **The pairing code (companion app only).** After you confirm with Touch ID, the companion app reads the 6-digit code from Apple's pairing window and passes it to the extension on your Mac. It isn't stored.

## What it doesn't do

- No analytics, telemetry, crash reporting or ads.
- No servers. The project runs no backend. The only network requests are to Apple's iCloud, for Hide My Email, and only if you turn it on.
- No selling or sharing of data, because none is collected.

## Contact

Questions: open an issue at https://github.com/fanckush/apple-passwords-plus. For security reports, see [SECURITY.md](SECURITY.md).

Last updated: October 2026.
