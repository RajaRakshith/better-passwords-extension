import "./style.css";
import { DISPLAY_NAME, REPO_URL, SETUP_COMMAND } from "@/src/config.ts";
import { type LoginsResult, type Settings, type Status, send } from "@/src/messages.ts";
import { applySystemAccent } from "@/src/ui/accent.ts";
import { bindCodeInput } from "@/src/ui/code-input.ts";
import { h } from "@/src/ui/h.ts";
import { icon, OPEN } from "@/src/ui/icons.ts";

applySystemAccent();

const app = document.getElementById("app") as HTMLElement;

function show(...children: (Node | false | null | undefined)[]) {
  app.replaceChildren(...children.filter((c): c is Node => Boolean(c)));
}

function errorLine(message: string | undefined) {
  return message ? h("p", { class: "error", textContent: message }) : null;
}

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function refresh(error?: string) {
  let status: Status;
  try {
    status = await send({ type: "get-status" });
  } catch (e) {
    return showRetry(messageOf(e));
  }

  switch (status.state) {
    case "no-helper":
      return showSetup(status);
    case "unlocked":
      return showLogins(status, error);
    case "awaiting-code":
      return showCodeEntry(status, error ?? status.error);
    default:
      // locked or disconnected: start unlocking right away, saving the user a click
      if (status.touchId && !error) return unlockWithTouchId(status);
      try {
        await send({ type: "request-code" });
        return showCodeEntry(status, error);
      } catch (e) {
        return showRetry(error ?? messageOf(e));
      }
  }
}

async function unlockWithTouchId(status: Status) {
  show(h("h1", { textContent: "Confirm with Touch ID" }), h("p", {}, "The code your Mac shows is entered for you."));
  try {
    await send({ type: "unlock-with-touch-id" });
    await refresh();
  } catch (e) {
    // the code is on screen either way, so typing it still works
    showCodeEntry(status, messageOf(e));
  }
}

function showSetup(status: Status) {
  const steps =
    status.variant === "github"
      ? h(
          "p",
          {},
          "This build uses Apple's own connection. Make sure macOS 14 or later is signed in to iCloud with Passwords turned on, and that Apple's iCloud Passwords extension is disabled.",
        )
      : h(
          "div",
          { class: "card padded" },
          h("p", {}, "Run this once in Terminal, then reopen this popup:"),
          h("code", { textContent: SETUP_COMMAND }),
        );
  show(
    h("h1", { textContent: "One-time setup" }),
    h("p", {}, "This browser can't reach Apple Passwords yet."),
    steps,
    h("a", { href: `${REPO_URL}#setup`, target: "_blank", textContent: "Setup guide" }),
    errorLine(status.error),
  );
}

function showRetry(error: string) {
  const retry = h("button", { class: "primary", textContent: "Try again" });
  retry.addEventListener("click", () => void refresh());
  show(h("h1", { textContent: DISPLAY_NAME }), errorLine(error), h("div", { class: "actions" }, retry));
}

