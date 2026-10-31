# Credential Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a credential is returned and filled only for the request, origin and unlocked session the user selected.

**Architecture:** One password read can own the native response path at a time; reject competing reads and destroy ambiguous connections. An epoch-tagged fill coordinator preserves the selected origin across async work. Keep changes localized rather than restructuring the full background worker.

**Tech Stack:** Existing TypeScript protocol client, native transport, Vitest, fake helper, WXT message types.

**Spec:** [Approved design](../specs/2026-10-30-security-fixes-design.md); [master plan](2026-10-30-security-fixes.md).

## Global Constraints

- Native password read timeout is exactly 120,000 ms; cancellation or ambiguous timeout terminates the connection before reuse.
- Ordinary sequential reads retain pairing; competing reads fail explicitly without native supersession or automatic retry.
- Preserve the selected origin, top-frame-only filling and existing username-first/save behavior. No credentials in logs.
- Inline-menu clickjacking is out of scope; keep the existing guards.

## Review Focus

1. Two calls before the first encryption await finishes must still have one owner (Task 1).
2. Clearing a waiter before async decryption finishes must not permit late delivery after lock (Tasks 1–2).
3. Timeouts on non-password commands can also leave stale replies (Task 1).
4. Old UI selections after navigation must not select a new site's password (Task 2).
5. Lock during connection/pairing must not resurrect an obsolete client (Task 2).

---

### Task 1: Unambiguous native reads and timeout handling

**Files:** Modify `packages/protocol/src/client.ts`, `packages/protocol/test/client.test.ts`; create `packages/protocol/src/credential-site.ts`, `packages/protocol/test/credential-site.test.ts`; update `docs/protocol.md`. Extend `packages/fake-helper/src/memory-transport.ts` only if a test transport cannot remain test-local.

**Interfaces:** Keep `getPassword(hostname: string, username: string, tab: {tabId: number; frameId?: number}): Promise<Credential | undefined>`. Add `ProtocolError.code = "busy"`; retain existing codes used elsewhere. Extend `ClientOptions` with `passwordTimeoutMs?: number` (default 120_000). Export `credentialSitesMatch(hostname: string, sites: unknown): boolean` from its module, used internally by the client. Missing (`undefined`) sites returns true only as compatibility acceptance backed by request isolation; an explicit malformed/empty/conflicting list returns false.

Test anchor:
```ts
it("rejects a hostname suffix lookalike", () => {
  expect(credentialSitesMatch("bank.test", ["bank.test.attacker.test"])).toBe(false);
  expect(credentialSitesMatch("bank.test", ["https://bank.test/login"])).toBe(true);
});
```

- [ ] Add controlled encrypted-reply tests using a test-local `HeldReplyHelper extends FakeHelper` with `takeReply(): Promise<HelperMessage>` and a transport that delivers held replies explicitly. Use two vault entries with identical usernames on different sites. Assert the second concurrent call rejects `{code: "busy"}`, only one password command was sent, the held first reply resolves only the first request, and a later sequential second read returns its own secret. Repeat simultaneous calls before encryption settles, different tabs/users and duplicate same-login clicks. Do not use sleeps for ordering.
- [ ] Add fake-timer tests asserting no timeout at 119_999 ms and `{code: "timeout"}` at 120_000 ms with state `closed`. A later read on that client rejects `closed`; a fresh client requires pairing. Replace existing tests that expect unsafe supersession or continued use after an ambiguous timeout. Add timed-out login-list and pairing cases so late same-command responses cannot answer new operations. Preserve concurrent different-command success where routing remains unambiguous.
- [ ] Add metadata assertions: missing accepted with isolated request; exact bare host/full HTTPS URL accepted; unrelated host, suffix lookalike, non-string member, empty array and malformed URL rejected. Do not approximate related-site equivalence with substring or last-two-label matching; exact normalized hostname membership is the conservative policy. Document stricter handling of associated sites as a live-helper compatibility check.
- [ ] Run `bunx --no-install vitest run --project protocol`; expect overlap/timeout/site tests to fail for the intended reasons.
- [ ] Implement exclusive ownership before the first async operation and keep it until decryption/validation completes. Recheck connection/session generation after awaits. On timeout, reject the triggering waiter as timeout, close/disconnect the transport and reject other pending work; never leave old queued work usable on that connection. Reject malformed site metadata and ignore unsolicited messages that do not belong to the owned response context. Prevent post-close state resurrection.
- [ ] Run the protocol project; expect all tests, including SRP vectors and normal reads, to pass. Update protocol docs and commit `fix: isolate native credential requests and stale replies` after `git diff --check`.

