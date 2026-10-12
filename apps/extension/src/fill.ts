// Runs inside the page: injected by scripting.executeScript (popup) or called by the autofill content
// script (inline menu). It must not reference anything outside its own body. It refuses to fill if
// the page navigated to another origin since the user chose the login, and only touches visible fields.

export type FillResult = "filled" | "origin-mismatch" | "no-fields";

export function fillCredentials(
  expectedOrigin: string,
  username: string,
  password: string,
  /** The field the inline menu was opened on; otherwise the focused field is used. */
  anchor?: HTMLInputElement,
): FillResult {
  if (window.location.origin !== expectedOrigin) return "origin-mismatch";

  const isVisible = (el: HTMLInputElement) => {
    if (el.disabled || el.readOnly || el.type === "hidden") return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = window.getComputedStyle(el);
    const opacity = Number.parseFloat(style.opacity);
    return style.visibility !== "hidden" && style.display !== "none" && !(opacity <= 0.05);
  };

  const setValue = (el: HTMLInputElement, value: string) => {
    // the native setter keeps frameworks such as React in sync with the DOM value
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const inputs = Array.from(document.querySelectorAll("input")).filter(isVisible);
  const isUsernameField = (el: HTMLInputElement) =>
    ["text", "email", "tel", ""].includes(el.type) &&
    !/one-time-code|new-password|current-password/.test(el.autocomplete);

  const active = anchor ?? (document.activeElement instanceof HTMLInputElement ? document.activeElement : undefined);
  // a field inside a form only pairs with fields of that same form
  const activeForm = active?.form;
  const passwordField =
    (active?.type === "password" && isVisible(active) ? active : undefined) ??
    inputs.find((el) => el.type === "password" && (!activeForm || el.form === activeForm));

  // the username field belongs to the same form as the password field, before it
  const scope = passwordField?.form ?? active?.form ?? document;
  const candidates = inputs.filter((el) => scope.contains(el) && isUsernameField(el));
  const before = passwordField
    ? candidates.filter((el) => el.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING)
    : candidates;
  const usernameField =
    (active && isUsernameField(active) && isVisible(active) ? active : undefined) ??
    before.find((el) => el.autocomplete === "username") ??
    before.at(-1) ??
    candidates[0];

  if (!passwordField && !usernameField) return "no-fields";
  if (usernameField && username) setValue(usernameField, username);
  if (passwordField) setValue(passwordField, password);
  (passwordField ?? usernameField)?.focus();
  return "filled";
}
