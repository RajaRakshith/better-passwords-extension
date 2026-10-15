import { beforeEach, describe, expect, it, vi } from "vitest";
import { fillCredentials, fillNewPassword, usernameNear } from "../src/fill.ts";

const origin = window.location.origin;

beforeEach(() => {
  // happy-dom has no layout; treat everything as visible unless marked hidden
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const hidden = this.hasAttribute("data-hidden");
    return { width: hidden ? 0 : 200, height: hidden ? 0 : 24 } as DOMRect;
  });
});

function page(html: string) {
  document.body.innerHTML = html;
}

const value = (selector: string) => (document.querySelector(selector) as HTMLInputElement).value;

describe("fillCredentials", () => {
  it("fills the username and password of a login form", () => {
    page(`<form>
      <input id="search" type="search">
      <input id="user" type="email">
      <input id="pass" type="password">
    </form>`);
    expect(fillCredentials(origin, "alice@example.com", "s3cret")).toBe("filled");
    expect(value("#user")).toBe("alice@example.com");
    expect(value("#pass")).toBe("s3cret");
    expect(value("#search")).toBe("");
  });

  it("refuses when the page is on another origin", () => {
    page(`<input id="pass" type="password">`);
    expect(fillCredentials("https://evil.example", "a", "b")).toBe("origin-mismatch");
    expect(value("#pass")).toBe("");
  });

  it("skips hidden decoy fields", () => {
    page(`<form>
      <input id="decoy" type="password" data-hidden>
      <input id="user" type="text" autocomplete="username">
      <input id="pass" type="password">
    </form>`);
    fillCredentials(origin, "bob", "pw");
    expect(value("#decoy")).toBe("");
    expect(value("#pass")).toBe("pw");
    expect(value("#user")).toBe("bob");
  });

  it("prefers the username field in the password's form", () => {
    page(`<input id="newsletter" type="email">
      <form><input id="user" type="text"><input id="pass" type="password"></form>`);
    fillCredentials(origin, "carol", "pw");
    expect(value("#user")).toBe("carol");
    expect(value("#newsletter")).toBe("");
  });

  it("fills only the username on a username-first step", () => {
    page(`<form><input id="user" type="email" autocomplete="username"></form>`);
    expect(fillCredentials(origin, "dave", "pw")).toBe("filled");
    expect(value("#user")).toBe("dave");
  });

  it("does not put a username into a one-time-code field", () => {
    page(`<form><input id="otp" type="text" autocomplete="one-time-code"></form>`);
    expect(fillCredentials(origin, "erin", "pw")).toBe("no-fields");
    expect(value("#otp")).toBe("");
  });

  it("fires input events so frameworks see the change", () => {
    page(`<form><input id="pass" type="password"></form>`);
    const seen: string[] = [];
    document.querySelector("#pass")?.addEventListener("input", (e) => seen.push((e.target as HTMLInputElement).value));
    fillCredentials(origin, "", "pw");
    expect(seen).toEqual(["pw"]);
  });

  it("fills around the field the menu was opened on", () => {
    page(`<form id="a"><input id="user-a" type="email"><input id="pass-a" type="password"></form>
      <form id="b"><input id="user-b" type="email"><input id="pass-b" type="password"></form>`);
    const anchor = document.querySelector("#user-b") as HTMLInputElement;
    expect(fillCredentials(origin, "frank", "pw", anchor)).toBe("filled");
    expect(value("#user-b")).toBe("frank");
    expect(value("#pass-b")).toBe("pw");
    expect(value("#user-a")).toBe("");
    expect(value("#pass-a")).toBe("");
  });
});

describe("fillNewPassword", () => {
  const input = (selector: string) => document.querySelector(selector) as HTMLInputElement;

  it("fills the password and its confirmation", () => {
    page(`<form><input id="email" type="email"><input id="p1" type="password"><input id="p2" type="password"></form>
          <form><input id="other" type="password" autocomplete="new-password"></form>`);
    expect(fillNewPassword(origin, "abc-DEF-123", input("#p1"))).toBe("filled");
    expect(value("#p1")).toBe("abc-DEF-123");
    expect(value("#p2")).toBe("abc-DEF-123");
    expect(value("#email")).toBe("");
    expect(value("#other")).toBe("");
  });

  it("never touches the current password on a change-password form", () => {
    page(
      `<form><input id="old" type="password"><input id="new" type="password"><input id="again" type="password"></form>`,
    );
    expect(fillNewPassword(origin, "x", input("#again"))).toBe("filled");
    expect(value("#old")).toBe("");
    expect(value("#new")).toBe("x");
    expect(value("#again")).toBe("x");
  });

  it("refuses another origin and login password fields", () => {
    page(`<form><input id="p" type="password" autocomplete="new-password"></form>`);
    expect(fillNewPassword("https://elsewhere.example", "x", input("#p"))).toBe("origin-mismatch");
    page(`<form><input id="p" type="password" autocomplete="current-password"></form>`);
    expect(fillNewPassword(origin, "x", input("#p"))).toBe("no-fields");
    expect(value("#p")).toBe("");
  });

  it("skips hidden confirmation fields", () => {
    page(`<form><input id="p1" type="password" autocomplete="new-password">
          <input id="trap" type="password" autocomplete="new-password" data-hidden></form>`);
    fillNewPassword(origin, "x", input("#p1"));
    expect(value("#trap")).toBe("");
  });
});

describe("usernameNear", () => {
  it("prefers the username, then the email, of the same form", () => {
    page(`<form><input name="first" value="Jane"><input type="email" value="jane@example.com">
          <input id="p" type="password"></form><form><input autocomplete="username" value="elsewhere"></form>`);
    expect(usernameNear(document.querySelector("#p") as HTMLInputElement)).toBe("jane@example.com");
    page(`<form><input type="email" value="jane@example.com"><input autocomplete="username" value="jane">
          <input id="p" type="password"></form>`);
    expect(usernameNear(document.querySelector("#p") as HTMLInputElement)).toBe("jane");
  });

  it("is empty when nothing is typed yet", () => {
    page(`<form><input type="email"><input id="p" type="password"></form>`);
    expect(usernameNear(document.querySelector("#p") as HTMLInputElement)).toBe("");
  });
});
