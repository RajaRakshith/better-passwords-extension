// Messages to the background worker, from our extension pages (popup, inline menu) and, for one
// read-only question, from the autofill content script. Web pages never talk to the background.

import type { FieldKind } from "./autofill/fields.ts";
import type { CompanionState } from "./companion.ts";
import type { FieldRules, PasswordStyle } from "./passwords/generate.ts";
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
  /** Two fresh strong passwords for the new-password field the menu was opened on. */
  | { type: "generate-passwords"; nonce: string }
  /** Fills the chosen password; Apple Passwords is asked to save it when the form is submitted. */
  | { type: "use-generated-password"; nonce: string; style: PasswordStyle }
  // Hide My Email, on sign-up email fields (the menu is bound to its tab)
  | { type: "email-suggestions"; nonce: string }
  /** The user clicked the hint: turn Hide My Email on. */
  | { type: "enable-hide-my-email"; nonce: string }
  | { type: "dismiss-hide-my-email-hint" }
  | { type: "generate-hide-my-email"; nonce: string }
  /** Fills an address in; a new (generated) one is reserved for the site first. */
  | { type: "use-hide-my-email"; nonce: string; address: string; reserve: boolean }
  | { type: "open-icloud" }
  /** Generated passwords for the tab's site whose update Apple Passwords couldn't confirm. */
  | { type: "unconfirmed-passwords"; tabId?: number }

  /** Opens Apple's Passwords app, searching for the tab's site when there is one. */
  | { type: "open-passwords-app"; tabId?: number }
  // content script → background (the only requests content scripts may send)
  | { type: "autofill-status"; kind: FieldKind }
  /** The username next to a password we generated (as it's typed). */
  | { type: "generated-username"; username: string }
  /** The field holding a password we generated went away (a dialog closed, a step moved on). */
  | { type: "generated-form-gone"; username: string };

/** Requests content scripts are allowed to send. */
export const CONTENT_SCRIPT_REQUESTS: ReadonlySet<Request["type"]> = new Set([
  "autofill-status",
  "generated-username",
  "generated-form-gone",
]);

export interface Settings {
  /** End the session when the Mac locks or sleeps. */
  lockOnScreenLock: boolean;
  /** Show the inline menu on login fields. */
  inlineMenu: boolean;
  /** Unlock with Touch ID through the companion app, when it is installed. */
  touchId: boolean;
  /** Suggest strong passwords on sign-up and change-password forms. */
  generatePasswords: boolean;
  /** Offer Hide My Email addresses on sign-up email fields (opt-in: uses icloud.com's web service). */
  hideMyEmail: boolean;
  /** Advertise Hide My Email in sign-up email fields until the user turns it on or dismisses it. */
  hideMyEmailHint: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  lockOnScreenLock: false,
  inlineMenu: true,
  touchId: true,
  generatePasswords: true,
  hideMyEmail: false,
  hideMyEmailHint: true,
};

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
  /**
   * "logins": saved logins exist for this site; "generate": suggest a new password;
   * "locked": pairing needed; "none": stay out of the way.
   */
  show: "logins" | "generate" | "email" | "locked" | "none";
}

export interface GeneratedPasswords {
  strong: string;
  alphanumeric: string;
}

/**
 * Hide My Email for a sign-up email field. "hint": not turned on yet, offer it; "ready": on, with
 * the address made for this site before, if any; "signed-out": no icloud.com sign-in in this browser.
 */
export type HideMyEmailState =
  | { state: "off" }
  | { state: "hint" }
  | { state: "signed-out" }
  | { state: "ready"; address?: string }
  | { state: "error"; message: string };

export interface EmailSuggestions {
  hideMyEmail: HideMyEmailState;
}

export type NewPasswordResult = "filled" | "menu-hidden" | "no-fields" | "origin-mismatch";

/** What each request answers with. Requests not listed answer with the session status. */
interface Responses {
  "get-status": Status;
  "list-logins": LoginsResult;
  fill: { result: string };
  "fill-from-menu": { result: string };
  "get-settings": Settings;
  "set-settings": Settings;
  "autofill-status": AutofillStatus;
  "generate-passwords": GeneratedPasswords;
  "use-generated-password": { result: NewPasswordResult };
  "unconfirmed-passwords": { username: string; password: string }[];
  "email-suggestions": EmailSuggestions;
  "enable-hide-my-email": EmailSuggestions;
  "dismiss-hide-my-email-hint": null;
  "generate-hide-my-email": { address: string };
  "use-hide-my-email": { result: string };
  "open-icloud": null;
  "menu-resize": null;
  "menu-close": null;
  "menu-focus-field": null;
  "open-passwords-app": null;
  "generated-username": null;
  "generated-form-gone": null;
}

export type Response<R extends Request> = R["type"] extends keyof Responses ? Responses[R["type"]] : Status;

/** Messages the background relays to the autofill content script. */
export type ContentMessage =
  | { type: "menu-fill"; nonce: string; origin: string; username: string; password: string }
  | { type: "menu-resize"; nonce: string; height: number }
  | { type: "menu-close"; nonce: string }
  /** Moves focus back to the field, keeping the menu open. */
  | { type: "menu-focus-field"; nonce: string }
  /** What the background needs before saving: the field's rules, the username, and whether the menu is visible. */
  | { type: "menu-new-password-context"; nonce: string }
  /** Fills a password that Apple Passwords has saved. */
  | { type: "menu-fill-new-password"; nonce: string; origin: string; password: string }
  /** Fills an email address into the field the menu was opened on. */
  | { type: "menu-fill-email"; nonce: string; origin: string; email: string }
  /** Apple Passwords has the generated password filled into this page. */
  | { type: "generated-password-saved"; password: string };

export interface NewPasswordContext {
  rules: FieldRules;
  username: string;
  visible: boolean;
}

/** Wire envelope, so errors cross the message boundary as data instead of being lost. */
export type Envelope<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

export async function send<R extends Request>(request: R): Promise<Response<R>> {
  const reply = (await browser.runtime.sendMessage(request)) as Envelope<Response<R>> | undefined;
  if (!reply) throw new Error("no reply from the background worker");
  if (!reply.ok) throw Object.assign(new Error(reply.error), { code: reply.code });
  return reply.value;
}
