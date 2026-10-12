import { describe, expect, it } from "vitest";
import { fillableUrl } from "../src/url-policy.ts";

describe("fillableUrl", () => {
  it.each([
    "https://example.com/login",
    "https://accounts.example.co.uk:8443/",
    "http://localhost:3000/",
    "http://127.0.0.1/",
  ])("allows %s", (url) => {
    expect(fillableUrl(url)?.href).toBe(new URL(url).href);
  });

  it.each([
    undefined,
    "",
    "not a url",
    "http://example.com/",
    "chrome://settings/",
    "chrome-extension://abc/popup.html",
    "file:///Users/me/login.html",
    "data:text/html,<input type=password>",
    "javascript:alert(1)",
  ])("refuses %s", (url) => {
    expect(fillableUrl(url)).toBeUndefined();
  });
});
