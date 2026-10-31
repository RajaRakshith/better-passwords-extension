import { describe, expect, it } from "vitest";
import { normalizeSettings, validateSettingsChanges } from "../src/settings.ts";

describe("settings migration and validation", () => {
  it("adds inactivity locking without discarding explicit old preferences", () => {
    expect(normalizeSettings(undefined)).toMatchObject({ idleTimeoutMinutes: 15, lockOnScreenLock: true });
    expect(normalizeSettings({ lockOnScreenLock: false, inlineMenu: false })).toMatchObject({
      idleTimeoutMinutes: 15,
      lockOnScreenLock: false,
      inlineMenu: false,
    });
    expect(normalizeSettings({ idleTimeoutMinutes: 0 }).idleTimeoutMinutes).toBe(0);
  });
  it.each([
    [],
    { idleTimeoutMinutes: -1 },
    { idleTimeoutMinutes: "Never" },
    { idleTimeoutMinutes: 7 },
    { inlineMenu: "false" },
  ])("rejects malformed settings changes %j", (changes) => expect(() => validateSettingsChanges(changes)).toThrow());
  it("normalizes corrupt stored settings to safe defaults", () => {
    expect(normalizeSettings({ idleTimeoutMinutes: "Never", lockOnScreenLock: null })).toMatchObject({
      idleTimeoutMinutes: 15,
      lockOnScreenLock: true,
    });
    expect(validateSettingsChanges({ idleTimeoutMinutes: 5, inlineMenu: false })).toEqual({
      idleTimeoutMinutes: 5,
      inlineMenu: false,
    });
  });
});
