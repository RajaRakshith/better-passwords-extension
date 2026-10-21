// The first thing a new user sees: a welcome, the one step that connects this browser to Apple's
// helper, and a confirmation that it worked. Shown in the popup and on the setup page (setup.html),
// which opens on install and from the inline menu.

import "./setup.css";
import { COMPANION_DOWNLOAD_URL, REPO_URL, SETUP_COMMAND } from "../config.ts";
import { type Status, send } from "../messages.ts";
import { h } from "./h.ts";
import { CHECK, icon } from "./icons.ts";
import { reportProblem } from "./report.ts";

/** How the user chose to connect. Remembered because the popup closes while they do it. */
type Route = "app" | "terminal";
const ROUTE_KEY = "setupRoute";
/** How often to look for the connection while the welcome is on screen. */
const POLL_MS = 1_500;

export interface SetupAction {
  label: string;
  run: (button: HTMLButtonElement) => void;
}

export interface SetupOptions {
  /** Once connected: what moves the user on to unlocking. */
  next: SetupAction;
  /** Once unlocked, where the flow can still be on screen (the setup page). */
  finish?: SetupAction;
}

/**
 * Renders the step the user is at: the welcome while this browser can't reach the helper, then
 * "connected", then (on the setup page) "all set". It moves on by itself as setup completes.
 */
export async function setupFlow(status: Status, options: SetupOptions): Promise<HTMLElement> {
  const root = h("div", { class: "setup" });
  const os = await browser.runtime.getPlatformInfo().catch(() => undefined);
  if (os && os.os !== "mac") {
    root.append(
      h("img", { class: "app-icon", src: "/icon/128.png", alt: "" }),
      h("h1", { textContent: "Better Passwords needs a Mac" }),
      h("p", { class: "lead", textContent: "It fills passwords from Apple Passwords, on macOS 14 or later." }),
    );
    return root;
  }
  if (status.state === "no-helper") showWelcome(root, status, options);
  else if (status.state === "unlocked") showDone(root, options);
  else showConnected(root, options);
  return root;
}

function connected(status: Status | undefined): boolean {
  return status?.state === "locked" || status?.state === "awaiting-code" || status?.state === "unlocked";
}

/** Calls `check` every few seconds until it returns true, or `root` leaves the page. */
function poll(root: HTMLElement, check: () => Promise<boolean>) {
  let shown = false;
  let busy = false;
  const timer = setInterval(async () => {
    if (!root.isConnected) {
      // not on the page yet is fine; gone again means another screen replaced it
      if (shown) clearInterval(timer);
      return;
    }
    shown = true;
    if (busy) return;
    busy = true;
    try {
      if (await check()) clearInterval(timer);
    } finally {
      busy = false;
    }
  }, POLL_MS);
}

function showWelcome(root: HTMLElement, status: Status, options: SetupOptions) {
  // The route last acted on, so a reopened popup is still waiting; one route is shown at a time,
  // so nobody thinks they need both
  let acted = savedRoute();
  let view: Route = acted ?? "app";
  const route = h("div", { class: "route" });
  const waiting = h(
    "p",
    { class: "waiting", attrs: { role: "status" } },
    h("span", { class: "spinner", attrs: { "aria-hidden": "true" } }),
    "Waiting for the connection…",
  );

  function act(chosen: Route) {
    acted = chosen;
    try {
      localStorage.setItem(ROUTE_KEY, chosen);
    } catch {
      // storage can be unavailable; the popup then just forgets the choice when it closes
    }
    waiting.hidden = false;
  }

  function switchTo(next: Route) {
    view = next;
    route.replaceChildren(...(view === "app" ? appRoute(act, switchTo) : terminalRoute(act, switchTo)));
  }
  switchTo(view);
  waiting.hidden = acted === undefined;

  // "forbidden": a registration with our name exists but leaves this extension out
  const repair = /forbidden/i.test(status.error ?? "");
  show(
    root,
    h("img", { class: "app-icon", src: "/icon/128.png", alt: "" }),
    h("h1", { textContent: repair ? "Let's reconnect" : "Welcome to Better Passwords" }),
    h("p", {
      class: "lead",
      textContent: repair
        ? "This browser's link to Apple Passwords needs repairing. Connect it once more."
        : "First, connect this browser to Apple Passwords on your Mac.",
    }),
    route,
    waiting,
    repair && status.error
      ? h("details", { class: "details" }, h("summary", { textContent: "Details" }), status.error)
      : null,
    // setup is where people get stuck, so the way to say so is right there
    reportProblem(),
  );

  poll(root, async () => {
    const latest = await send({ type: "get-status" }).catch(() => undefined);
    if (!connected(latest)) return false;
    if (latest?.state === "unlocked") showDone(root, options);
    else showConnected(root, options);
    return true;
  });
}

