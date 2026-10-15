// Deciding when a sign-up really went through, so Apple Passwords is asked to save a generated
// password then, and not when the browser or the page blocked the submit (Safari asks on submit).
//
// A save takes two steps: a submit attempt on a valid form (this file), then evidence it worked:
// the tab navigates or changes URL (watched by the background), or the password field goes away,
// e.g. a sign-up dialog closes or a multi-step form moves on (watchForSuccess).

/** Labels of controls that send a sign-up form, including script-driven ones. */
const SUBMIT_TEXT =
  /sign[\s_-]?up|regist|create|join|continue|next|submit|done|save|confirm|finish|get[\s_-]?started|let'?s go|start/i;

const BUTTON_LIKE = "button, input[type=submit], input[type=button], [role=button], a";

function labelOf(el: Element): string {
  const value = el instanceof HTMLInputElement ? el.value : "";
  return [el.textContent ?? "", value, el.getAttribute("aria-label") ?? "", el.getAttribute("title") ?? ""].join(" ");
}

/** The button-like element a click landed on, if any. */
export function clickedControl(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(BUTTON_LIKE) : null;
}

/** Whether clicking `control` sends the form that `field` belongs to. */
export function sendsForm(control: Element | null, field: HTMLInputElement): boolean {
  if (!control) return false;
  const form = field.form;
  // on pages without a <form>, any sign-up-looking control counts
  if (form) {
    const owner = control instanceof HTMLButtonElement || control instanceof HTMLInputElement ? control.form : null;
    if (owner !== form && !form.contains(control)) return false;
  }
  if (control instanceof HTMLButtonElement) {
    if (control.type === "submit" && form) return true;
    return SUBMIT_TEXT.test(labelOf(control));
  }
  if (control instanceof HTMLInputElement) {
    if (control.type === "submit") return true;
    return control.type === "button" && SUBMIT_TEXT.test(labelOf(control));
  }
  return SUBMIT_TEXT.test(labelOf(control));
}

/**
 * Whether the form passes its own constraints (required fields, email format…). Checked through
 * `validity`, which, unlike checkValidity(), fires no events the page could react to.
 */
export function formLooksValid(field: HTMLInputElement): boolean {
  const controls = field.form ? Array.from(field.form.elements) : [field];
  return controls.every(
    (el) =>
      !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) ||
      el.validity.valid,
  );
}

/** Whether the field is gone from the page or no longer shown. */
export function isGone(field: HTMLInputElement): boolean {
  if (!field.isConnected) return true;
  const rect = field.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true;
  return getComputedStyle(field).visibility === "hidden";
}

/** Calls `onGone` once if the field goes away within `timeoutMs`. Returns a function that stops watching. */
export function watchForSuccess(
  field: HTMLInputElement,
  onGone: () => void,
  { timeoutMs = 15_000, intervalMs = 300 }: { timeoutMs?: number; intervalMs?: number } = {},
): () => void {
  const started = Date.now();
  const timer = setInterval(() => {
    if (isGone(field)) {
      clearInterval(timer);
      onGone();
    } else if (Date.now() - started > timeoutMs) {
      clearInterval(timer);
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

/** Inputs whose value is a username or email, remembered for multi-step sign-ups. */
export function isUsernameInput(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement) || !["text", "email", "tel", ""].includes(el.type)) return false;
  const autocomplete = el.autocomplete.toLowerCase();
  if (/one-time-code|cc-|address|search/.test(autocomplete)) return false;
  return (
    el.type === "email" ||
    /\b(username|email)\b/.test(autocomplete) ||
    /user|login|e-?mail|account|identifier/i.test(`${el.name} ${el.id}`)
  );
}
