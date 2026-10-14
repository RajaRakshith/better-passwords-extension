// The inline menu's frame on the page: a top-layer popover holding a closed shadow root with our
// extension iframe. The page can see that the element exists, but can't see into the iframe
// (cross-origin) or the shadow root (closed), and can't style it (inline !important styles).

export type MenuMode = "logins" | "locked";

const WIDTH = 300;
const GAP = 4;
const MAX_HEIGHT = 320;

const HOST_STYLE: Record<string, string> = {
  all: "initial",
  position: "fixed",
  inset: "auto",
  margin: "0",
  padding: "0",
  border: "0",
  background: "transparent",
  overflow: "hidden",
  display: "block",
  opacity: "1",
  "z-index": "2147483647",
  "color-scheme": "light dark",
  // the shadow sits outside the iframe, which would clip it; the radius matches the menu panel
  "border-radius": "10px",
  "box-shadow": "0 8px 28px light-dark(rgb(0 0 0 / 0.18), rgb(0 0 0 / 0.5)), 0 1px 4px rgb(0 0 0 / 0.12)",
};

function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function createFrame(src: string): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Apple Passwords Plus");
  frame.setAttribute("allow", "");
  for (const [key, value] of Object.entries({
    border: "0",
    width: "100%",
    height: "100%",
    display: "block",
    "color-scheme": "light dark",
  })) {
    frame.style.setProperty(key, value, "important");
  }
  frame.src = src;
  return frame;
}

export class MenuHost {
  readonly #host: HTMLElement;
  readonly #shadow: ShadowRoot;
  #frame: HTMLIFrameElement | undefined;
  #anchor: HTMLInputElement | undefined;
  #nonce: string | undefined;
  #height = 48;

  constructor(private readonly menuUrl: string) {
    this.#host = document.createElement("app-autofill-menu");
    this.#host.setAttribute("popover", "manual");
    this.#shadow = this.#host.attachShadow({ mode: "closed" });
    this.#applyStyle();
  }

  get anchor(): HTMLInputElement | undefined {
    return this.#nonce ? this.#anchor : undefined;
  }

  get element(): HTMLElement {
    return this.#host;
  }

  isCurrent(nonce: unknown): boolean {
    return typeof nonce === "string" && nonce.length > 0 && nonce === this.#nonce;
  }

  get isOpen(): boolean {
    return this.#nonce !== undefined;
  }

  open(anchor: HTMLInputElement, mode: MenuMode): void {
    this.#anchor = anchor;
    this.#nonce = randomNonce();
    this.#height = 48;
    // A new iframe every time: changing only the URL fragment of an existing one would not reload
    // the menu page, which would keep the previous menu's nonce and size.
    // The nonce ties requests to this menu; a copy of menu.html framed by the page itself has none.
    this.#frame = createFrame(`${this.menuUrl}#${new URLSearchParams({ nonce: this.#nonce, mode })}`);
    this.#shadow.replaceChildren(this.#frame);
    if (!this.#host.isConnected) document.documentElement.append(this.#host);
    // re-entering the top layer puts us above anything the page opened before
    if (this.#host.matches(":popover-open")) this.#host.hidePopover();
    this.#host.showPopover();
    this.position();
  }

  resize(height: number): void {
    this.#height = Math.max(24, Math.min(MAX_HEIGHT, Math.ceil(height)));
    this.position();
  }

  /** Places the menu under the field, or above it when there is no room below. */
  position(): void {
    const anchor = this.#anchor;
    if (!this.isOpen || !anchor) return;
    if (!anchor.isConnected) {
      this.close();
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, WIDTH), window.innerWidth - 2 * GAP);
    const left = Math.min(Math.max(GAP, rect.left), window.innerWidth - width - GAP);
    const below = rect.bottom + GAP;
    const top =
      below + this.#height > window.innerHeight && rect.top > this.#height ? rect.top - GAP - this.#height : below;
    this.#applyStyle({ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${this.#height}px` });
  }

  focusMenu(): void {
    this.#frame?.focus();
  }

  close(): void {
    this.#nonce = undefined;
    this.#anchor = undefined;
    if (this.#host.matches(":popover-open")) this.#host.hidePopover();
    this.#frame = undefined;
    this.#shadow.replaceChildren();
    this.#host.remove();
  }

  #applyStyle(extra: Record<string, string> = {}): void {
    for (const [key, value] of Object.entries({ ...HOST_STYLE, ...extra })) {
      this.#host.style.setProperty(key, value, "important");
    }
  }
}