function showCodeEntry(status: Status, error?: string) {
  const input = h("input", {
    class: "code",
    inputMode: "numeric",
    autocomplete: "one-time-code",
    ariaLabel: "Verification code",
    autofocus: true,
  });
  const newCode = h("button", { class: "link", textContent: "Show a new code" });

  const submit = async (code: string) => {
    input.disabled = true;
    try {
      await send({ type: "verify-code", code });
      await refresh();
    } catch (e) {
      // a wrong code burns the challenge, so ask the Mac for a fresh one
      await send({ type: "request-code", fresh: true }).catch(() => {});
      showCodeEntry(status, messageOf(e));
    }
  };

  bindCodeInput(input, (code) => void submit(code));
  newCode.addEventListener("click", async () => {
    await send({ type: "request-code", fresh: true }).catch((e) => showCodeEntry(status, messageOf(e)));
    input.value = "";
    input.focus();
  });

  // the code box, with a hint for when Apple's window has the keyboard
  const field = h(
    "div",
    { class: "code-field" },
    input,
    h("span", { class: "click-hint", textContent: "Click here to type the code" }),
  );
  field.addEventListener("click", () => input.focus());

  let touchId: HTMLButtonElement | null = null;
  if (status.touchId) {
    touchId = h("button", { class: "link", textContent: "Enter it for me" });
    touchId.addEventListener("click", () => void unlockWithTouchId(status));
  }
  const companionHint =
    status.companion === "needs-setup"
      ? h("p", { class: "hint" }, "To skip typing the code, finish setting up the companion app.")
      : null;

  show(
    h("h1", { textContent: "Enter the code shown on your Mac" }),
    h("p", {}, "Your Mac is showing a 6-digit verification code. You only need to do this once per browser session."),
    field,
    errorLine(error),
    h("div", { class: "actions" }, newCode, touchId),
    companionHint,
  );
  // Apple's code window takes keyboard focus as it appears, while the popup stays open. Try to
  // take it back as the window shows up; if that's not allowed, the box asks for a click
  // (see "waiting-for-focus") and takes focus as soon as the popup has it again.
  const update = () => {
    if (!input.isConnected) return stop();
    const focused = document.hasFocus();
    field.classList.toggle("waiting-for-focus", !focused);
    if (focused && !input.disabled) input.focus();
  };
  const reclaim = () => {
    if (!input.isConnected || document.hasFocus()) return;
    window.focus();
    update();
  };
  const timers = [0, 150, 400, 800, 1500].map((ms) => setTimeout(reclaim, ms));
  const interval = setInterval(update, 300);
  const stop = () => {
    for (const timer of timers) clearTimeout(timer);
    clearInterval(interval);
    window.removeEventListener("focus", update);
    window.removeEventListener("blur", update);
  };
  window.addEventListener("focus", update);
  window.addEventListener("blur", update);
  requestAnimationFrame(update);
}

async function showLogins(status: Status, error?: string) {
  const tabId = await activeTabId();
  let result: LoginsResult = { logins: [] };
  try {
    if (tabId !== undefined) result = await send({ type: "list-logins", tabId });
  } catch (e) {
    error ??= messageOf(e);
  }

  let body: Node;
  if (!result.hostname) {
    body = h("p", {}, "Open a website to see its saved passwords.");
  } else if (result.logins.length === 0) {
    body = h("p", {}, `No saved passwords for ${result.hostname}.`);
  } else {
    body = h(
      "ul",
      { class: "card logins" },
      ...result.logins.map(({ username }) => {
        const button = h(
          "button",
          { class: "login", title: `Fill ${username}` },
          h("span", { class: "avatar", textContent: (username[0] ?? "?").toUpperCase() }),
          h("span", { class: "name", textContent: username || "(no username)" }),
        );
        button.addEventListener("click", () => void fill(tabId as number, username));
        return h("li", {}, button);
      }),
    );
  }

  const openApp = h("button", { class: "link with-icon" }, icon(OPEN), "Open Passwords App");
  openApp.addEventListener("click", async () => {
    await send({ type: "open-passwords-app", ...(tabId === undefined ? {} : { tabId }) }).catch(() => {});
    window.close();
  });

  show(
    h("h1", { textContent: result.hostname ?? DISPLAY_NAME }),
    body,
    await unconfirmedPasswords(tabId),
    errorLine(error),
    h("div", { class: "actions" }, openApp),
    await footer(status),
  );
}

/**
 * Generated passwords that replaced a saved one on this site. Apple's helper can't confirm the
 * update, so if the user didn't click Update Password, this is where the new password still is.
 */
