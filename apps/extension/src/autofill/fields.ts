// Decides which inputs get the inline menu. Conservative on purpose: a menu on a search box or
// a newsletter field is noise, and a menu on a sign-up form would suggest the wrong thing.

const USERNAME_HINT = /user|login|e-?mail|account|identifier|signin/i;

function textOf(el: HTMLInputElement): string {
  return [el.name, el.id, el.getAttribute("aria-label") ?? "", el.placeholder].join(" ");
}

function isTextLike(el: HTMLInputElement): boolean {
  return ["text", "email", "tel", ""].includes(el.type);
}

export function isPasswordField(el: HTMLInputElement): boolean {
  return el.type === "password" && el.autocomplete !== "new-password";
}

function hasPasswordFieldNearby(el: HTMLInputElement): boolean {
  const scope = el.form ?? el.ownerDocument;
  return Array.from(scope.querySelectorAll("input")).some((input) => isPasswordField(input));
}

/** A username field: explicitly marked, or username-like and next to a password field. */
export function isUsernameField(el: HTMLInputElement): boolean {
  if (!isTextLike(el)) return false;
  const autocomplete = el.autocomplete.toLowerCase();
  if (/one-time-code|new-password|cc-|address|search/.test(autocomplete)) return false;
  if (autocomplete.split(/\s+/).includes("username")) return true;
  if (!hasPasswordFieldNearby(el)) return false;
  return autocomplete.includes("email") || el.type === "email" || USERNAME_HINT.test(textOf(el));
}

export function isLoginField(target: EventTarget | null): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement) || target.disabled || target.readOnly) return false;
  return isPasswordField(target) || isUsernameField(target);
}
