import { describe, expect, it } from "vitest";
import { waitForLogin } from "../src/passwords/wait-for-login.ts";

describe("waitForLogin", () => {
  it("resolves once the login appears", async () => {
    let calls = 0;
    const lookup = async () => (++calls >= 3 ? ["jane"] : []);
    expect(await waitForLogin(lookup, "jane", { intervalMs: 1 })).toBe(true);
    expect(calls).toBe(3);
  });

  it("retries lookups that fail", async () => {
    let calls = 0;
    const lookup = async () => {
      if (++calls === 1) throw new Error("the helper did not answer in time");
      return ["jane"];
    };
    expect(await waitForLogin(lookup, "jane", { intervalMs: 1 })).toBe(true);
  });

  it("gives up after the timeout", async () => {
    expect(await waitForLogin(async () => ["someone else"], "jane", { intervalMs: 5, timeoutMs: 30 })).toBe(false);
  });

  it("stops when cancelled", async () => {
    const abort = new AbortController();
    const waiting = waitForLogin(async () => [], "jane", { intervalMs: 10_000, signal: abort.signal });
    abort.abort();
    expect(await waiting).toBe(false);
  });
});
