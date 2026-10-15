import "./style.css";
import { DISPLAY_NAME } from "@/src/config.ts";
import type { EmailSuggestions } from "@/src/messages.ts";
import { send } from "@/src/messages.ts";
import { applySystemAccent } from "@/src/ui/accent.ts";
import { h } from "@/src/ui/h.ts";

// The inline menu, shown in an iframe under a login field. It is an extension page, so the web
// page can't read the usernames shown here or listen to keys typed into the code field.

applySystemAccent();

const params = new URLSearchParams(window.location.hash.slice(1));
const nonce = params.get("nonce") ?? "";
/** The field the menu belongs to: "login", or "new-password" for sign-up and change-password forms. */
const kind = params.get("kind") ?? "login";
const panel = document.getElementById("menu") as HTMLElement;

const SVG_NS = "http://www.w3.org/2000/svg";
function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", path);
  p.setAttribute("fill", "currentColor");
  p.setAttribute("fill-rule", "evenodd");
  svg.append(p);
  return svg;
}
// Original glyphs, drawn on a 24-unit grid.
const KEY =
  "M12 1.75a5.25 5.25 0 0 1 1.5 10.28v1.72h1.9a.6.6 0 0 1 .6.6v1.3a.6.6 0 0 1-.6.6h-1.9v.75h1.4a.6.6 0 0 1 .6.6v1.3a.6.6 0 0 1-.6.6h-1.4v.6a.8.8 0 0 1-.23.56l-.7.7a.8.8 0 0 1-1.14 0l-.7-.7a.8.8 0 0 1-.23-.56v-8.15A5.25 5.25 0 0 1 12 1.75Zm0 2.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Z";
const LOCK =
  "M12 2a5 5 0 0 1 5 5v2.5h.5a2 2 0 0 1 2 2V20a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-8.5a2 2 0 0 1 2-2H7V7a5 5 0 0 1 5-5Zm0 1.75A3.25 3.25 0 0 0 8.75 7v2.5h6.5V7A3.25 3.25 0 0 0 12 3.75Z";
const CHECK =
  "M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm4.03 6.22a.75.75 0 0 0-1.06.03l-4.2 4.5-1.74-1.74a.75.75 0 1 0-1.06 1.06l2.29 2.29a.75.75 0 0 0 1.08-.02l4.72-5.06a.75.75 0 0 0-.03-1.06Z";
const PERSON =
  "M12 3.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 1.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM4.5 19.25c0-3.2 3.36-5.5 7.5-5.5s7.5 2.3 7.5 5.5a.75.75 0 0 1-1.5 0c0-2.1-2.5-4-6-4s-6 1.9-6 4a.75.75 0 0 1-1.5 0Z";
const ENVELOPE =
  "M4.5 5h15A2.5 2.5 0 0 1 22 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 16.5v-9A2.5 2.5 0 0 1 4.5 5Zm-.75 2.2v9.3c0 .41.34.75.75.75h15c.41 0 .75-.34.75-.75V7.2l-7.68 5.6a1.1 1.1 0 0 1-1.3 0L3.75 7.2Zm1.45-.45L12 11.7l6.8-4.95H5.2Z";
const REFRESH =
  "M12 4.5a7.5 7.5 0 0 1 6.9 4.55V6.25a.75.75 0 0 1 1.5 0v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1 0-1.5h2.62A6 6 0 1 0 18 12a.75.75 0 0 1 1.5 0A7.5 7.5 0 1 1 12 4.5Z";
const CANCEL =
  "M6.47 6.47a.75.75 0 0 1 1.06 0L12 10.94l4.47-4.47a.75.75 0 1 1 1.06 1.06L13.06 12l4.47 4.47a.75.75 0 1 1-1.06 1.06L12 13.06l-4.47 4.47a.75.75 0 0 1-1.06-1.06L10.94 12 6.47 7.53a.75.75 0 0 1 0-1.06Z";
