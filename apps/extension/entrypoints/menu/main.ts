import "./style.css";
import { DISPLAY_NAME } from "@/src/config.ts";
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

function reportSize() {
  void send({ type: "menu-resize", nonce, height: panel.getBoundingClientRect().height }).catch(() => {});
}

function close() {
  void send({ type: "menu-close", nonce }).catch(() => {});
}

function render(...children: (Node | null)[]) {
  panel.replaceChildren(...children.filter((c): c is Node => c !== null));
  requestAnimationFrame(reportSize);
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
else if (mode === "generated" || mode === "generated-unsaved") showGeneratedDone(mode === "generated");
else void showLogins();
