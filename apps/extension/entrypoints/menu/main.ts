import "./style.css";
import { DISPLAY_NAME } from "@/src/config.ts";
import { send } from "@/src/messages.ts";
import { h } from "@/src/ui/h.ts";

// The inline menu, shown in an iframe under a login field. It is an extension page, so the web
// page can't read the usernames shown here or listen to keys typed into the code field.

const params = new URLSearchParams(window.location.hash.slice(1));
const nonce = params.get("nonce") ?? "";
const panel = document.getElementById("menu") as HTMLElement;

const SVG_NS = "http://www.w3.org/2000/svg";
function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", path);
  p.setAttribute("fill", "currentColor");
  svg.append(p);
  return svg;
}
const KEY =
  "M7.5 15.5a4 4 0 1 1 3.87-5h9.13a1 1 0 0 1 .7.3l1 1a1 1 0 0 1 0 1.4l-1.5 1.5a1 1 0 0 1-1.4 0l-.8-.8-.8.8a1 1 0 0 1-1.4 0l-.8-.8-.8.8a1 1 0 0 1-.7.3h-1.63a4 4 0 0 1-3.87 2.5Zm-1-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z";
const LOCK =
  "M7 10V8a5 5 0 0 1 10 0v2h.5A1.5 1.5 0 0 1 19 11.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-8A1.5 1.5 0 0 1 6.5 10H7Zm2 0h6V8a3 3 0 0 0-6 0v2Z";

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

function row(svgPath: string, title: string, detail: string, onChoose: () => void): HTMLButtonElement {
  const button = h(
    "button",
    { class: "row", attrs: { role: "option" } },
    icon(svgPath),
    h(
      "span",
      { class: "text" },
      h("span", { class: "title", textContent: title }),
      h("span", { class: "detail", textContent: detail }),
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
    render(message(`No saved passwords for ${result.hostname ?? "this site"}.`));
    return setTimeout(close, 1500);
  }
  const hostname = result.hostname ?? "";
  render(
    ...result.logins.map(({ username }) => row(KEY, username || "(no username)", hostname, () => void fill(username))),
    error ? message(error, true) : null,
  );
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

function showLocked(error?: string) {
  render(
    row(LOCK, "Unlock to fill passwords", DISPLAY_NAME, () => void startPairing()),
    error ? message(error, true) : null,
  );
}

async function startPairing() {
  try {
    await send({ type: "request-code" });
  } catch (e) {
    return showLocked(messageOf(e));
  }
  showCodeEntry();
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
      await showLogins();
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
  const rows = Array.from(panel.querySelectorAll<HTMLButtonElement>(".row"));
  if (rows.length === 0) return;
  event.preventDefault();
  const index = rows.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === "ArrowDown" ? index + 1 : index - 1;
  rows[(next + rows.length) % rows.length]?.focus();
});

// focus arrives here when the user presses ↓ in the field
window.addEventListener("focus", () => {
  if (!panel.contains(document.activeElement)) panel.querySelector<HTMLElement>(".row, .code")?.focus();
});

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  return text || "Something went wrong.";
}

if (params.get("mode") === "locked") showLocked();
else void showLogins();
