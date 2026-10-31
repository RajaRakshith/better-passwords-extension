# Security fixes for BetterPasswordsClone

Status: approved by the user on 2026-10-30; implementation planning authorized.

Builder check: an independent security-focused extension reviewer reported “nothing important left” before implementation planning. This checks whether the design is actionable; it is not a review of implemented fixes.

## Intent and agreed scope

The user wants to use this fork with Zen on macOS while retaining inline suggestions. Fix the password-response association bug, improve session expiry, repair password generation, and update dependencies with known advisories. The Firefox inline-menu clickjacking limitation is explicitly deferred until later testing; this work must not describe that limitation as resolved.

The user selected local Apple-style password generation. Generation stays in the extension, with secure random input; Apple remains responsible for storing saved credentials. Do not claim the generator is Apple's exact implementation.

## Current behavior and evidence

- `packages/protocol/src/client.ts` allows a new password read to replace the pending read. An old reply can satisfy the new waiter when command/tab/frame and username match, without checking the requested site. The audit reproduced this with encrypted replies from the repository's fake helper. Reproduction against Apple's real helper remains outstanding.
- The background obtains the destination origin separately from the returned credential. Origin checks cannot compensate for an incorrectly associated reply. It also rereads the tab URL between the initial fill probe and credential retrieval; the original user choice must remain bound to its original origin.
- The session remains paired until explicitly disconnected. Screen-lock locking defaults off; Firefox does not report the Mac's screen lock via the browser idle API.
- The generator uses cryptographic randomness and an Apple-like shape, but unrestricted rule fallback can produce predictable output, and contradictory rules return the last unsuccessful attempt.
- The audit found npm advisory matches in development/release dependencies. Their presence does not establish an exploit chain in the installed browser extension.

## Approaches and decisions

### Password generation

Considered direct macOS generation versus generation inside the extension. The user chose local Apple-style generation: it works in Zen without requiring the optional companion, a new private API, or UI automation. Apple documents a 20-character default with sixteen lowercase letters, one uppercase letter, one digit, and two hyphens; matching that format does not establish identical probability distributions or security behavior.

Use Apple's published password-rule syntax and reference parser as a compatibility reference. Reusing licensed source is allowed after reviewing its license, pinning its revision and retaining notices; wholesale import of a site-rules database is not required for this fix. No runtime downloads of generator code or rules.

### Password replies

Checking the returned username alone is insufficient; checking site metadata alone also does not solve arbitrary late replies or stale user choices. Use a conservative request lifecycle that prevents ambiguous operations from sharing a reply context. Prefer rejecting a competing password read with a recoverable busy message while the first is pending. Ending/cancelling an unanswered read must close its native connection before another read is allowed; merely discarding its JavaScript promise is insufficient. Transparent cancellation on the same connection is not assumed available.

This can require pairing again after cancellation or timeout, but ordinary sequential fills should retain their connection. Tests must establish the behavior before implementation chooses its internal API shape.

### Zen session expiry

Use browser-reported system inactivity rather than introducing a companion dependency. Actual Mac screen-lock notifications through the companion are deferred. A timeout reduces session exposure but is not immediate screen-lock detection.

## Proposed behavior

### 1. Credential request isolation

- Preserve the origin associated with the user's selection throughout the probe, credential lookup and final fill. A changed origin aborts; it must not silently select credentials for the new site.
- Never allow an older operation's response to answer a newer credential operation. Concurrent password choices must get an explicit recoverable response rather than silently superseding a pending native read.
- Validate the username, session, and reply routing, and validate returned site metadata where available. Malformed or conflicting site metadata must fail closed. Missing site metadata cannot be treated as proof of a match; safety must come from unambiguous request association and the original requested hostname.
- A native read may wait for user authentication. Proposed timeout: 120 seconds. On expiry or explicit cancellation, terminate the connection, clear pending state and require a new pairing. Do not silently retry or fill automatically after pairing.
- Locking, disconnection, cancellation or expiry invalidates in-progress fill continuations, even if decryption or a browser operation was already underway. Recheck session generation before sending credentials to the page.
- Review other command waiters for the same late-reply problem after timeouts; if a command's response routing becomes ambiguous, close the connection instead of reusing an unsafe waiter context.
- Do not add password, pairing-code or session-key logging.

### 2. Session expiry

Proposed defaults and controls (agent recommendations, not previously selected by the user):

- Add a `Lock after inactivity` setting with 5, 15, 30 and 60 minutes and an explicit `Never` choice. Default: 15 minutes, including migration of existing settings that lack this field.
- The interval is system inactivity reported by the browser, not lack of extension interaction. Reading a page without input can eventually count as idle; activity in another app can keep the system active.
- Check inactivity when unlocking and changing the timeout, as well as on idle state transitions, so an already-idle system cannot bypass expiry by missing an event. Define expiry consistently if the browser suspends the worker or the machine sleeps: check again before credential access.
- The existing overdue-update policy currently uses an hour of inactivity. Preserve that separate policy when changing the browser's idle-detection interval; a five-minute lock preference must not inadvertently redefine the update policy for users who choose `Never`.
- Enable the existing screen-lock option by default on Chromium for fresh settings; retain an existing explicit user choice. Do not show a nonfunctional screen-lock setting in Zen.
- Use the existing lock cleanup path for keys and temporary password buffers. Unconfirmed generated passwords can be lost when the session ends; explain this consequence near the inactivity setting and retain the existing recovery UI while unlocked.
- Preserve manual locking, code pairing and optional companion Touch ID unlocking.