const EYE =
  "M12 5c4.6 0 8.5 2.9 10 7-1.5 4.1-5.4 7-10 7S3.5 16.1 2 12c1.5-4.1 5.4-7 10-7Zm0 1.75c-3.6 0-6.7 2.1-8.1 5.25 1.4 3.15 4.5 5.25 8.1 5.25s6.7-2.1 8.1-5.25C18.7 8.85 15.6 6.75 12 6.75Zm0 1.75a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z";
const OPEN =
  "M6.5 3.5h11a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3Zm0 1.75c-.69 0-1.25.56-1.25 1.25v11c0 .69.56 1.25 1.25 1.25h11c.69 0 1.25-.56 1.25-1.25v-11c0-.69-.56-1.25-1.25-1.25h-11Zm3.25 3.5h5a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0v-3.19l-4.47 4.47a.75.75 0 0 1-1.06-1.06l4.47-4.47H9.75a.75.75 0 0 1 0-1.5Z";

// --- clickjacking guard ------------------------------------------------------------------------
// Where the browser supports IntersectionObserver v2, it reports whether this frame is actually
// visible on screen (not covered, not transparent). Clicks count only after 300 ms of visibility.

let visibleSince: number | undefined;
const tracksVisibility = "IntersectionObserverEntry" in window && "isVisible" in IntersectionObserverEntry.prototype;
if (tracksVisibility) {
  const options = { trackVisibility: true, delay: 100 } as IntersectionObserverInit;
  new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const visible = (entry as IntersectionObserverEntry & { isVisible: boolean }).isVisible;
      visibleSince = visible ? (visibleSince ?? performance.now()) : undefined;
    }
  }, options).observe(panel);
}

function deliberate(event: Event): boolean {
  if (!event.isTrusted) return false;
  if (!tracksVisibility) return true;
  return visibleSince !== undefined && performance.now() - visibleSince >= 300;
}

// --- rendering ---------------------------------------------------------------------------------

/** Asks for room for the whole list (the host caps it; beyond that the list scrolls). */
function reportSize() {
  const borders = panel.offsetHeight - panel.clientHeight;
  void send({ type: "menu-resize", nonce, height: panel.scrollHeight + borders }).catch(() => {});
}

function close() {
  void send({ type: "menu-close", nonce }).catch(() => {});
}

function render(...children: (Node | null)[]) {
  panel.replaceChildren(...children.filter((c): c is Node => c !== null));
  // right away: the frame stays hidden until the first report, and a hidden frame gets no
  // animation frames (reading the size lays the panel out synchronously)
  reportSize();
}

function row(
  svgPath: string,
  title: string,
  detail: string,
  onChoose: () => void,
  detailClass = "detail",
): HTMLButtonElement {
  const button = h(
    "button",
    { class: "row", attrs: { role: "option" } },
    icon(svgPath),
    h(
      "span",
      { class: "text" },
      h("span", { class: "title", textContent: title }),
      detail ? h("span", { class: detailClass, textContent: detail }) : null,
    ),
  );
  button.addEventListener("click", (event) => {
    if (deliberate(event)) onChoose();
  });
  return button;
}

function message(text: string, isError = false) {
  return h("div", { class: isError ? "message error" : "message", textContent: text });
}

async function showLogins(error?: string) {
  let result: Awaited<ReturnType<typeof send<{ type: "list-logins" }>>>;
  try {
    result = await send({ type: "list-logins" });
  } catch (e) {
    return render(message(messageOf(e), true));
  }
  if (result.logins.length === 0) {
    return render(message(`No saved passwords for ${result.hostname ?? "this site"}.`), openPasswordsRow(true));
  }
  const hostname = result.hostname ?? "";
  render(
    ...result.logins.map(({ username }) => row(KEY, username || "(no username)", hostname, () => void fill(username))),
    error ? message(error, true) : null,
    h("hr", { class: "separator" }),
    openPasswordsRow(false),
  );
}

