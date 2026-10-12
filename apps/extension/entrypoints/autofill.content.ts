import { isLoginField, isPasswordField } from "@/src/autofill/fields.ts";
import { MenuHost } from "@/src/autofill/menu-host.ts";
import { isMenuGenuinelyVisible } from "@/src/autofill/visibility.ts";
import { FILL_MATCHES } from "@/src/config.ts";
import { fillCredentials } from "@/src/fill.ts";
import { type ContentMessage, send } from "@/src/messages.ts";

// Top frame only for now. Logins inside cross-origin iframes need their own origin rules.
export default defineContentScript({
  matches: FILL_MATCHES,
  runAt: "document_idle",
  main(ctx) {
    const menu = new MenuHost(browser.runtime.getURL("/menu.html"));
    let request = 0;

    async function offer(field: HTMLInputElement) {
      if (menu.anchor === field) return;
      const ticket = ++request;
      const { show } = await send({ type: "autofill-status" }).catch(() => ({ show: "none" as const }));
      // the user may have moved on while we asked
      if (ticket !== request || document.activeElement !== field) return;
      // when locked, offer to unlock only where a password is clearly expected
      if (
        show === "logins" ||
        (show === "locked" && (isPasswordField(field) || field.autocomplete.includes("username")))
      ) {
        menu.open(field, show);
      } else {
        menu.close();
      }
    }

    ctx.addEventListener(
      document,
      "focusin",
      (event) => {
        if (event.target === menu.element) return;
        if (isLoginField(event.target)) void offer(event.target);
        else if (menu.isOpen) menu.close();
      },
      { capture: true },
    );
    ctx.addEventListener(
      document,
      "mousedown",
      (event) => {
        if (menu.isOpen && event.target !== menu.element && event.target !== menu.anchor) menu.close();
      },
      { capture: true },
    );
    ctx.addEventListener(
      document,
      "keydown",
      (event) => {
        if (!menu.isOpen || event.target !== menu.anchor) return;
        if (event.key === "Escape") menu.close();
        if (event.key === "ArrowDown") {
          event.preventDefault();
          menu.focusMenu();
        }
      },
      { capture: true },
    );
    ctx.addEventListener(window, "scroll", () => menu.position(), { capture: true, passive: true });
    ctx.addEventListener(window, "resize", () => menu.position());
    ctx.onInvalidated(() => menu.close());

    // messages relayed by the background from our menu page; only our extension can send these
    browser.runtime.onMessage.addListener((message: ContentMessage, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id || !menu.isCurrent(message.nonce)) return false;
      switch (message.type) {
        case "menu-resize":
          menu.resize(message.height);
          return false;
        case "menu-close": {
          const anchor = menu.anchor;
          menu.close();
          anchor?.focus();
          return false;
        }
        case "menu-fill": {
          const anchor = menu.anchor;
          if (!anchor || !isMenuGenuinelyVisible(menu.element)) {
            sendResponse({ result: "menu-hidden" });
            menu.close();
            return false;
          }
          const result = fillCredentials(message.origin, message.username, message.password, anchor);
          menu.close();
          sendResponse({ result });
          return false;
        }
      }
    });

    if (isLoginField(document.activeElement)) void offer(document.activeElement);
  },
});
