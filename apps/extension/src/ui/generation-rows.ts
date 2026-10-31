import type { GeneratedPasswords } from "../messages.ts";
import type { PasswordStyle } from "../passwords/generate.ts";
import { h } from "./h.ts";
import { EYE, icon, KEY } from "./icons.ts";

/** Actual inline-menu rows: only successful candidates are selectable. */
export function generationRows(
  passwords: GeneratedPasswords,
  choose: (style: PasswordStyle) => void,
  deliberate: (event: Event) => boolean,
): HTMLElement[] {
  const rows: HTMLElement[] = [];
  for (const [style, title] of [
    ["strong", "Strong Password"],
    ["alphanumeric", "Without Special Characters"],
  ] as const) {
    const password = passwords[style];
    if (typeof password !== "string" || !password) continue;
    const masked = [...password].map((c, i) => (i < 3 || c === "-" ? c : "•")).join("");
    const detail = h("span", { class: "detail password", textContent: masked });
    const eye = h("span", { class: "reveal", title: "Show password" }, icon(EYE));
    eye.addEventListener("pointermove", () => {
      detail.textContent = password;
    });
    eye.addEventListener("pointerleave", () => {
      detail.textContent = masked;
    });
    const row = h(
      "button",
      { type: "button", class: "row", attrs: { role: "option" } },
      icon(KEY),
      h("span", { class: "text" }, h("span", { class: "title", textContent: title }), detail),
      eye,
    );
    row.addEventListener("click", (event) => {
      if (deliberate(event)) choose(style);
    });
    rows.push(row);
  }
  for (const error of new Set(Object.values(passwords.errors ?? {}))) {
    if (error) rows.push(h("div", { class: "message error", textContent: error }));
  }
  return rows;
}
