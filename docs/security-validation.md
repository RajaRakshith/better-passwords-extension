# Security hardening validation

Branch: `fix/security-hardening`, based on `c242266`.
Scope: approved [design](superpowers/specs/2026-10-30-security-fixes-design.md) and [implementation plan](superpowers/plans/2026-10-30-security-fixes.md).

## Automated evidence

Environment: macOS 27.0.1 arm64, Bun 1.4.4, Node 22.15.0, Playwright 1.64.0, Chromium 156.0.8078.4 (build 1248). Bun and browser binaries were installed in a temporary tools directory; no normal browser profile was used.

| Check | Result |
|---|---|
| `bun run lint` and `bun run typecheck` | Passed |
| `bun run test --maxWorkers=2` (full unit suite) | 304 tests passed across 33 files |
| `bun run build` | Chrome and Firefox production builds passed |
| `bun run --filter @app/extension lint:firefox` | 0 errors, warnings or notices |
| Five new security browser scenarios | All passed with the real Chromium extension and fake native helper |
| Complete browser regression suite | 95 passed in 2.4 minutes, including the five new scenarios |
| Fresh npm advisory scan | 3 residual tooling matches; no high/critical matches; scanner intentionally exits 1 |

The Firefox linter's optional update notifier could not write the sandboxed user config store; this did not fail package validation. The initial Chromium download was interrupted, and a retry installed the exact Playwright browser successfully. The first attempt to launch that retry was delayed by an automatic permission-review timeout; the retry subsequently ran.

The final unrestricted `bun run check` passed lint and types but its 33-worker unit run missed an existing real-time companion timeout assertion (16 seconds versus a 9-second bound). The complete suite passed with two workers, without changing that test or its timeout.

The five browser scenarios cover stale/empty selected origins, an actual inline selection held at the native reply boundary followed by Lock, navigation while a native reply is held, weak signup rules producing no candidate, and persistent inactivity choices.

Browser command: from `apps/extension`, `bun run test:e2e --workers=2`. Set `PLAYWRIGHT_BROWSERS_PATH` if browser binaries are installed outside the normal cache. CLI emitted harmless conflicting color-environment warnings; all test outcomes passed.

## TDD regressions

- The initial delayed-reply test observed the second site's request return `bank-secret` from the first site, instead of rejecting a competing request. Exclusive ownership now rejects the competing request and leaves the original request intact.
- A separate test observed a password returned after Lock during decryption. Generation/session guards now reject the obsolete continuation.
- Session tests observed a connection resurrect after Lock and an ignored access guard. Epoch checks and cancellation now prevent those outcomes.
- Expiry tests cover already-idle unlock/reconfiguration, rejected OS queries, stale asynchronous results, missed observation intervals, backwards clocks, migration and Never.
- The old generator accepted predictable/alternating rules and malformed restrictions. New tests count tiny spaces independently, enumerate uniform ranks, prove the default distribution and reject weak/unsupported rules. Prototype-like class names were also observed accepted, then rejected with an own-property check.
- Menu tests verify that failed styles have no selectable password, valid alternatives remain selectable, manual input remains untouched, and the existing deliberate-click guard is retained.
- Popup expiry has its own regression: sensitive content disappears on session end and an earlier asynchronous renderer cannot restore it.
- Final review reproduced an access guard accepting an obsolete inactivity check while a newly configured check was pending. The guard now waits for the current policy; the regression went from early access granted to access denied after the current idle answer.
- Four tests import the actual inline-menu entrypoint with controlled message responses. They first observed generated secrets surviving the locked-status lookup or reappearing from a late response, and cached/pending usernames returning after Lock. Lock now clears the menu synchronously, drops cached logins and invalidates earlier async renders and fill continuations.