### 3. Apple-style password generation

- Preserve the default 20-character, three-group Apple-style format and an alphanumeric alternative. Use Web Crypto randomness without modulo bias. Do not claim Apple's precise syllable model or bit-for-bit behavior.
- Default output should provide at least Apple's documented 71-bit entropy benchmark. This is a requirement to establish from the implemented distribution, not an estimate based only on appearance.
- For site-constrained output, proposed minimum: 64 bits of generation entropy. Prefer increasing the password length within accepted limits to meet it. Do not automatically generate below the minimum.
- Use an actual count or defensible conservative bound for the implemented sampling distribution. `length × log2(alphabet size)` alone is not sufficient when required character classes, repetition limits or biased construction reduce the output space. A two-symbol alphabet with a no-repetition constraint is a required counterexample.
- Enforce supported requirements, length limits and the selected output style together. Contradictory rules, impossible required classes, insufficient output space and exhausted bounded attempts return typed errors, not a last candidate.
- Keep parsing/generation bounded for hostile or extreme page attributes. The existing 64-character generation ceiling may be retained; requests requiring longer output must receive an explicit unsupported-rules error.
- Surface useful messages in the existing inline menu: restrictions prevent a strong suggestion, or requirements conflict. Leave manual entry available. An independently valid alternative style may still be offered if the response contract can express this cleanly; this is left to the implementer.
- Treat unknown/invalid syntax according to a documented parser policy consistent with Apple's reference where practical. Never silently omit a recognized but unsupported restriction and then claim compliance.
- No remote service, persistent password history or new companion permissions.

### 4. Dependency remediation

- Requery current advisories from the committed lockfile and trace each match to its parent dependency and role.
- Update direct packages and parent tooling to compatible patched versions where possible. Use narrow, documented overrides only if parent releases cannot resolve a finding and compatibility is demonstrated.
- Regenerate and commit the lockfile. Run a fresh advisory check after updates and report any unresolved matches, distinguishing package presence from reachable exploitability.
- Do not run dependency install hooks with release credentials. Initial dependency installation should suppress scripts, followed by explicit required preparation/build commands.
- Retain the existing project stack and plain TypeScript/DOM UI. Avoid unrelated upgrades or refactors.

## Validation and acceptance

Use test-driven changes: first show a failing regression for each defect, then implement the smallest fix and verify it. Concrete required cases:

1. Same username, different websites, same tab: delayed first reply cannot answer the second choice. Test different tabs/users, duplicate clicks, cancellation, timeout, disconnection, locking during a read and navigation while a fill is pending.
2. Ordinary pairing/listing/sequential filling still work with the fake helper. Connection reset never reuses an obsolete response/session. Missing and malformed metadata have explicit expected outcomes.
3. Inactivity timeout settings, migration, already-idle checks, resume/credential-access checks, cleanup and independence from overdue update timing. Zen behavior must not depend on a `locked` event.
4. Generator format and distribution reasoning, restrictive numeric-only sites, short maximum lengths, overlapping required classes, contradictions, extreme attributes, and binary alphabet/no-repeat constraints. Every returned suggestion satisfies the supported policy; rejected rules surface intelligible UI errors.
5. Run lint, typecheck, relevant unit tests, Chrome/Firefox builds, Firefox package lint and relevant existing browser tests after changes. Add targeted integration coverage for the changed boundaries. Existing browser e2e uses Chromium/fake helper; passing it is not proof of Zen or Apple-helper correctness.
6. Prepare a manual Zen test checklist using a separate browser profile and disposable credentials. Validate real helper site metadata, authentication cancellation, sequential fills, session timeout and generation/save behavior before recommending daily use. Report tests requiring interactive authentication as outstanding unless actually performed.

## Out of scope and delivery boundaries

- Fixing the Firefox inline-menu clickjacking limitation, replacing inline UI with a toolbar-only flow, or claiming all security issues are eliminated.
- Private macOS password-generation APIs, automated reading of personal passwords, exporting credentials, or altering Apple's helper.
- New Mac screen-lock integration, release signing infrastructure, public store publication, a remote GitHub fork, upstream reporting or automatic updates from this fork. These need separate scope; the cloned source currently retains upstream identity/update configuration, so a test build is not an independently maintained distribution.
- Installation into the everyday Zen profile or changing Accessibility/Contacts permissions during automated tests.

Delivery: focused source changes and regression tests in an isolated development branch/worktree, reproducible local builds, updated security/architecture documentation, dependency results, and an explicit list of checks completed versus still requiring live user testing.

## References

- [Apple: Automatic strong passwords](https://support.apple.com/guide/security/automatic-strong-passwords-secc84c811c4/web)
- [Apple Password Manager Resources](https://github.com/apple/password-manager-resources)
- Existing local audit: `../security-audits/better-passwords-2026-10-30/README.md` relative to the repository root's parent workspace; evidence checkout is `/private/tmp/better-passwords-audit`.