async function showGenerate(error?: string) {
  let passwords: { strong: string; alphanumeric: string };
  try {
    passwords = await send({ type: "generate-passwords", nonce });
  } catch (e) {
    return render(message(messageOf(e), true));
  }
  render(
    passwordRow("Strong Password", passwords.strong, () => void useGenerated("strong")),
    passwordRow("Without Special Characters", passwords.alphanumeric, () => void useGenerated("alphanumeric")),
    error ? message(error, true) : null,
    h("hr", { class: "separator" }),
    openPasswordsRow(false),
  );
}

/** Shows the first characters only (and the hyphens), so a shared screen doesn't give it away. */
function masked(password: string): string {
  return [...password].map((c, i) => (i < 3 || c === "-" ? c : "•")).join("");
}

/**
 * A generated password, partly hidden. Hovering the eye shows it. The eye sits inside the row,
 * so a click on it is a click on the row.
 */
function passwordRow(title: string, password: string, onChoose: () => void): HTMLElement {
  const choice = row(KEY, title, masked(password), onChoose, "detail password");
  const detail = choice.querySelector(".password") as HTMLElement;
  const eye = h("span", { class: "reveal", title: "Show password" }, icon(EYE));
  // every move over the eye shows it (sturdier than relying on a single enter event)
  eye.addEventListener("pointermove", () => {
    if (detail.textContent !== password) detail.textContent = password;
  });
  eye.addEventListener("pointerleave", () => {
    detail.textContent = masked(password);
  });
  choice.append(eye);
  return choice;
}

/** Fills the password in now; Apple Passwords asks to save it when the form is submitted. */
async function useGenerated(style: "strong" | "alphanumeric") {
  try {
    const { result } = await send({ type: "use-generated-password", nonce, style });
    // when filled, the content script closes the menu
    if (result === "filled") return;
    await showGenerate(
      result === "menu-hidden"
        ? "The page tried to hide this menu, so nothing was filled in."
        : "Couldn't fill in this page.",
    );
  } catch (e) {
    await showGenerate(messageOf(e));
  }
}

/** The field already holds a strong password we generated. */
function showGeneratedDone(saved: boolean) {
  render(
    saved
      ? row(CHECK, "Strong Password Saved", "In Apple Passwords", () => close())
      : row(KEY, "Strong Password", "You'll be asked to save it when you continue", () => close()),
    row(KEY, "Choose a Different Password", "", () => void showGenerate()),
    h("hr", { class: "separator" }),
    openPasswordsRow(false),
  );
}

// --- sign-up email fields: Hide My Email ---------------------------------------------------------

async function showEmail() {
  // asking iCloud can take a second or two: show that something is happening, unless it's quick
  const loading = setTimeout(() => render(loadingRow(ENVELOPE, "Hide My Email")), 150);
  try {
    renderEmail(await send({ type: "email-suggestions", nonce }));
  } catch (e) {
    render(message(messageOf(e), true));
  } finally {
    clearTimeout(loading);
  }
}

/** A row that can't be chosen yet, with a spinner. */
function loadingRow(svgPath: string, title: string): HTMLElement {
  return h(
    "div",
    { class: "row loading", attrs: { "aria-busy": "true" } },
    icon(svgPath),
    h(
      "span",
      { class: "text" },
      h("span", { class: "title", textContent: title }),
      h("span", { class: "detail", textContent: "Loading…" }),
    ),
    h("span", { class: "spinner", attrs: { "aria-hidden": "true" } }),
  );
}

// the menu's last answer, so one part can be redrawn without asking again
let lastSuggestions: EmailSuggestions = { hideMyEmail: { state: "off" }, contacts: { state: "off" } };

