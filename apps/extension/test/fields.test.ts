import { describe, expect, it } from "vitest";
import { fieldKind, isLoginField } from "../src/autofill/fields.ts";

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
    ["text field with the email keyboard", `<form><input id="f" inputmode="email"><input type="password"></form>`],
    ["field named by its label", `<form><label for="f">Login</label><input id="f"><input type="password"></form>`],
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

describe("fieldKind", () => {
  it.each([
    ["new-password", `<input id="f" type="password" autocomplete="new-password">`, "new-password"],
    [
      "password with confirmation",
      `<form><input type="email"><input id="f" type="password"><input type="password"></form>`,
      "new-password",
    ],
    [
      "confirmation field",
      `<form><input type="email"><input type="password"><input id="f" type="password"></form>`,
      "new-password",
    ],
    [
      "change password: new",
      `<form><input type="password"><input id="f" type="password"><input type="password"></form>`,
      "new-password",
    ],
    [
      "change password: current",
      `<form><input id="f" type="password"><input type="password"><input type="password"></form>`,
      "login",
    ],
    [
      "sign-up form by its button",
      `<form><input type="email"><input id="f" type="password"><button>Create account</button></form>`,
      "new-password",
    ],
    ["login form", `<form><input type="email"><input id="f" type="password"><button>Sign in</button></form>`, "login"],
    [
      "sign-up email",
      `<form><input id="f" type="email"><input type="password" autocomplete="new-password"></form>`,
      "signup-email",
    ],
    [
      "sign-up email marked as username",
      `<form><input id="f" type="email" autocomplete="username"><input type="password" autocomplete="new-password"></form>`,
      "signup-email",
    ],
    [
      "email on a register form without a password yet",
      `<form id="register"><input id="f" type="email" name="email"><button>Continue</button></form>`,
      "signup-email",
    ],
    ["login email", `<form><input id="f" type="email"><input type="password"><button>Log in</button></form>`, "login"],
    [
      "sign-up email with the email keyboard",
      `<form><input id="f" type="text" inputmode="email"><input type="password" autocomplete="new-password"></form>`,
      "signup-email",
    ],
    [
      // no form, no name, a generated id: only the label says what it is (a Salesforce sign-up)
      "sign-up email named by its label",
      `<div><label for="f">*E-Mail-Adresse (Login)</label><input id="f" type="text"></div>
       <input type="password"><input type="password"><button>REGISTRIEREN</button>`,
      "signup-email",
    ],
  ])("classifies a %s", (_, html, kind) => {
    expect(fieldKind(field(html))).toBe(kind);
  });

  it.each([
    [
      "chosen username on a sign-up form",
      `<form><input id="f" name="username"><input type="password" autocomplete="new-password"></form>`,
    ],
    ["newsletter email", `<form><input id="f" type="email"><button>Subscribe</button></form>`],
    ["search box", `<input id="f" type="search">`],
  ])("ignores a %s", (_, html) => {
    expect(fieldKind(field(html))).toBeUndefined();
  });
});
