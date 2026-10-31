import { describe, expect, it, vi } from "vitest";
import { normalizeSettings } from "../src/settings.ts";
import { sessionSettings } from "../src/ui/session-settings.ts";

describe("session settings UI", () => {
  it("persists Never and explains inactivity and temporary-password loss on Zen", async () => {
    let saved = normalizeSettings(undefined);
    const view = sessionSettings(
      saved,
      true,
      async (changes) => {
        saved = normalizeSettings({ ...saved, ...changes });
        return saved;
      },
      () => {},
    );
    const select = view.querySelector("select") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["5", "15", "30", "60", "0"]);
    expect(select.value).toBe("15");
    expect(view.textContent).toContain("not been saved");
    expect(view.textContent).toContain("screen locking");
    expect(view.querySelector('input[type="checkbox"]')).toBeNull();
    select.value = "0";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(saved.idleTimeoutMinutes).toBe(0));
    expect(select.disabled).toBe(false);
  });
  it("restores a rejected selection and exposes the error", async () => {
    const view = sessionSettings(
      normalizeSettings(undefined),
      true,
      async () => {
        throw new Error("Save failed");
      },
      () => {},
    );
    const select = view.querySelector("select") as HTMLSelectElement;
    select.value = "5";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(select.value).toBe("15"));
    expect(view.textContent).toContain("Save failed");
  });
  it("preserves an explicit false Chromium screen-lock preference and supports manual Lock", () => {
    let locks = 0;
    const settings = normalizeSettings({ lockOnScreenLock: false });
    const view = sessionSettings(
      settings,
      false,
      async () => settings,
      () => {
        locks++;
      },
    );
    expect((view.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    (view.querySelector("button") as HTMLButtonElement).click();
    expect(locks).toBe(1);
  });
});
