// Decides which inputs get the inline menu, and which kind. Conservative on purpose: a menu on a
// search box or a newsletter field is noise, and suggesting saved logins on a sign-up form, or a
// new password on a login form, would be wrong.

/** "login": fill a saved login. "new-password": suggest a strong password. "signup-email": suggest an email. */
export type FieldKind = "login" | "new-password" | "signup-email";

const USERNAME_HINT = /user|login|e-?mail|account|identifier|signin/i;
const EMAIL_HINT = /e-?mail/i;
const SIGNUP_HINT = /sign[\s_-]?up|regist|create[\s_-]?(an[\s_-]?)?account|join|enrol/i;
const LOGIN_HINT = /sign[\s_-]?in|log[\s_-]?in/i;

function textOf(el: HTMLInputElement): string {
  // the label too: some fields say what they are nowhere else (no name, a generated id)
  const labels = Array.from(el.labels ?? [], (label) => label.textContent ?? "");
  return [el.name, el.id, el.getAttribute("aria-label") ?? "", el.placeholder, ...labels].join(" ");
}

/** Typed as an email, or asking for the email keyboard (a text field that takes an email). */
function asksForEmail(el: HTMLInputElement): boolean {
  return el.type === "email" || el.getAttribute("inputmode")?.toLowerCase() === "email";
}

function isTextLike(el: HTMLInputElement): boolean {
  return ["text", "email", "tel", ""].includes(el.type);
}

function tokens(el: HTMLInputElement): string[] {
  return el.autocomplete.toLowerCase().split(/\s+/);
}

function passwordFields(scope: ParentNode): HTMLInputElement[] {
  return Array.from(scope.querySelectorAll("input")).filter((input) => input.type === "password");
}

/** A form that creates an account, judged by its own attributes and its submit buttons. */
function looksLikeSignup(form: HTMLFormElement | null): boolean {
  if (!form) return false;
  const own = [form.id, form.name, form.getAttribute("action") ?? "", form.className].join(" ");
  const buttons = Array.from(form.querySelectorAll<HTMLElement>("button, input[type=submit]"))
    .map((b) => (b instanceof HTMLInputElement ? b.value : (b.textContent ?? "")))
    .join(" ");
  const text = `${own} ${buttons}`;
  return SIGNUP_HINT.test(text) && !LOGIN_HINT.test(buttons);
}

/** A password field that should get a new password: sign-up, confirmation or change-password. */
export function isNewPasswordField(el: HTMLInputElement): boolean {
  if (el.type !== "password") return false;
  const autocomplete = tokens(el);
  if (autocomplete.includes("new-password")) return true;
  if (autocomplete.includes("current-password")) return false;
  const scope = el.form ?? el.ownerDocument;
  const all = passwordFields(scope);
  const marked = all.some((input) => tokens(input).includes("current-password"));
  // two password fields: password and confirmation; three: current, new and confirmation
  if (all.length === 2 && !marked) return true;
  if (all.length >= 3) return all.indexOf(el) > 0;
  return looksLikeSignup(el.form);
}

export function isPasswordField(el: HTMLInputElement): boolean {
  return el.type === "password" && !isNewPasswordField(el);
}

function inSignupForm(el: HTMLInputElement): boolean {
  const scope = el.form ?? el.ownerDocument;
  return passwordFields(scope).some(isNewPasswordField) || looksLikeSignup(el.form);
}

function hasPasswordFieldNearby(el: HTMLInputElement): boolean {
  const scope = el.form ?? el.ownerDocument;
  return passwordFields(scope).some((input) => isPasswordField(input));
}

function isEmailLike(el: HTMLInputElement): boolean {
  const autocomplete = tokens(el);
  return asksForEmail(el) || autocomplete.includes("email") || EMAIL_HINT.test(textOf(el));
}

/** A username field: explicitly marked, or username-like and next to a password field. */
export function isUsernameField(el: HTMLInputElement): boolean {
  if (!isTextLike(el)) return false;
  const autocomplete = el.autocomplete.toLowerCase();
  if (/one-time-code|new-password|cc-|address|search/.test(autocomplete)) return false;
  if (tokens(el).includes("username")) return true;
  if (!hasPasswordFieldNearby(el)) return false;
  return autocomplete.includes("email") || asksForEmail(el) || USERNAME_HINT.test(textOf(el));
}

export function fieldKind(target: EventTarget | null): FieldKind | undefined {
  if (!(target instanceof HTMLInputElement) || target.disabled || target.readOnly) return undefined;
  if (target.type === "password") return isNewPasswordField(target) ? "new-password" : "login";
  if (!isTextLike(target)) return undefined;
  if (/one-time-code|cc-|address|search/.test(target.autocomplete.toLowerCase())) return undefined;
  // on a sign-up form, the email field gets email suggestions instead of saved logins
  if (inSignupForm(target)) return isEmailLike(target) ? "signup-email" : undefined;
  return isUsernameField(target) ? "login" : undefined;
}

export function isLoginField(target: EventTarget | null): target is HTMLInputElement {
  return fieldKind(target) === "login";
}
