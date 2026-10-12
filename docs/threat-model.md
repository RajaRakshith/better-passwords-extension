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
| A page or other extension asks the background for passwords | `runtime.onMessage` accepts only our own extension pages (same ID and our extension URL). |
| Plain-http pages leak a filled password | Only `https:` pages (and `http://localhost` for development) are filled. |
| A longer-lived session widens the window of exposure | Sessions end on browser quit or "Lock". The optional "lock when my Mac locks" setting covers a walked-away Mac. Sensitive items still trigger macOS's own Touch ID prompt when read. |
| The setup script is tampered with | It is plain, short shell. It writes only one JSON file per browser, pointing at Apple's signed helper, and needs no admin rights. Read it before running. |
| The GitHub build borrows Apple's public key | That only decides the extension ID; it grants no access Apple's own design doesn't already give that ID. It is clearly labelled and can't be published to stores. |
| A future macOS change in Apple's helper | Fail closed: unknown replies and protocol versions are rejected. |

## Planned: Touch ID companion

Reading the code automatically needs Accessibility access. That permission will live in a separate signed companion app, never in the browser. The app will:
- require Touch ID first
- verify that the code window belongs to Apple's signed helper (and to the right browser)
- return only the six digits
- authenticate its callers by code signature
