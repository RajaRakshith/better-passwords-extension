// When a sign-up has moved on, so Apple Passwords is asked to save a generated password then.
//
// Like Safari, the cue is the page moving on with the password: its field goes away (a dialog
// closes, a multi-step form moves on; watchUntilGone) or the tab navigates (watched by the
// background). An invalid or rejected form keeps the field, so nothing is asked.

/** Whether the field is gone from the page or no longer shown. */
export function isGone(field: HTMLInputElement): boolean {
  if (!field.isConnected) return true;
  const rect = field.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true;
  return getComputedStyle(field).visibility === "hidden";
}

/** Calls `onGone` once when the field goes away. Returns a function that stops watching. */
export function watchUntilGone(field: HTMLInputElement, onGone: () => void, intervalMs = 300): () => void {
  const timer = setInterval(() => {
    if (!isGone(field)) return;
    clearInterval(timer);
    onGone();
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