The new modules initially produced expected missing-export failures before implementation; behavior-changing regressions above also failed against the old behavior. Browser integration tests are additional end-to-end coverage, not all independent red/green production changes. An initial browser test attempted to target a website from a popup opened as a normal extension tab; such senders are correctly bound to their own tab. Tests now exercise actual inline selections and tab-bound menu callers.

## Important implementation choices

- Requests have one exclusive native password owner through decryption. Competing choices receive a busy message. Unanswered reads expire at 120 seconds; Lock or ambiguous timeouts destroy the native connection before reuse.
- UI selections carry their originally displayed origin. Normal sequential reads retain pairing; fills never automatically replay after unlocking.
- Inactivity defaults to 15 minutes with 5/15/30/60/Never options. The existing 30-second keep-alive alarm now checks expiry. An observation gap as long as the timeout conservatively locks, even if input resumed; this may require extra pairing after sleep/suspension.
- An explicit Chromium screen-lock false preference survives. Inactivity and the separate one-hour overdue-update threshold remain distinct. Zen does not pretend to detect screen locking immediately.
- Shared generator policy lives in a small module to avoid import cycles. The parser deliberately rejects malformed and unsupported syntax rather than silently ignoring restrictions, which can require manual entry on some sites.
- [Dependency remediation](dependency-security.md) retains visible low/moderate deepmerge/glob/minimatch tooling advisories instead of forcing untested major-version overrides.

## Manual Zen / Apple-helper checks still required

Automated Chromium/fake-helper tests and Firefox package lint do not establish behavior against Apple's real helper or Zen.

1. Create a separate Zen test profile. Use `about:debugging` → This Firefox → Load Temporary Add-on, selecting `apps/extension/.output/firefox-mv2/manifest.json`. Temporary add-ons disappear on restart; signed long-term distribution is separate work. Do not disable signature enforcement in an everyday profile.
2. Connect that test profile using the documented Firefox/Zen bridge setup, reviewing the per-user host manifest. The test build retains the upstream extension identity. No separate auto-update/signing distribution has been established for this fork.
3. Use only disposable accounts/credentials. Pair, fill normally, then fill sequentially on two test sites using the same username and different passwords. Verify exact host metadata acceptance, including any legitimate related-site cases; stricter metadata checks may refuse an otherwise valid helper match.
4. Cancel an Apple authentication prompt, retry to see busy recovery, then use Lock and pair again. Verify there is no automatic fill after pairing. Check unanswered-read expiry at two minutes.
5. Begin a disposable fill, navigate to a different origin before completing authentication, and confirm no password reaches the new site. Repeat with manual Lock.
6. Set inactivity to five minutes and allow actual Mac input inactivity; verify re-pairing is needed. Also test sleep/resume and Never. This timeout is based on system inactivity, not extension inactivity, and is not immediate Mac screen-lock detection on Zen.
7. Generate a normal signup password and an alphanumeric alternative, complete a disposable signup and confirm Apple Passwords saves it. Try conflicting/short/restrictive rules: no weak suggestion should appear; manual entry must remain possible.
8. Decline a generated-password save and verify the recent-password recovery UI while unlocked. Confirm locking removes recovery entries and closes an open popup; unsaved generated passwords are intentionally lost at expiry.

## Independent review

A fresh read-only whole-branch reviewer completed the review after the first review was interrupted by a model usage limit. It found two Important issues and no Critical issues: obsolete inactivity checks granting access, and sensitive inline-menu content surviving/reappearing after Lock. Both were reproduced with failing tests and fixed in the final TDD pass. No Minor findings were deferred. The reviewer assessed the remaining request ownership, epoch/origin binding, counted password spaces and visible advisory reporting as meeting the approved requirements. Live helper/Zen compatibility and physical idle behavior remain manual checks, not review-proven claims.

## Remaining limits

The documented Firefox inline-menu clickjacking limitation remains explicitly deferred. This work is not a complete security certification. No personal passwords were read, no Accessibility/Contacts permissions were granted, no upstream report was sent and nothing was published or installed into the everyday Zen profile.
