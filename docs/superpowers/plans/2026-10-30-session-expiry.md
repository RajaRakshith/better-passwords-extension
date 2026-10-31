# Zen Session Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expire stale password sessions using system inactivity in Zen without pretending Firefox reports Mac screen locks.

**Architecture:** Normalize settings in a small module and test an injected idle-policy controller separately from the background. Wire it to idle transitions, periodic observations and guarded credential access; reuse Session.lock for cleanup. Keep the separate overdue-update policy intact.

**Tech Stack:** TypeScript, browser idle/alarms/storage APIs, plain DOM popup settings, Vitest fake timers and mocks.

**Spec:** [Approved design](../specs/2026-10-30-security-fixes-design.md); [master plan](2026-10-30-security-fixes.md). Depends on credential plan Task 2's session epoch and `beforeAccess` hook.

## Global Constraints

- Inactivity options: 5, 15, 30, 60 minutes and Never; default 15. This measures system input inactivity, not lack of extension interaction.
- Lock cleanup includes pending operations and temporary unsaved password buffers; disclose that loss beside the setting.
- Zen does not receive a functional screen-lock option. No companion changes or new permissions.
- Overdue updates still wait 24 hours and then use screen lock or one hour of system inactivity, independent of the chosen session timeout.

## Review Focus

1. Settings can already contain explicit `false` for screen-lock preference (Task 1).
2. Unlock/setting changes can occur while the OS is already idle (Task 1).
3. Sleep can hide idle transitions and browser timeouts can be throttled (Task 1).
4. Async idle queries can answer out of order after Lock or a setting change (Task 1).
5. Changing the browser idle interval must not prematurely trigger updates with Never selected (Task 2).

---

### Task 1: Settings and inactivity policy

**Files:** Create `apps/extension/src/settings.ts`, `src/session/idle-lock.ts`, `test/settings.test.ts`, `test/idle-lock.test.ts`; modify `src/messages.ts`, `test/session.test.ts`. Paths following the first are relative to `apps/extension/`.

**Interfaces:** Add `type IdleTimeoutMinutes = 0 | 5 | 15 | 30 | 60` (0 means Never) and `Settings.idleTimeoutMinutes`. Export `normalizeSettings(raw: unknown): Settings` and `validateSettingsChanges(raw: unknown): Partial<Settings>` from `settings.ts`; reject unsupported values rather than trusting cast browser messages. Add `IdleLock` with `configure(minutes: IdleTimeoutMinutes): Promise<void>`, `onUnlocked(): Promise<void>`, `onStateChanged(state: "active" | "idle" | "locked"): Promise<void>`, `check(): Promise<void>`, `beforeAccess(): Promise<void>`. Deps: `queryState(seconds: number): Promise<"active" | "idle" | "locked">`, `lock(): void`, `isUnlocked(): boolean`, `now(): number` (epoch milliseconds). Controller does not own timer APIs.

Test anchor:
```ts
it("defaults to 15 minutes and preserves explicit Never and screen-lock false", () => {
  expect(normalizeSettings(undefined).idleTimeoutMinutes).toBe(15);
  expect(normalizeSettings({ idleTimeoutMinutes: 0, lockOnScreenLock: false }))
    .toMatchObject({ idleTimeoutMinutes: 0, lockOnScreenLock: false });
});
```

