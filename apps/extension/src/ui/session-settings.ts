import type { IdleTimeoutMinutes, Settings } from "../messages.ts";
import { h } from "./h.ts";

export function sessionSettings(
  settings: Settings,
  firefox: boolean,
  save: (changes: Partial<Settings>) => Promise<Settings>,
  lock: () => void,
): HTMLElement {
  const error = h("p", { class: "error", attrs: { role: "status", "aria-live": "polite" } });
  const select = h(
    "select",
    { ariaLabel: "Lock after inactivity" },
    ...[5, 15, 30, 60, 0].map((minutes) =>
      h("option", { value: String(minutes), textContent: minutes ? `${minutes} minutes` : "Never" }),
    ),
  );
  let minutes = settings.idleTimeoutMinutes;
  select.value = String(minutes);
  select.addEventListener("change", async () => {
    select.disabled = true;
    try {
      const result = await save({ idleTimeoutMinutes: Number(select.value) as IdleTimeoutMinutes });
      minutes = result.idleTimeoutMinutes;
      error.textContent = "";
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : "Couldn't save settings.";
    } finally {
      select.value = String(minutes);
      select.disabled = false;
    }
  });
  const screen = h("input", { type: "checkbox", checked: settings.lockOnScreenLock });
  screen.addEventListener("change", async () => {
    screen.disabled = true;
    try {
      const result = await save({ lockOnScreenLock: screen.checked });
      settings = result;
      error.textContent = "";
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : "Couldn't save settings.";
    } finally {
      screen.checked = settings.lockOnScreenLock;
      screen.disabled = false;
    }
  });
  return h(
    "section",
    { class: "session-settings" },
    h("label", { class: "actions" }, h("span", { textContent: "Lock after inactivity" }), select),
    h("p", {
      class: "hint",
      textContent: firefox
        ? "Uses Mac input inactivity; it does not detect screen locking immediately."
        : "Uses Mac input inactivity, including time spent in other apps.",
    }),
    h("p", {
      class: "hint",
      textContent: "Locking clears temporary passwords, including generated passwords that have not been saved.",
    }),
    firefox ? null : h("label", { class: "toggle" }, screen, h("span", { textContent: "Lock when my Mac locks" })),
    error,
    h("button", { class: "secondary", textContent: "Lock", onclick: lock }),
  );
}
