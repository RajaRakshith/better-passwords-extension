import { describe, expect, it } from "vitest";
import { isLoginField } from "../src/autofill/fields.ts";

function field(html: string, selector = "#f"): HTMLInputElement {
  document.body.innerHTML = html;
  return document.querySelector(selector) as HTMLInputElement;
}

describe("isLoginField", () => {
  it.each([
    ["password field", `<input id="f" type="password">`],
    ["current-password", `<input id="f" type="password" autocomplete="current-password">`],
    ["explicit username", `<input id="f" autocomplete="username">`],
    ["email next to a password", `<form><input id="f" type="email"><input type="password"></form>`],
    ["login-named text field", `<form><input id="f" name="login"><input type="password"></form>`],
    ["username-first step", `<form><input id="f" type="email" autocomplete="username webauthn"></form>`],
  ])("accepts a %s", (_, html) => {
    expect(isLoginField(field(html))).toBe(true);
  });

  it.each([
    ["sign-up password", `<input id="f" type="password" autocomplete="new-password">`],
    ["search box", `<form><input id="f" type="search"><input type="password"></form>`],
    ["newsletter email", `<form><input id="f" type="email"></form>`],
    ["one-time code", `<form><input id="f" autocomplete="one-time-code"><input type="password"></form>`],
    ["unrelated text field", `<form><input id="f" name="city"><input type="password"></form>`],
    ["disabled field", `<input id="f" type="password" disabled>`],
    ["checkbox", `<form><input id="f" type="checkbox" name="remember-login"><input type="password"></form>`],
  ])("ignores a %s", (_, html) => {
    expect(isLoginField(field(html))).toBe(false);
  });

  it("ignores things that are not inputs", () => {
    document.body.innerHTML = `<textarea id="t"></textarea>`;
    expect(isLoginField(document.querySelector("#t"))).toBe(false);
    expect(isLoginField(null)).toBe(false);
  });
});
