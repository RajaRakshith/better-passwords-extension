import { describe, expect, it } from "vitest";
import { Companion, CompanionError } from "../src/companion.ts";
import { COMPANION_HOST } from "../src/config.ts";

function fakeHost(reply: (message: { type: string }) => unknown) {
  const calls: { host: string; message: { type: string } }[] = [];
  const send = async (host: string, message: unknown) => {
    calls.push({ host, message: message as { type: string } });
    const value = reply(message as { type: string });
    if (value instanceof Error) throw value;
    return value;
  };
  return { calls, send };
}

describe("Companion", () => {
  it("is ready when the host answers and Accessibility is allowed", async () => {
    const host = fakeHost(() => ({ ok: true, version: 1, accessibility: true }));
    expect(await new Companion(host.send).state()).toBe("ready");
    expect(host.calls).toEqual([{ host: COMPANION_HOST, message: { type: "hello" } }]);
  });

  it("needs setup while Accessibility is off or the agent is off", async () => {
    expect(await new Companion(fakeHost(() => ({ ok: true, accessibility: false })).send).state()).toBe("needs-setup");
    expect(await new Companion(fakeHost(() => ({ ok: false, error: "agent-unavailable" })).send).state()).toBe(
      "needs-setup",
    );
  });

  it("is not installed when the browser can't find the host", async () => {
    const host = fakeHost(() => new Error("Specified native messaging host not found."));
    expect(await new Companion(host.send).state()).toBe("not-installed");
  });

  it("caches the state briefly", async () => {
    let now = 0;
    const host = fakeHost(() => ({ ok: true, accessibility: true }));
    const companion = new Companion(host.send, () => now);
    await companion.state();
    now = 10_000;
    await companion.state();
    expect(host.calls).toHaveLength(1);
    now = 40_000;
    await companion.state();
    expect(host.calls).toHaveLength(2);
  });

  it("returns the code read after Touch ID", async () => {
    const host = fakeHost(() => ({ ok: true, code: "123456" }));
    expect(await new Companion(host.send).readCode()).toBe("123456");
    expect(host.calls[0]?.message).toEqual({ type: "read-code" });
  });

  it("refuses anything that isn't six digits", async () => {
    const host = fakeHost(() => ({ ok: true, code: "12345x" }));
    await expect(new Companion(host.send).readCode()).rejects.toBeInstanceOf(CompanionError);
  });

  it("passes on the companion's error", async () => {
    const host = fakeHost(() => ({ ok: false, error: "cancelled", message: "Touch ID was cancelled." }));
    await expect(new Companion(host.send).readCode()).rejects.toMatchObject({
      code: "cancelled",
      message: "Touch ID was cancelled.",
    });
  });

  it("reads the emails on the contact card, and remembers them", async () => {
    let now = 0;
    const host = fakeHost(() => ({ ok: true, version: 2, emails: ["jane@example.com", "not-an-email"] }));
    const companion = new Companion(host.send, () => now);
    expect(await companion.myEmails()).toEqual(["jane@example.com"]);
    now = 5 * 60_000;
    await companion.myEmails();
    expect(host.calls).toHaveLength(1);
  });

  it("says when Contacts isn't allowed, or the app is too old", async () => {
    const denied = fakeHost(() => ({ ok: false, version: 2, error: "needs-contacts", message: "Allow Contacts." }));
    await expect(new Companion(denied.send).myEmails()).rejects.toMatchObject({ code: "needs-contacts" });
    const old = fakeHost(() => ({ ok: false, version: 1, message: "unknown request" }));
    await expect(new Companion(old.send).myEmails()).rejects.toMatchObject({ code: "outdated" });
  });
});