### Task 2: Origin-bound UI selections and session-bound fills

**Files:** Modify `apps/extension/src/session/session.ts`, `src/messages.ts`, `entrypoints/background.ts`, `entrypoints/popup/main.ts`, `entrypoints/menu/main.ts`, `test/session.test.ts`; create `src/passwords/fill-login.ts`, `test/fill-login.test.ts`; extend `test/fill.test.ts` only if page-side checks change. Paths without a prefix in this task are relative to `apps/extension/`.

**Interfaces:** Add `Session.epoch: number` (readonly) and `Session.isCurrent(epoch: number): boolean`, true only for that live unlocked session. Add optional `SessionDeps.beforeAccess?: () => Promise<void>` called by `unlockedClient()` before access, for the later expiry task. `LoginsResult` gains `origin?: string`; both fill request variants require `expectedOrigin: string`. Create `fillLogin(deps: FillLoginDeps, selection: {tabId: number; username: string; expectedOrigin: string}, fill: (origin: string, password: string | null) => Promise<string>): Promise<string>`; deps supplies `session`, `tabUrl(tabId): Promise<URL | undefined>` and callbacks preserving chosen-login bookkeeping. Recoverable busy/timeout errors use the existing message envelope.

Test anchor (reuse the existing Session test's `setup()`):
```ts
it("invalidates the unlocked epoch on Lock", async () => {
  const { helper, session } = setup();
  await session.requestCode();
  await session.verifyCode(helper.currentCode ?? "");
  const epoch = session.epoch;
  expect(session.isCurrent(epoch)).toBe(true);
  session.lock();
  expect(session.isCurrent(epoch)).toBe(false);
});
```

- [ ] Add coordinator tests with deferred probe/read/fill promises: navigation before probing, between probe/read, and during read returns `origin-mismatch` without sending a password; missing expected origin is rejected at the runtime boundary; Lock during read/decryption causes rejection and no password fill. Same-origin username-only flow does not read a password; normal sequential password fill returns `filled`. Assert a second in-flight choice surfaces busy rather than silently disappearing.
- [ ] Add Session tests: Lock during pending connect/pairing cannot install a late client or report unlocked; reconnect increments epoch; old client status events do not mutate the new session; `beforeAccess` runs before returning a client, and a rejecting guard returns no client. Test a successful guard too.
- [ ] Run `bunx --no-install vitest run --project extension test/session.test.ts test/fill-login.test.ts`; expect new tests to fail. If project-relative filtering is not supported by the installed Vitest, run the full extension project rather than report zero collected tests.
- [ ] Extract only fill orchestration to `fill-login.ts`. Capture the selected origin from `list-logins` in popup/menu state and carry it on each click. Validate it against the actual tab before lookup and before dispatching plaintext. Capture/check epoch across awaits; prevent obsolete connect, verify and status continuations from restoring a locked session. Integrate with current choice tracking and preserve the final page-side origin check. Use existing Lock as the explicit cancellation path; show that instruction for busy/timed-out requests without auto-pairing or refilling.
- [ ] Run `bunx --no-install vitest run --project extension` and `bun run typecheck`; expect all collected tests and typechecking to pass. Update docs for busy recovery and commit `fix: bind credential fills to selected origin and session` after `git diff --check`.