function appRoute(act: (route: Route) => void, switchTo: (route: Route) => void): Node[] {
  const download = h("a", {
    class: "button primary",
    href: COMPANION_DOWNLOAD_URL,
    target: "_blank",
    rel: "noopener",
    textContent: "Download the Mac App",
  });
  download.addEventListener("click", () => act("app"));
  const other = h("button", { class: "link", type: "button", textContent: "Rather not install an app?" });
  other.addEventListener("click", () => switchTo("terminal"));
  return [download, h("p", { class: "note", textContent: "Free. Open it and click Connect." }), other];
}

function terminalRoute(act: (route: Route) => void, switchTo: (route: Route) => void): Node[] {
  const copy = h("button", { class: "button primary", type: "button", textContent: "Copy Terminal Command" });
  // shown only if copying fails, to select by hand
  const command = h("code", { class: "command", textContent: SETUP_COMMAND });
  command.hidden = true;
  copy.addEventListener("click", async () => {
    act("terminal");
    try {
      await navigator.clipboard.writeText(SETUP_COMMAND);
      copy.textContent = "Copied";
    } catch {
      command.hidden = false;
      getSelection()?.selectAllChildren(command);
    }
  });
  const other = h("button", { class: "link", type: "button", textContent: "Use the Mac app instead" });
  other.addEventListener("click", () => switchTo("app"));
  return [
    copy,
    command,
    h("p", { class: "note", textContent: "Then paste it into Terminal and press Return." }),
    h(
      "p",
      { class: "links" },
      other,
      h("a", {
        href: `${REPO_URL}/blob/main/scripts/setup-mac.sh`,
        target: "_blank",
        rel: "noopener",
        textContent: "Read the script",
      }),
    ),
  ];
}

function showConnected(root: HTMLElement, options: SetupOptions) {
  void send({ type: "setup-seen" }).catch(() => {});
  forgetRoute();
  const next = h("button", { class: "button primary", type: "button", textContent: options.next.label });
  next.addEventListener("click", () => options.next.run(next));
  show(
    root,
    h("div", { class: "badge" }, icon(CHECK)),
    h("h1", { textContent: "You're connected" }),
    h("p", { class: "lead", textContent: "Next, unlock with the code your Mac shows." }),
    h(
      "div",
      { class: "route" },
      next,
      h("p", { class: "note", textContent: "You do this once each time you open your browser." }),
    ),
  );

  if (!options.finish) return;
  poll(root, async () => {
    const latest = await send({ type: "get-status" }).catch(() => undefined);
    if (latest?.state !== "unlocked") return false;
    showDone(root, options);
    return true;
  });
}

function showDone(root: HTMLElement, options: SetupOptions) {
  forgetRoute();
  let finish: HTMLButtonElement | null = null;
  if (options.finish) {
    const action = options.finish;
    finish = h("button", { class: "button primary", type: "button", textContent: action.label });
    finish.addEventListener("click", () => action.run(finish as HTMLButtonElement));
  }
  show(
    root,
    h("div", { class: "badge" }, icon(CHECK)),
    h("h1", { textContent: "You're all set" }),
    h("p", {
      class: "lead",
      textContent: "Click a login field on any website to fill a password from Apple Passwords.",
    }),
    finish,
  );
}

function show(root: HTMLElement, ...children: (Node | false | null)[]) {
  root.replaceChildren(...children.filter((child): child is Node => Boolean(child)));
}

function savedRoute(): Route | undefined {
  try {
    const route = localStorage.getItem(ROUTE_KEY);
    return route === "app" || route === "terminal" ? route : undefined;
  } catch {
    return undefined;
  }
}

function forgetRoute() {
  try {
    localStorage.removeItem(ROUTE_KEY);
  } catch {
    // nothing remembered then
  }
}
