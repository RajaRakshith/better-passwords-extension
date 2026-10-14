// Messages to the background worker, from our extension pages (popup, inline menu) and, for one
// read-only question, from the autofill content script. Web pages never talk to the background.

import type { CompanionState } from "./companion.ts";
import type { SessionStatus } from "./session/session.ts";

export type Request =
  | { type: "get-status" }
  | { type: "request-code"; fresh?: boolean }
  | { type: "verify-code"; code: string }
  /** Shows a code on the Mac, then lets the companion app enter it after Touch ID. */
  | { type: "unlock-with-touch-id" }
  /** `tabId` is required from the popup; the inline menu is always bound to its own tab. */
  | { type: "list-logins"; tabId?: number }
  | { type: "fill"; tabId: number; username: string }
  | { type: "lock" }
  | { type: "get-settings" }
  | { type: "set-settings"; settings: Partial<Settings> }
  // inline menu → background → content script of the same tab
  | { type: "fill-from-menu"; nonce: string; username: string }
  | { type: "menu-resize"; nonce: string; height: number }
  | { type: "menu-close"; nonce: string }
  | { type: "menu-focus-field"; nonce: string }
  /** Opens Apple's Passwords app, searching for the tab's site when there is one. */
  | { type: "open-passwords-app"; tabId?: number }
  // content script → background (the only request content scripts may send)
  | { type: "autofill-status" };

/** Requests content scripts are allowed to send. */
export const CONTENT_SCRIPT_REQUESTS: ReadonlySet<Request["type"]> = new Set(["autofill-status"]);

export interface Settings {
  /** End the session when the Mac locks or sleeps. */
  lockOnScreenLock: boolean;
  /** Show the inline menu on login fields. */
  inlineMenu: boolean;
  /** Unlock with Touch ID through the companion app, when it is installed. */
  touchId: boolean;
}

export const DEFAULT_SETTINGS: Settings = { lockOnScreenLock: false, inlineMenu: true, touchId: true };

export interface Status extends SessionStatus {
  variant: "store" | "github";
  /** The companion app, checked only while locked (unlocked sessions don't need it). */
  companion?: CompanionState;
  /** True when the user wants Touch ID and the companion is ready for it. */
  touchId?: boolean;
}

export interface LoginsResult {
  /** Undefined when the tab is not a page we fill (e.g. chrome:// or plain http). */
  hostname?: string;
  logins: { username: string }[];
}

export interface AutofillStatus {
  /** "logins": saved logins exist for this site; "locked": pairing needed; "none": stay out of the way. */
  show: "logins" | "locked" | "none";
}

export type Response<R extends Request> = R extends { type: "get-status" }
  ? Status
  : R extends { type: "list-logins" }
    ? LoginsResult
    : R extends { type: "fill" | "fill-from-menu" }
      ? { result: string }
      : R extends { type: "get-settings" | "set-settings" }
        ? Settings
        : R extends { type: "autofill-status" }
          ? AutofillStatus
          : R extends { type: "menu-resize" | "menu-close" | "menu-focus-field" | "open-passwords-app" }
            ? null
            : Status;

/** Messages the background relays to the autofill content script. */
export type ContentMessage =
  | { type: "menu-fill"; nonce: string; origin: string; username: string; password: string }
  | { type: "menu-resize"; nonce: string; height: number }
  | { type: "menu-close"; nonce: string }
  /** Moves focus back to the field, keeping the menu open. */
  | { type: "menu-focus-field"; nonce: string };

/** Wire envelope, so errors cross the message boundary as data instead of being lost. */
export type Envelope<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

export async function send<R extends Request>(request: R): Promise<Response<R>> {
  const reply = (await browser.runtime.sendMessage(request)) as Envelope<Response<R>> | undefined;
  if (!reply) throw new Error("no reply from the background worker");
  if (!reply.ok) throw Object.assign(new Error(reply.error), { code: reply.code });
  return reply.value;
}
