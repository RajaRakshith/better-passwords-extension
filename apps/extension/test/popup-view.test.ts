import { describe, expect, it } from "vitest";
import { PopupView } from "../src/ui/popup-view.ts";

describe("popup session expiry", () => {
  it("removes sensitive content and refuses late renders after the session ends", () => {
    const root = document.createElement("div");
    let closed = 0;
    const view = new PopupView(root, () => {
      closed++;
    });
    const secret = document.createElement("button");
    secret.textContent = "Copy recent password";
    view.show(secret);
    expect(root.textContent).toContain("recent password");
    view.endSession();
    view.show(secret);
    expect(root.childElementCount).toBe(0);
    expect(closed).toBe(1);
    view.endSession();
    expect(closed).toBe(1);
  });
});
