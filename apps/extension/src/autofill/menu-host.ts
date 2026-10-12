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
};

function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class MenuHost {
  readonly #host: HTMLElement;
  readonly #frame: HTMLIFrameElement;
  #anchor: HTMLInputElement | undefined;
  #nonce: string | undefined;
  #height = 48;

  constructor(private readonly menuUrl: string) {
    this.#host = document.createElement("app-autofill-menu");
    this.#host.setAttribute("popover", "manual");
    this.#frame = document.createElement("iframe");
    this.#frame.setAttribute("title", "Apple Passwords Plus");
    this.#frame.setAttribute("allow", "");
    for (const [key, value] of Object.entries({ border: "0", width: "100%", height: "100%", display: "block" })) {
      this.#frame.style.setProperty(key, value, "important");
    }
    this.#frame.style.setProperty("color-scheme", "light dark", "important");
    this.#host.attachShadow({ mode: "closed" }).append(this.#frame);
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
    // the nonce ties requests to this menu; a copy of menu.html framed by the page itself has none
    this.#frame.src = `${this.menuUrl}#${new URLSearchParams({ nonce: this.#nonce, mode })}`;
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
    this.#frame.focus();
  }

  close(): void {
    this.#nonce = undefined;
    this.#anchor = undefined;
    if (this.#host.matches(":popover-open")) this.#host.hidePopover();
    this.#frame.src = "about:blank";
    this.#host.remove();
  }

  #applyStyle(extra: Record<string, string> = {}): void {
    for (const [key, value] of Object.entries({ ...HOST_STYLE, ...extra })) {
      this.#host.style.setProperty(key, value, "important");
    }
  }
}
