import { type FieldKind, fieldKind, isPasswordField } from "@/src/autofill/fields.ts";
import { MenuHost } from "@/src/autofill/menu-host.ts";
import { isMenuGenuinelyVisible } from "@/src/autofill/visibility.ts";
import { FILL_MATCHES } from "@/src/config.ts";
import { fillCredentials, fillNewPassword, usernameNear } from "@/src/fill.ts";
import { type ContentMessage, type NewPasswordContext, send } from "@/src/messages.ts";

// Top frame only for now. Logins inside cross-origin iframes need their own origin rules.
export default defineContentScript({
  matches: FILL_MATCHES,
  runAt: "document_idle",
  main(ctx) {
    const menu = new MenuHost(browser.runtime.getURL("/menu.html"));
    let request = 0;
    // the field whose menu the user just dismissed; it stays closed there until they ask again
    let dismissed: HTMLInputElement | undefined;
    // new-password fields by menu nonce: a save can outlast the menu (macOS asks the user first)
    const newPasswordFields = new Map<string, HTMLInputElement>();
    // the last generated password we filled: to recognise it, and to update its username when
    // the form is submitted
    let generated: { field: HTMLInputElement; value: string; saved: boolean } | undefined;

    async function offer(field: HTMLInputElement, kind: FieldKind) {
      if (menu.anchor === field || dismissed === field) return;
      const ticket = ++request;
      const { show } = await send({ type: "autofill-status", kind }).catch(() => ({ show: "none" as const }));
      // the user may have moved on while we asked
      if (ticket !== request || document.activeElement !== field) return;
      // when locked, offer to unlock only where a password is clearly expected
      const unlockHere = kind === "new-password" || isPasswordField(field) || field.autocomplete.includes("username");
      if (kind === "new-password" && field.value !== "") {
        // our own password: say it's saved; one the user typed: stay out of the way
        if (show !== "none" && generated?.field.form === field.form && field.value === generated.value) {
          menu.open(field, generated.saved ? "generated" : "generated-unsaved", kind);
        } else {
          menu.close();
        }
      } else if (show === "logins" || show === "generate" || (show === "locked" && unlockHere)) {
        menu.open(field, show, kind);
      } else {
        menu.close();
      }
    }

    /** Offers a menu for `target` if it gets one; returns whether it does. */
    function offerFor(target: EventTarget | null): boolean {
      const kind = fieldKind(target);
      if (!kind || kind === "signup-email") return false;
      void offer(target as HTMLInputElement, kind);
      return true;
    }

    ctx.addEventListener(
      document,
      "focusin",
      (event) => {
        if (event.target === menu.element) return;
        if (event.target !== dismissed) dismissed = undefined;
        if (!offerFor(event.target) && menu.isOpen) menu.close();
      },
      { capture: true },
    );
    ctx.addEventListener(
      document,
      "mousedown",
      (event) => {
        if (menu.isOpen && event.target !== menu.element && event.target !== menu.anchor) menu.close();
        // clicking a field whose menu was dismissed asks for it again
        if (event.target === dismissed) {
          dismissed = undefined;
          offerFor(event.target);
        }
      },
      { capture: true },
    );
    ctx.addEventListener(
      document,
      "keydown",
      (event) => {
        if (event.key === "ArrowDown" && !menu.isOpen && event.target === dismissed) {
          event.preventDefault();
          dismissed = undefined;
          offerFor(event.target);
          return;
        }
        if (!menu.isOpen || event.target !== menu.anchor) return;
        if (event.key === "Escape") {
          dismissed = menu.anchor;
          menu.close();
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          menu.focusMenu();
        }
      },
      { capture: true },
    );
    // typing a password of one's own closes the suggestions
    ctx.addEventListener(
      document,
      "input",
      (event) => {
        if (!event.isTrusted || !menu.isOpen || event.target !== menu.anchor) return;
        if (fieldKind(event.target) !== "new-password") return;
        dismissed = menu.anchor;
        menu.close();
      },
      { capture: true },
    );
    ctx.addEventListener(window, "scroll", () => menu.position(), { capture: true, passive: true });
    ctx.addEventListener(window, "resize", () => menu.position());
    ctx.onInvalidated(() => menu.close());

    // Like Safari: a generated password is filled right away, and Apple Passwords is asked to save
    // it when its form is submitted (many sites submit with script, so a click on a submit button
    // counts too) or when the page is left with it still in the field.
    function generatedFormSubmitted(form: HTMLFormElement | null) {
      if (!generated?.field.isConnected || generated.field.form !== form) return;
      if (generated.field.value !== generated.value) return;
      void send({ type: "generated-password-submitted", username: usernameNear(generated.field) }).catch(() => {});
    }
    ctx.addEventListener(document, "submit", (event) => generatedFormSubmitted(event.target as HTMLFormElement), {
      capture: true,
    });
    ctx.addEventListener(
      document,
      "click",
      (event) => {
        const button = (event.target as Element | null)?.closest?.("button, input[type=submit]");
        if (button instanceof HTMLButtonElement && button.type !== "submit") return;
        if (button) generatedFormSubmitted((button as HTMLButtonElement | HTMLInputElement).form);
      },
      { capture: true },
    );
    ctx.addEventListener(window, "pagehide", () => {
      if (generated && !generated.saved) generatedFormSubmitted(generated.field.form);
    });

    // messages relayed by the background from our menu page; only our extension can send these
    browser.runtime.onMessage.addListener((message: ContentMessage, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id) return false;
      if (message.type === "generated-password-saved") {
        if (generated?.value === message.password) generated.saved = true;
        return false;
      }
      if (message.type === "menu-fill-new-password") {
        const field = newPasswordFields.get(message.nonce);
        newPasswordFields.delete(message.nonce);
        if (!field) {
          sendResponse({ result: "no-fields" });
          return false;
        }
        const result = fillNewPassword(message.origin, message.password, field);
        if (result === "filled") generated = { field, value: message.password, saved: false };
        if (menu.isCurrent(message.nonce)) {
          dismissed = field;
          menu.close();
        }
        sendResponse({ result });
        return false;
      }
      if (!menu.isCurrent(message.nonce)) return false;
      switch (message.type) {
        case "menu-resize":
          menu.resize(message.height);
          return false;
        case "menu-close": {
          const anchor = menu.anchor;
          dismissed = anchor;
          menu.close();
          anchor?.focus();
          return false;
        }
        case "menu-focus-field":
          menu.anchor?.focus();
          return false;
        case "menu-new-password-context": {
          const field = menu.anchor;
          if (!field || fieldKind(field) !== "new-password") {
            sendResponse(undefined);
            return false;
          }
          newPasswordFields.set(message.nonce, field);
          const context: NewPasswordContext = {
            rules: {
              ...(field.minLength > 0 ? { minLength: field.minLength } : {}),
              ...(field.maxLength > 0 ? { maxLength: field.maxLength } : {}),
              ...(field.getAttribute("passwordrules")
                ? { passwordRules: field.getAttribute("passwordrules") ?? "" }
                : {}),
            },
            username: usernameNear(field),
            visible: isMenuGenuinelyVisible(menu.element),
          };
          sendResponse(context);
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
          dismissed = anchor;
          menu.close();
          sendResponse({ result });
          return false;
        }
      }
    });

    offerFor(document.activeElement);
  },
});
