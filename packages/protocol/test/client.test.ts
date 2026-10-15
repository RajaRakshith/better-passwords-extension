import { FakeHelper, MemoryTransport } from "@app/fake-helper";
import { describe, expect, it, vi } from "vitest";
import { ApplePasswordsClient, Command, ProtocolError } from "../src/index.ts";

const vault = [
  { hostname: "example.com", username: "alice@example.com", password: "correct horse" },
  { hostname: "example.com", username: "bob", password: "battery staple" },
  { hostname: "other.test", username: "carol", password: "hunter2" },
];
const tab = { tabId: 1 };

async function setup(options: { base64?: boolean; now?: () => number } = {}) {
  const helper = new FakeHelper({ vault, ...(options.base64 === undefined ? {} : { base64: options.base64 }) });
  const transport = new MemoryTransport(helper);
  const client = await ApplePasswordsClient.connect(transport, options.now ? { now: options.now } : {});
  return { helper, transport, client };
}

async function pair(helper: FakeHelper, client: ApplePasswordsClient) {
  await client.requestChallenge();
  await client.verifyCode(helper.currentCode ?? "");
}

describe("ApplePasswordsClient", () => {
  it("pairs with the shown code and reads logins and passwords", async () => {
    const { helper, client } = await setup();
    expect(client.state).toBe("locked");

    await client.requestChallenge();
    expect(client.state).toBe("awaiting-code");
    expect(client.hasLiveChallenge).toBe(true);

    await client.verifyCode(helper.currentCode ?? "");
    expect(client.state).toBe("unlocked");

    const logins = await client.getLogins("example.com", tab);
    expect(logins.map((l) => l.username)).toEqual(["alice@example.com", "bob"]);
    expect(await client.getPassword("example.com", "bob", tab)).toEqual({
      username: "bob",
      password: "battery staple",
    });
  });

  it("returns nothing for unknown sites and users", async () => {
    const { helper, client } = await setup();
    await pair(helper, client);
    expect(await client.getLogins("nowhere.test", tab)).toEqual([]);
    expect(await client.getPassword("example.com", "mallory", tab)).toBeUndefined();
  });

  it("works with the older hex encoding", async () => {
    const { helper, client } = await setup({ base64: false });
    await pair(helper, client);
    expect(await client.getLogins("other.test", tab)).toHaveLength(1);
  });

  it("rejects a wrong code and burns the challenge", async () => {
    const { helper, client } = await setup();
    await client.requestChallenge();
    const wrong = helper.currentCode === "000000" ? "111111" : "000000";

    await expect(client.verifyCode(wrong)).rejects.toMatchObject({ code: "incorrect-code" });
    expect(client.state).toBe("locked");
    await expect(client.verifyCode(wrong)).rejects.toMatchObject({ code: "challenge-expired" });
  });

  it("refuses a code after the challenge expired", async () => {
    let now = 0;
    const { helper, client } = await setup({ now: () => now });
    await client.requestChallenge();
    now += 3 * 60_000;
    await expect(client.verifyCode(helper.currentCode ?? "")).rejects.toMatchObject({
      code: "challenge-expired",
    });
  });

  it("refuses queries before pairing", async () => {
    const { client } = await setup();
    await expect(client.getLogins("example.com", tab)).rejects.toBeInstanceOf(ProtocolError);
  });

  it("opens the Passwords app without pairing, passing only web addresses", async () => {
    const { helper, client } = await setup();
    client.openPasswordsApp("https://example.com/login");
    client.openPasswordsApp("chrome://settings");
    client.openPasswordsApp();
    await vi.waitFor(() => expect(helper.passwordsAppLaunches).toEqual(["https://example.com/login", "", ""]));
  });

  it("saves a login once the user confirms macOS's prompt", async () => {
    const { helper, client } = await setup();
    await pair(helper, client);
    const login = { hostname: "new.test", username: "dana", password: "s3cret-one" };
    expect(await client.savePassword(login, tab)).toBe("saved");
    expect(helper.saved).toEqual([login]);
    expect(await client.getPassword("new.test", "dana", tab)).toEqual({ username: "dana", password: "s3cret-one" });
  });

  it("reports a declined save as not saved", async () => {
    const helper = new FakeHelper({ vault, declineSaves: true });
    const client = await ApplePasswordsClient.connect(new MemoryTransport(helper));
    await pair(helper, client);
    const login = { hostname: "new.test", username: "dana", password: "x" };
    expect(await client.savePassword(login, tab, { confirmTimeoutMs: 50 })).toBe("not-saved");
    // the queue moves on afterwards
    expect(await client.getLogins("example.com", tab)).toHaveLength(2);
  });

  it("stops waiting for a save when the helper exits", async () => {
    const helper = new FakeHelper({ vault, declineSaves: true });
    const transport = new MemoryTransport(helper);
    const client = await ApplePasswordsClient.connect(transport);
    await pair(helper, client);
    const saving = client.savePassword({ hostname: "new.test", username: "dana", password: "x" }, tab);
    await new Promise((r) => setTimeout(r, 10));
    transport.kill();
    expect(await saving).toBe("not-saved");
  });

  it("refuses to save before pairing", async () => {
    const { client } = await setup();
    await expect(
      client.savePassword({ hostname: "new.test", username: "dana", password: "x" }, tab),
    ).rejects.toMatchObject({ code: "closed" });
  });

  it("ignores updates for another tab while waiting for a reply", async () => {
    const { helper, transport, client } = await setup();
    await pair(helper, client);
    const pending = client.getLogins("example.com", { tabId: 1 });
    // an unrequested update for tab 2 arrives first; it must not answer tab 1's query
    transport.push({ cmd: Command.GetLoginNamesForUrl, tabId: 2, frameId: 0, payload: { SMSG: "{}" } });
    expect((await pending).map((l) => l.username)).toEqual(["alice@example.com", "bob"]);
  });

  it("locks when the helper asks to re-login", async () => {
    const { helper, transport, client } = await setup();
    await pair(helper, client);
    transport.push(helper.invalidateSession());
    expect(client.state).toBe("locked");
    await expect(client.getLogins("example.com", tab)).rejects.toMatchObject({ code: "closed" });
  });

  it("closes and fails pending requests when the helper exits", async () => {
    const { helper, transport, client } = await setup();
    await pair(helper, client);
    const states: string[] = [];
    client.onStateChange((s) => states.push(s));
    transport.kill();
    expect(client.state).toBe("closed");
    expect(states).toEqual(["closed"]);
    await expect(client.requestChallenge()).rejects.toMatchObject({ code: "closed" });
  });

  it("serializes concurrent queries so replies cannot cross", async () => {
    const { helper, transport, client } = await setup();
    await pair(helper, client);
    const before = transport.sent.length;
    const results = await Promise.all([
      client.getLogins("example.com", tab),
      client.getLogins("other.test", tab),
      client.getPassword("other.test", "carol", tab),
    ]);
    expect(results[0]).toHaveLength(2);
    expect(results[1]?.[0]).toMatchObject({ username: "carol" });
    expect(results[2]).toEqual({ username: "carol", password: "hunter2" });
    expect(transport.sent.slice(before).map((m) => (m as { cmd: number }).cmd)).toEqual([
      Command.GetLoginNamesForUrl,
      Command.GetLoginNamesForUrl,
      Command.GetPasswordForLoginName,
    ]);
  });

  it("never sends the code or password in clear text", async () => {
    const { helper, transport, client } = await setup();
    await client.requestChallenge();
    const code = helper.currentCode ?? "";
    await client.verifyCode(code);
    await client.getPassword("example.com", "bob", tab);
    const wire = JSON.stringify(transport.sent);
    expect(wire).not.toContain(code);
    expect(wire).not.toContain("battery staple");
  });
});
