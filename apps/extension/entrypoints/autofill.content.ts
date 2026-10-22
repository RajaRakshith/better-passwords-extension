import { type FieldKind, fieldKind } from "@/src/autofill/fields.ts";
import { MenuHost } from "@/src/autofill/menu-host.ts";
import { isGone, isUsernameInput, watchUntilGone } from "@/src/autofill/submission.ts";
import { FILL_MATCHES } from "@/src/config.ts";
import { fillCredentials, fillEmail, fillNewPassword, usernameNear } from "@/src/fill.ts";
import { type ContentMessage, type MenuMessage, type NewPasswordContext, send } from "@/src/messages.ts";

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
    // the last generated password we filled: to recognise it, and to save it once the form is sent
    let generated: { field: HTMLInputElement; value: string; saved: boolean; username: string } | undefined;

    async function offer(field: HTMLInputElement, kind: FieldKind) {
      if (menu.anchor === field || dismissed === field) return;
      const ticket = ++request;
      const { show, nonce } = await send({ type: "autofill-status", kind }).catch(() => ({
        show: "none" as const,
        nonce: undefined,
      }));
      // the user may have moved on while we asked
      if (ticket !== request || document.activeElement !== field) return;
      if (nonce === undefined) {
        menu.close();
      } else if (kind === "new-password" && field.value !== "") {
        // our own password: say it's saved; one the user typed: stay out of the way
        if (show !== "none" && generated?.field.form === field.form && field.value === generated.value) {
          menu.open(field, generated.saved ? "generated" : "generated-unsaved", kind, nonce);
        } else {
          menu.close();
        }
      } else if (show === "email" && kind === "signup-email") {
        menu.open(field, "email", kind, nonce);
      } else if (show === "logins" || show === "generate" || show === "locked" || show === "setup") {
        // "locked" and "setup" too: login fields include guessed usernames, but only next to a
        // password field, and the email field is usually the first one people click
        menu.open(field, show, kind, nonce);
      } else {
        menu.close();
      }
    }

    /** Tells the open menu what's typed in its username field, so it lists only the logins that match. */
    function filterMenu(query: string) {
      const nonce = menu.nonce;
      if (!nonce) return;
      const message: MenuMessage = { type: "menu-filter", nonce, query };
      void browser.runtime.sendMessage(message).catch(() => {});
    }

    /** Offers a menu for `target` if it gets one; returns whether it does. */
    function offerFor(target: EventTarget | null): boolean {
      const kind = fieldKind(target);
      if (!kind) return false;
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
        // clicking the field while nothing typed matches brings every login back
        if (menu.isOpen && !menu.isShowing && event.target === menu.anchor) filterMenu("");
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
          if (!menu.isShowing) filterMenu("");
          menu.focusMenu();
        }
      },
      { capture: true },
    );
    // typing a username narrows the logins down; typing a password of one's own closes the suggestions
    ctx.addEventListener(
      document,
      "input",
      (event) => {
        // only the user's own typing: text the page sets itself must not probe which logins match
        if (!event.isTrusted || !menu.isOpen || event.target !== menu.anchor) return;
        const kind = fieldKind(event.target);
        if (kind === "login" && menu.anchor.type !== "password") filterMenu(menu.anchor.value);
        if (kind !== "new-password") return;
        dismissed = menu.anchor;
        menu.close();
      },
      { capture: true },
    );
    ctx.addEventListener(window, "scroll", () => menu.position(), { capture: true, passive: true });
    ctx.addEventListener(window, "resize", () => menu.position());
    ctx.onInvalidated(() => menu.close());

    // Like Safari: a generated password is filled right away, and Apple Passwords is asked to save
    // it once the page moves on with it: the password field goes away (a dialog closes, a step
    // moves on) or the tab navigates (watched by the background). An invalid or rejected form
    // keeps the field, so it isn't asked. Asking once too often beats missing a save: macOS's
    // prompt has Not Now.
    let lastUsername = "";
    let stopWatching = () => {};

    /** The username to save with: the form's, or the last one typed on the page (multi-step sign-ups). */
    function trackUsername() {
      if (!generated || isGone(generated.field)) return;
      const username = usernameNear(generated.field) || lastUsername;
      if (username === generated.username) return;
      generated.username = username;
      void send({ type: "generated-username", username }).catch(() => {});
    }
    ctx.addEventListener(
      document,
      "change",
      (event) => {
        if (isUsernameInput(event.target) && event.target.value.trim()) lastUsername = event.target.value.trim();
        trackUsername();
      },
      { capture: true },
    );

    function watchGenerated(field: HTMLInputElement) {
      stopWatching();
      stopWatching = watchUntilGone(field, () => {
        if (generated?.field !== field || field.value !== generated.value) return;
        void send({ type: "generated-form-gone", username: generated.username }).catch(() => {});
      });
    }

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
        if (result === "filled") {
          generated = { field, value: message.password, saved: false, username: "" };
          trackUsername();
          watchGenerated(field);
        }
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
            visible: menu.isTrustworthy(),
          };
          sendResponse(context);
          return false;
        }
        case "menu-fill-email": {
          const anchor = menu.anchor;
          if (!anchor || !menu.isTrustworthy()) {
            sendResponse({ result: "menu-hidden" });
            menu.close();
            return false;
          }
          const result = fillEmail(message.origin, message.email, anchor);
          dismissed = anchor;
          menu.close();
          sendResponse({ result });
          return false;
        }
        case "menu-fill": {
          const anchor = menu.anchor;
          if (!anchor || !menu.isTrustworthy()) {
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