- [ ] Add normalization assertions: missing timeout yields 15; explicit 0 survives; existing `lockOnScreenLock: false` survives; fresh default screen locking is true; malformed arrays/objects/types and unsupported timeouts cannot bypass the policy. Assert `validateSettingsChanges({idleTimeoutMinutes: 7})` throws and normal valid booleans persist.
- [ ] Add policy assertions using controlled idle-query promises: at 15-minute threshold state idle locks once; active does not; Never skips inactivity locking; configure 5 while already idle locks; onUnlocked checks existing idle state; guard failure locks/rejects rather than returning a client; an old query after reconfiguration/unlock cannot apply an obsolete decision. Use a configuration generation to invalidate stale observations.
- [ ] Add suspension coverage: check while active, advance injected wall clock by more than the configured timeout without observations, query active after resume, then assert conservative locking before password access. For normal uninterrupted periodic active samples, no lock. Document that a long observation gap causes re-pairing even if an idle event was missed; do not claim this identifies the exact screen-lock time. Never disables this session-expiry gap policy too.
- [ ] Run `bunx --no-install vitest run --project extension`; expect failures for the new interfaces/defaults/expiry behavior.
- [ ] Implement normalization/validation and the injected policy. Initialize observation time when unlocked; query at unlock/settings changes and before access; serialize/coalesce normal checks and invalidate obsolete async results. Use the approved threshold, require a new pairing after locking, and never trigger automatic fill. Handle backwards wall-clock jumps conservatively by invalidating the observation baseline and locking on credential access when the session's age cannot be established.
- [ ] Run the extension project; expect all new tests and existing session/update tests to pass. Commit only these files with `feat: add configurable system inactivity locking` after `git diff --check`.

### Task 2: Background and popup integration

**Files:** Modify `apps/extension/entrypoints/background.ts`, `entrypoints/popup/main.ts`, `src/updates.ts` only if necessary; create `test/idle-integration.test.ts`, `test/settings-ui.test.ts`; modify `test/updates.test.ts`, `docs/architecture.md`, `docs/threat-model.md`.

**Interfaces:** Consume `IdleLock`, normalized Settings and `SessionDeps.beforeAccess`. Extract testable orchestration to `apps/extension/src/session/idle-integration.ts` only if needed: export `idleDetectionSeconds(minutes: IdleTimeoutMinutes): number`, returning minutes*60 for configured locking or 3600 for Never, and `updateBreakState(queryState): Promise<boolean>`, querying 3600 seconds independently. Popup persists `idleTimeoutMinutes` through existing set-settings messages.

Test anchor:
```ts
it("keeps update inactivity at one hour despite a shorter session setting", async () => {
  const queryState = vi.fn().mockResolvedValue("active");
  expect(idleDetectionSeconds(5)).toBe(300);
  expect(await updateBreakState(queryState)).toBe(false);
  expect(queryState).toHaveBeenCalledWith(3600);
});
```

- [ ] Add integration assertions: browser idle detection uses 300 seconds for 5 minutes and 3600 for Never; a pending update older than 24 hours does not apply at 5-minute idle when the one-hour query remains active; it does apply at one-hour idle or a supported screen-lock event. Recent updates do not bypass the existing harmlessness check. Confirm browser state requests use distinct thresholds.
- [ ] Add DOM/message tests: selector includes 5/15/30/60/Never, defaults to 15, persists selection, renders the unsaved-password warning and restores saved state after an error. Firefox/Zen omits the screen-lock toggle; Chromium preserves explicit false and defaults fresh users to true. Assert expiry routes through Session.lock and clears pending/generated/unconfirmed buffers, not just the visible status.
- [ ] Run `bunx --no-install vitest run --project extension`; expect the integration/UI assertions to fail.
- [ ] Wire settings and policy into background startup, unlock, set-settings, idle transitions and a dedicated 30-second alarm while unlocked. Call `beforeAccess` through Session for helper reads/saves and explicitly guard generated/unconfirmed-password access and generation/fill operations that use memory without `unlockedClient()`. Do not gate unrelated Hide My Email behind Apple vault pairing. Screen-lock handling on supported Chromium remains separate. Handle alarm removal on lock and reconfiguration without leaking listeners.
- [ ] Add the existing plain-DOM selector with copy: `Lock after inactivity` and `Locking clears temporary passwords, including generated passwords that have not been saved.` For Zen explain that this uses Mac input inactivity and does not detect screen locking immediately. Update architecture/threat-model descriptions without removing the deferred clickjacking limitation.
- [ ] Run `bunx --no-install vitest run --project extension`, `bun run typecheck`, `bun run build`; expect all tests/types/builds to pass. Commit `feat: wire inactivity expiry into Zen settings and credential access` after `git diff --check`.