function renderEmail(suggestions: EmailSuggestions, error?: string) {
  lastSuggestions = suggestions;
  const { hideMyEmail: hme, contacts } = suggestions;
  const rows: (Node | null)[] = [];
  if (hme.state === "hint") {
    rows.push(hintRow());
  } else if (hme.state === "ready") {
    const { address } = hme;
    rows.push(
      address
        ? row(ENVELOPE, address, "Hide My Email for this site", () => void useAddress(address, false))
        : row(
            ENVELOPE,
            "Hide My Email…",
            "Create a unique, random address that forwards to your inbox",
            () => void showProposal(),
          ),
    );
  } else if (hme.state === "signed-out") {
    rows.push(
      row(ENVELOPE, "Sign In to iCloud for Hide My Email", "Opens icloud.com in a new tab", async () => {
        await send({ type: "open-icloud" }).catch(() => {});
        close();
      }),
    );
  } else if (hme.state === "error") {
    rows.push(message(hme.message, true));
  }
  if (error) rows.push(message(error, true));

  // below Hide My Email: the user's own emails, from their contact card
  const own: Node[] = [];
  if (contacts.state === "ready") {
    for (const email of contacts.emails) {
      own.push(row(PERSON, email, "From your contact card", () => void fillOwnEmail(email)));
    }
  } else if (contacts.state === "hint") {
    own.push(companionHintRow());
  } else if (contacts.state === "needs-contacts") {
    own.push(message("To suggest your email addresses, allow Contacts in the Apple Passwords Plus app."));
  }
  if (rows.length > 0 && own.length > 0) rows.push(h("hr", { class: "separator" }));
  rows.push(...own);

  if (rows.length === 0) return close();
  render(...rows);
}

/** A row with a ✕ that dismisses it for good (without choosing the row). */
function dismissible(hint: HTMLButtonElement, label: string, onDismiss: () => Promise<unknown>): HTMLButtonElement {
  const dismiss = h("span", { class: "dismiss", title: "Don't show again" }, icon(CANCEL));
  dismiss.setAttribute("role", "button");
  dismiss.setAttribute("aria-label", label);
  dismiss.addEventListener("click", (event) => {
    // the ✕ sits inside the row: don't let the click choose the row
    event.stopPropagation();
    if (deliberate(event))
      void onDismiss()
        .catch(() => {})
        .finally(close);
  });
  hint.append(dismiss);
  return hint;
}

/** Advertises the companion app, which lets the menu suggest the emails on the user's contact card. */
function companionHintRow(): HTMLButtonElement {
  const hint = row(
    PERSON,
    "Suggest Your Email Addresses",
    "With the free Apple Passwords Plus app for Mac",
    async () => {
      await send({ type: "open-companion-page" }).catch(() => {});
      close();
    },
  );
  return dismissible(hint, "Don't suggest the app again", () => send({ type: "dismiss-companion-emails-hint" }));
}

async function fillOwnEmail(email: string) {
  try {
    const { result } = await send({ type: "fill-email", nonce, email });
    if (result !== "filled") renderEmail(lastSuggestions, fillError(result));
  } catch (e) {
    renderEmail(lastSuggestions, messageOf(e));
  }
}

function fillError(result: string): string {
  return result === "menu-hidden"
    ? "The page tried to hide this menu, so nothing was filled in."
    : "Couldn't fill in this page.";
}

/** Advertises Hide My Email until the user turns it on, or dismisses it for good with the ✕. */
function hintRow(): HTMLButtonElement {
  const hint = row(
    ENVELOPE,
    "Use Hide My Email",
    "A unique, random address that forwards to your inbox (iCloud+)",
    () => void enableHideMyEmail(),
  );
  return dismissible(hint, "Don't suggest Hide My Email again", () => send({ type: "dismiss-hide-my-email-hint" }));
}

async function enableHideMyEmail() {
  render(message("Turning on Hide My Email…"));
  try {
    renderEmail(await send({ type: "enable-hide-my-email", nonce }));
  } catch (e) {
    render(message(messageOf(e), true));
  }
}

async function showProposal() {
  render(message("Creating an address…"));
  try {
    const { address } = await send({ type: "generate-hide-my-email", nonce });
    render(
      row(ENVELOPE, address, "Use This Address", () => void useAddress(address, true)),
      row(REFRESH, "Try Another", "", () => void showProposal()),
    );
  } catch (e) {
    renderEmail({ ...lastSuggestions, hideMyEmail: { state: "ready" } }, messageOf(e));
  }
}

