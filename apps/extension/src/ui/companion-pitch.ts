import { send } from "../messages.ts";
import { h } from "./h.ts";
import { CANCEL, icon } from "./icons.ts";

/**
 * Under the code box: the moment typing a code is a chore, mention that the companion app skips
 * it. Shown only without the app, and the ✕ hides it for good.
 */
export async function companionPitch(onGet: () => void): Promise<HTMLElement | null> {
  const [status, settings] = await Promise.all([
    send({ type: "get-status" }).catch(() => undefined),
    send({ type: "get-settings" }).catch(() => undefined),
  ]);
  if (status?.companion !== "not-installed" || !settings?.companionCodeHint) return null;

  const get = h("button", { class: "link", type: "button", textContent: "Get Companion App" });
  get.addEventListener("click", onGet);
  const dismiss = h("button", { class: "pitch-dismiss", type: "button", title: "Don't show again" }, icon(CANCEL));
  dismiss.setAttribute("aria-label", "Don't suggest the companion app again");
  const pitch = h("div", { class: "pitch" }, h("span", { textContent: "Skip this step next time" }), get, dismiss);
  dismiss.addEventListener("click", () => {
    pitch.remove();
    void send({ type: "set-settings", settings: { companionCodeHint: false } }).catch(() => {});
  });
  return pitch;
}
