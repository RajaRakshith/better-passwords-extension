import "./style.css";
import { DISPLAY_NAME, REPO_URL, SETUP_COMMAND } from "@/src/config.ts";
import { type LoginsResult, type Settings, type Status, send } from "@/src/messages.ts";
import { h } from "@/src/ui/h.ts";

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
  show(
    h("h1", { textContent: "Unlock with Touch ID" }),
    h("p", {}, "Confirm with Touch ID, and the code your Mac shows is entered for you."),
  );
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
    maxLength: 6,
    ariaLabel: "Verification code",
    placeholder: "000000",
    autofocus: true,
  });
  const newCode = h("button", { class: "link", textContent: "Show a new code" });

  const submit = async () => {
    input.disabled = true;
    try {
      await send({ type: "verify-code", code: input.value });
      await refresh();
    } catch (e) {
      // a wrong code burns the challenge, so ask the Mac for a fresh one
      await send({ type: "request-code", fresh: true }).catch(() => {});
      showCodeEntry(status, messageOf(e));
    }
  };

  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    if (input.value.length === 6) void submit();
  });
  newCode.addEventListener("click", async () => {
    await send({ type: "request-code", fresh: true }).catch((e) => showCodeEntry(status, messageOf(e)));
    input.value = "";
    input.focus();
  });

  let touchId: HTMLButtonElement | null = null;
  if (status.touchId) {
    touchId = h("button", { class: "link", textContent: "Use Touch ID" });
    touchId.addEventListener("click", () => void unlockWithTouchId(status));
  }
  const companionHint =
    status.companion === "needs-setup"
      ? h("p", { class: "hint" }, "To unlock with Touch ID, finish setup in the Apple Passwords Plus app.")
      : null;

  show(
    h("h1", { textContent: "Enter the code shown on your Mac" }),
    h("p", {}, "Your Mac is showing a 6-digit verification code. You only need to do this once per browser session."),
    input,
    errorLine(error),
    h("div", { class: "actions" }, newCode, touchId),
    companionHint,
  );
  // Apple's code window can take focus as it appears; take it back when the popup regains it
  const refocus = () => {
    if (input.isConnected && !input.disabled) input.focus();
    else window.removeEventListener("focus", refocus);
  };
  window.addEventListener("focus", refocus);
  requestAnimationFrame(refocus);
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

  const openApp = h("button", { class: "link", textContent: "Open Passwords…" });
  openApp.addEventListener("click", async () => {
    await send({ type: "open-passwords-app", ...(tabId === undefined ? {} : { tabId }) }).catch(() => {});
    window.close();
  });

  show(
    h("h1", { textContent: result.hostname ?? DISPLAY_NAME }),
    body,
    errorLine(error),
    h("div", { class: "actions" }, openApp),
    await footer(status),
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

async function footer(status: Status) {
  const settings: Settings = await send({ type: "get-settings" });
  const option = (key: keyof Settings, label: string) => {
    const toggle = h("input", { type: "checkbox", checked: settings[key] });
    toggle.addEventListener("change", () => {
      void send({ type: "set-settings", settings: { [key]: toggle.checked } });
    });
    return h("label", { class: "toggle" }, toggle, label);
  };
  const lock = h("button", { class: "secondary", textContent: "Lock" });
  lock.addEventListener("click", async () => {
    await send({ type: "lock" });
    window.close();
  });
  return h(
    "div",
    { class: "settings" },
    option("inlineMenu", "Suggest logins in login fields"),
    option("generatePasswords", "Suggest strong passwords when signing up"),
    status.companion && status.companion !== "not-installed" ? option("touchId", "Unlock with Touch ID") : null,
    // Firefox's idle API never reports "locked", so the option would do nothing there
    h(
      "div",
      { class: "actions" },
      import.meta.env.FIREFOX ? h("span") : option("lockOnScreenLock", "Lock when my Mac locks"),
      lock,
    ),
  );
}

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return text || "Something went wrong. Try again, or reload the extension.";
}

void refresh();
