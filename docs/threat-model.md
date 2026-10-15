# Threat model

What we protect: the user's passwords in Apple Passwords, and the session that can read them.

## Trust boundaries

| Component | Trusted? | Notes |
|---|---|---|
| Apple's helper and macOS | yes | Verified by macOS code signing. We never modify or wrap it. |
| Our background worker and popup | yes | The only code that holds the session key. |
| Web pages and their scripts | **no** | Never talk to the background; only receive values the user chose to fill. |
| Other extensions | **no** | Messages from other extension IDs are refused. |
| The local user account | mostly | Anything running as the user can already reach Apple's helper the same way we do. |

## What we rely on

- **The pairing code proves the user is present.** It appears only on the Mac's screen, and SRP turns it into a key without ever sending it. We never store it.
- **The session key stays in memory** in the background worker (a non-extractable WebCrypto key plus SRP state). It is never written to storage, and it is gone when the browser quits or the user locks.
- **Server proof.** Pairing completes only after the helper proves it derived the same key (`HAMK`, compared in constant time).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| A page tricks a fill into a hidden field, or onto another origin | Fills only on a click in our UI, only into the active tab's top frame, only if the origin still matches. Hidden, zero-size and transparent fields are skipped. |
| Clickjacking the inline menu (making it transparent or covering it, then luring a click) | Layered checks:<br>(1) Chromium: the menu tracks its own visibility with IntersectionObserver v2 and ignores clicks unless it has been really visible for 300 ms.<br>(2) Before filling, the content script checks that the menu is open in the top layer, that no other top-layer element was opened after it, that it and its ancestors are fully opaque with no filters or blend modes, and that hit-testing at its centre and corners lands on it. |
| The page frames its own copy of `menu.html` | Each menu has a random nonce held in a closed shadow root; fills for any other nonce are refused. |
| The page reads usernames or the typed code | The menu is a cross-origin extension iframe inside a closed shadow root. The content script never receives usernames. |
| A page or other extension asks the background for passwords | `runtime.onMessage` accepts only our own extension pages (same ID and our extension URL). |
| Plain-http pages leak a filled password | Only `https:` pages (and `http://localhost` for development) are filled. |
| A longer-lived session widens the window of exposure | Sessions end on browser quit or "Lock". The optional "lock when my Mac locks" setting covers a walked-away Mac. Sensitive items still trigger macOS's own Touch ID prompt when read. |
| The setup script is tampered with | It is plain, short shell. It writes only one JSON file per browser, pointing at Apple's signed helper, and needs no admin rights. Read it before running. |
| The GitHub build borrows Apple's public key | That only decides the extension ID; it grants no access Apple's own design doesn't already give that ID. It is clearly labelled and can't be published to stores. |
| A future macOS change in Apple's helper | Fail closed: unknown replies and protocol versions are rejected. |
| A page reads a generated password | It's generated in the background and shown only in our menu frame. The page gets it only when the user picks it, into that page's own new-password fields. |
| A generated password is filled but never saved | macOS asks before saving, and the user may decline. Until Apple Passwords lists the login, the password stays in memory, shown in the popup for the session. |
| A page fakes a sign-up to trigger save prompts | Only a password we filled can be saved, and only with a user-visible macOS prompt. A page can at worst cause an extra prompt. |

## Known gaps

- On Firefox (no IntersectionObserver v2), an overlay with `pointer-events: none` placed in the page's own *closed* shadow root and in the top layer could evade the content script's checks. Planned mitigation: re-check after a short delay, and require the field to keep focus.
- Logins in cross-origin iframes are not offered yet.
- Firefox can't tell when the Mac locks (its idle API never reports "locked"), so "Lock when my Mac locks" is Chromium-only. On Firefox the session ends when Firefox quits or you press Lock.

## Touch ID companion

Reading the code automatically needs Accessibility access. That permission lives in the separate companion app, never in the browser. The app:
- requires Touch ID (or the login password) before every read
- reads only windows of Apple's signed helper that the asking browser launched
- returns only the six digits
- accepts XPC connections only from its own signed native host

The full design is in [companion.md](companion.md).

| Risk | Mitigation |
|---|---|
| Another program asks the agent for the code | The XPC connection must come from our signed host (team ID in releases, exact cdhash in development builds), and the user must confirm with Touch ID. |
| A fake window shows a code | Only windows of processes signed by Apple as the helper, and launched by the asking browser, are read. A wrong code would fail the SRP handshake anyway. |
| The companion is used to read other apps | It reads nothing but the helper's windows, and it returns only a 6-digit code, never other text. |
