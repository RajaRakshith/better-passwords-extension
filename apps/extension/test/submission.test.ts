import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickedControl,
  formLooksValid,
  isGone,
  isUsernameInput,
  sendsForm,
  watchForSuccess,
} from "../src/autofill/submission.ts";

beforeEach(() => {
  // happy-dom has no layout; treat everything as visible unless marked hidden
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const hidden = this.closest("[data-hidden]");
    return { width: hidden ? 0 : 200, height: hidden ? 0 : 24 } as DOMRect;
  });
});

const $ = <T extends Element>(selector: string) => document.querySelector(selector) as T;

describe("sendsForm", () => {
  it("counts the form's submit buttons", () => {
    document.body.innerHTML = `<form><input id="p" type="password"><button id="b">Go</button>
      <input id="s" type="submit" value="Whatever"></form><form><button id="other">Sign up</button></form>`;
    const field = $<HTMLInputElement>("#p");
    expect(sendsForm(clickedControl($("#b")), field)).toBe(true);
    expect(sendsForm(clickedControl($("#s")), field)).toBe(true);
    // another form's button doesn't send this one
    expect(sendsForm(clickedControl($("#other")), field)).toBe(false);
  });

  it("counts script-driven buttons only by their label", () => {
    document.body.innerHTML = `<form><input id="p" type="password">
      <button id="eye" type="button" aria-label="Show password">👁</button>
      <button id="next" type="button"><span id="inner">Continue</span></button>
      <div id="div" role="button">Create account</div></form>`;
    const field = $<HTMLInputElement>("#p");
    expect(sendsForm(clickedControl($("#eye")), field)).toBe(false);
    expect(sendsForm(clickedControl($("#inner")), field)).toBe(true);
    expect(sendsForm(clickedControl($("#div")), field)).toBe(true);
  });

  it("accepts sign-up controls on pages without a form", () => {
    document.body.innerHTML = `<div><input id="p" type="password"><a id="go" href="#">Sign up</a>
      <a id="help" href="#">Help</a></div>`;
    const field = $<HTMLInputElement>("#p");
    expect(sendsForm(clickedControl($("#go")), field)).toBe(true);
    expect(sendsForm(clickedControl($("#help")), field)).toBe(false);
  });
});

describe("formLooksValid", () => {
  it("is false while the browser would block the submit", () => {
    document.body.innerHTML = `<form><input id="e" type="email" required><input id="p" type="password"></form>`;
    const field = $<HTMLInputElement>("#p");
    $<HTMLInputElement>("#e").value = "not-an-email";
    expect(formLooksValid(field)).toBe(false);
    $<HTMLInputElement>("#e").value = "jane@example.com";
    expect(formLooksValid(field)).toBe(true);
  });

  it("fires no invalid events the page could show errors for", () => {
    document.body.innerHTML = `<form><input id="e" required><input id="p" type="password"></form>`;
    const onInvalid = vi.fn();
    $("#e").addEventListener("invalid", onInvalid);
    formLooksValid($<HTMLInputElement>("#p"));
    expect(onInvalid).not.toHaveBeenCalled();
  });
});

describe("watchForSuccess", () => {
  it("reports when the field leaves the page", async () => {
    document.body.innerHTML = `<div id="dialog"><input id="p" type="password"></div>`;
    const onGone = vi.fn();
    watchForSuccess($<HTMLInputElement>("#p"), onGone, { intervalMs: 5 });
    $("#dialog").remove();
    await vi.waitFor(() => expect(onGone).toHaveBeenCalledOnce());
  });

  it("reports when the field is hidden", async () => {
    document.body.innerHTML = `<div id="step"><input id="p" type="password"></div>`;
    const onGone = vi.fn();
    watchForSuccess($<HTMLInputElement>("#p"), onGone, { intervalMs: 5 });
    $("#step").setAttribute("data-hidden", "");
    await vi.waitFor(() => expect(onGone).toHaveBeenCalledOnce());
  });

  it("gives up after the timeout", async () => {
    document.body.innerHTML = `<input id="p" type="password">`;
    const onGone = vi.fn();
    watchForSuccess($<HTMLInputElement>("#p"), onGone, { intervalMs: 5, timeoutMs: 20 });
    await new Promise((r) => setTimeout(r, 60));
    $("#p").remove();
    await new Promise((r) => setTimeout(r, 30));
    expect(onGone).not.toHaveBeenCalled();
    expect(isGone($<HTMLInputElement>("#p") ?? document.createElement("input"))).toBe(true);
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
