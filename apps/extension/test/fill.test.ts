import { beforeEach, describe, expect, it, vi } from "vitest";
import { fillCredentials } from "../src/fill.ts";

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
});
