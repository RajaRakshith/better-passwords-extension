import { beforeEach, describe, expect, it, vi } from "vitest";
import { isGone, isUsernameInput, watchUntilGone } from "../src/autofill/submission.ts";

beforeEach(() => {
  // happy-dom has no layout; treat everything as visible unless marked hidden
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const hidden = this.closest("[data-hidden]");
    return { width: hidden ? 0 : 200, height: hidden ? 0 : 24 } as DOMRect;
  });
});

const $ = <T extends Element>(selector: string) => document.querySelector(selector) as T;

describe("watchUntilGone", () => {
  it("reports when the field leaves the page", async () => {
    document.body.innerHTML = `<div id="dialog"><input id="p" type="password"></div>`;
    const onGone = vi.fn();
    watchUntilGone($<HTMLInputElement>("#p"), onGone, 5);
    $("#dialog").remove();
    await vi.waitFor(() => expect(onGone).toHaveBeenCalledOnce());
  });

  it("reports when the field is hidden", async () => {
    document.body.innerHTML = `<div id="step"><input id="p" type="password"></div>`;
    const onGone = vi.fn();
    watchUntilGone($<HTMLInputElement>("#p"), onGone, 5);
    $("#step").setAttribute("data-hidden", "");
    await vi.waitFor(() => expect(onGone).toHaveBeenCalledOnce());
  });

  it("stays quiet while the field is shown, and can be stopped", async () => {
    document.body.innerHTML = `<input id="p" type="password">`;
    const field = $<HTMLInputElement>("#p");
    const onGone = vi.fn();
    const stop = watchUntilGone(field, onGone, 5);
    await new Promise((r) => setTimeout(r, 30));
    expect(onGone).not.toHaveBeenCalled();
    stop();
    field.remove();
    await new Promise((r) => setTimeout(r, 30));
    expect(onGone).not.toHaveBeenCalled();
    expect(isGone(field)).toBe(true);
  });
});

describe("isUsernameInput", () => {
  it.each([
    [`<input id="f" type="email">`, true],
    [`<input id="f" autocomplete="username">`, true],
    [`<input id="f" name="user_login">`, true],
    [`<input id="f" name="first_name">`, false],
    [`<input id="f" type="search" name="email">`, false],
  ])("%s → %s", (html, expected) => {
    document.body.innerHTML = html;
    expect(isUsernameInput($("#f"))).toBe(expected);
  });
});