async function unconfirmedPasswords(tabId: number | undefined) {
  if (tabId === undefined) return null;
  const entries = await send({ type: "unconfirmed-passwords", tabId }).catch(() => []);
  if (entries.length === 0) return null;
  return h(
    "section",
    { class: "recent" },
    h("h2", { textContent: "Recent passwords" }),
    h(
      "ul",
      { class: "card" },
      ...entries.map(({ username, password }) => {
        const copy = h("button", { class: "secondary", textContent: "Copy" });
        copy.addEventListener("click", async () => {
          await navigator.clipboard.writeText(password);
          copy.textContent = "Copied";
        });
        return h("li", { class: "actions" }, h("span", { textContent: username || "(no username)" }), copy);
      }),
    ),
    h("p", { class: "hint" }, "New passwords from this session, in case one wasn't saved."),
  );
}

async function fill(tabId: number, username: string) {
  try {
    const { result } = await send({ type: "fill", tabId, username });
    if (result === "filled") return window.close();
    await refresh(result === "no-fields" ? "No login fields found on this page." : "The page changed, try again.");
  } catch (e) {
    await refresh(messageOf(e));
  }
}

type Option = (key: keyof Settings, label: string, detail?: string, disabled?: boolean) => HTMLElement;

async function footer(status: Status) {
  const settings: Settings = await send({ type: "get-settings" });
  const option: Option = (key, label, detail, disabled = false) => {
    const toggle = h("input", { type: "checkbox", checked: !disabled && settings[key], disabled });
    toggle.addEventListener("change", () => {
      void send({ type: "set-settings", settings: { [key]: toggle.checked } });
    });
    return h(
      "label",
      { class: "toggle" },
      toggle,
      h("span", { class: "text" }, label, detail ? h("span", { class: "detail", textContent: detail }) : null),
    );
  };
  const lock = h("button", { class: "secondary", textContent: "Lock" });
  lock.addEventListener("click", async () => {
    await send({ type: "lock" });
    window.close();
  });
  return h(
    "div",
    { class: "settings" },
    h("h2", { textContent: "Suggestions" }),
    option("inlineMenu", "When signing in", "saved passwords"),
    option("generatePasswords", "When signing up", "strong passwords and emails"),
    option("hideMyEmail", "Hide My Email", "uses icloud.com"),
    h("hr"),
    macAppSection(status, option),
    h("hr"),
    // Firefox's idle API never reports "locked", so the option would do nothing there
    h(
      "div",
      { class: "actions" },
      import.meta.env.FIREFOX ? h("span") : option("lockOnScreenLock", "Lock when my Mac locks"),
      lock,
    ),
  );
}

/**
 * What the companion app adds. Without it (or before its setup is done) the options are shown, greyed
 * out, next to one button that gets it, so they're discoverable but never a switch that does nothing.
 */
function macAppSection(status: Status, option: Option) {
  const ready = status.companion === "ready";
  const openApp = (label: string) => {
    const button = h("button", { class: "link", textContent: label });
    button.addEventListener("click", () => void openCompanion("open-companion-app"));
    return button;
  };
  const options = h(
    "div",
    { class: "options" },
    option("touchId", "Enter the 6-digit code for me", "after Touch ID", !ready),
    option("suggestEmails", "Suggest my emails", "from your contact card", !ready),
  );
  if (ready) {
    return h(
      "section",
      { class: "mac-app" },
      h("div", { class: "actions" }, h("h2", { textContent: "Companion app" }), openApp("Open Companion App…")),
      options,
    );
  }
  const installed = status.companion === "needs-setup";
  const cta = h(
    "button",
    { class: "cta" },
    h("img", { src: "/icon/32.png", alt: "" }),
    installed ? "Finish Setting Up" : "Get Companion App",
  );
  cta.addEventListener("click", () => void openCompanion(installed ? "open-companion-app" : "open-companion-page"));
  return h(
    "section",
    { class: "mac-app unavailable" },
    h("h2", { textContent: "Companion app" }),
    h("div", { class: "offer" }, options, cta),
  );
}

async function openCompanion(type: "open-companion-app" | "open-companion-page") {
  await send({ type }).catch(() => {});
  window.close();
}

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return text || "Something went wrong. Try again, or reload the extension.";
}

void refresh();