async function useAddress(address: string, reserve: boolean) {
  render(message(reserve ? "Setting up the address…" : "Filling it in…"));
  try {
    const { result } = await send({ type: "use-hide-my-email", nonce, address, reserve });
    // when filled, the content script closes the menu
    if (result !== "filled") {
      renderEmail({ ...lastSuggestions, hideMyEmail: { state: "ready", address } }, fillError(result));
    }
  } catch (e) {
    renderEmail({ ...lastSuggestions, hideMyEmail: { state: "ready" } }, messageOf(e));
  }
}

/** After unlocking: the menu's real content. */
function showUnlocked() {
  return kind === "new-password" ? showGenerate() : showLogins();
}

function openPasswordsRow(withDetail: boolean) {
  return row(OPEN, "Open Passwords…", withDetail ? "Look up or add a password" : "", async () => {
    await send({ type: "open-passwords-app" }).catch(() => {});
    close();
  });
}

async function fill(username: string) {
  try {
    const { result } = await send({ type: "fill-from-menu", nonce, username });
    if (result !== "filled") {
      await showLogins(
        result === "menu-hidden"
          ? "The page tried to hide this menu, so nothing was filled."
          : "Couldn't fill this page.",
      );
    }
  } catch (e) {
    await showLogins(messageOf(e));
  }
}

async function showLocked(error?: string) {
  const status = await send({ type: "get-status" }).catch(() => undefined);
  const touchId = status?.touchId === true;
  render(
    row(LOCK, touchId ? "Unlock with Touch ID" : unlockTitle(), DISPLAY_NAME, () =>
      touchId ? void unlockWithTouchId() : void startPairing(),
    ),
    error ? message(error, true) : null,
  );
}

function unlockTitle() {
  return kind === "new-password" ? "Unlock to suggest a strong password" : "Unlock to fill passwords";
}

async function startPairing() {
  try {
    await send({ type: "request-code" });
  } catch (e) {
    return showLocked(messageOf(e));
  }
  showCodeEntry();
}

async function unlockWithTouchId() {
  render(message("Confirm with Touch ID…"));
  try {
    await send({ type: "unlock-with-touch-id" });
    await showUnlocked();
  } catch (e) {
    // the code is on screen either way, so typing it still works
    showCodeEntry(messageOf(e));
  }
}

function showCodeEntry(error?: string) {
  const input = h("input", {
    class: "code",
    inputMode: "numeric",
    autocomplete: "one-time-code",
    maxLength: 6,
    ariaLabel: "Verification code",
    placeholder: "000000",
  });
  input.addEventListener("input", async () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    if (input.value.length < 6) return;
    input.disabled = true;
    try {
      await send({ type: "verify-code", code: input.value });
      await showUnlocked();
    } catch (e) {
      // a wrong code burns the challenge; ask the Mac for a fresh one
      await send({ type: "request-code", fresh: true }).catch(() => {});
      showCodeEntry(messageOf(e));
    }
  });
  render(message("Enter the code shown on your Mac"), input, error ? message(error, true) : null);
  input.focus();
}

// --- keyboard ----------------------------------------------------------------------------------

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") return close();
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const items = Array.from(panel.querySelectorAll<HTMLElement>(".row, .code"));
  if (items.length === 0) return;
  event.preventDefault();
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (event.key === "ArrowDown") return items[Math.min(index + 1, items.length - 1)]?.focus();
  // ↑ from the first item goes back to the field on the page, keeping the menu open
  if (index <= 0) return returnToField();
  items[index - 1]?.focus();
});

function returnToField() {
  (document.activeElement as HTMLElement | null)?.blur();
  void send({ type: "menu-focus-field", nonce }).catch(() => {});
}

// focus arrives here when the user presses ↓ in the field
window.addEventListener("focus", () => {
  if (!panel.contains(document.activeElement)) panel.querySelector<HTMLElement>(".row, .code")?.focus();
});

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return text || "Something went wrong.";
}

const mode = params.get("mode");
if (mode === "locked") void showLocked();
else if (mode === "generate") void showGenerate();
else if (mode === "email") void showEmail();
else if (mode === "generated" || mode === "generated-unsaved") showGeneratedDone(mode === "generated");
else void showLogins();
