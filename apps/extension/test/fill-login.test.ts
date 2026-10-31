import { FakeHelper, MemoryTransport } from "@app/fake-helper";
import { describe, expect, it } from "vitest";
import { type FillLoginDeps, fillLogin } from "../src/passwords/fill-login.ts";
import { Session } from "../src/session/session.ts";

async function setup() {
  const helper = new FakeHelper({ vault: [{ hostname: "bank.test", username: "same", password: "bank-secret" }] });
  const transport = new MemoryTransport(helper);
  const session = new Session({ openTransport: () => transport });
  await session.requestCode();
  await session.verifyCode(helper.currentCode ?? "");
  let url = "https://bank.test/login";
  const choices: string[] = [];
  const deps: FillLoginDeps = {
    session,
    tabUrl: async () => new URL(url),
    rememberChoice: (_host, username) => {
      choices.push(username);
    },
    forgetChoice: () => {
      choices.length = 0;
    },
  };
  const selection = { tabId: 1, username: "same", expectedOrigin: "https://bank.test" };
  return {
    deps,
    selection,
    session,
    choices,
    transport,
    navigate: () => {
      url = "https://other.test/login";
    },
  };
}

describe("origin-bound fillLogin", () => {
  it("refuses a stale UI selection without reading or filling a password", async () => {
    const { deps, selection, session, transport, navigate } = await setup();
    navigate();
    const fills: (string | null)[] = [];
    expect(
      await fillLogin(deps, selection, async (_origin, password) => {
        fills.push(password);
        return "filled";
      }),
    ).toBe("origin-mismatch");
    expect(fills).toEqual([]);
    expect(transport.sent.filter((m) => (m as { cmd: number }).cmd === 5)).toEqual([]);
    session.lock();
  });

  it("aborts navigation between the probe and password retrieval", async () => {
    const { deps, selection, session, navigate } = await setup();
    const fills: (string | null)[] = [];
    expect(
      await fillLogin(deps, selection, async (_origin, password) => {
        fills.push(password);
        navigate();
        return "needs-password";
      }),
    ).toBe("origin-mismatch");
    expect(fills).toEqual([null]);
    session.lock();
  });

  it("does not dispatch plaintext after a lock during the probe", async () => {
    const { deps, selection, session } = await setup();
    const fills: (string | null)[] = [];
    await expect(
      fillLogin(deps, selection, async (_origin, password) => {
        fills.push(password);
        session.lock();
        return "needs-password";
      }),
    ).rejects.toMatchObject({ code: "closed" });
    expect(fills).toEqual([null]);
  });

  it("fills sequentially on the selected origin", async () => {
    const { deps, selection, session } = await setup();
    const fills: (string | null)[] = [];
    expect(
      await fillLogin(deps, selection, async (_origin, password) => {
        fills.push(password);
        return password === null ? "needs-password" : "filled";
      }),
    ).toBe("filled");
    expect(fills).toEqual([null, "bank-secret"]);
    session.lock();
  });

  it.each(["navigate", "lock"])("does not dispatch a retrieved credential after %s", async (action) => {
    const { deps, selection, session, navigate } = await setup();
    const client = await session.unlockedClient();
    const original = client.getPassword.bind(client);
    client.getPassword = async (...args) => {
      const credential = await original(...args);
      if (action === "navigate") navigate();
      else session.lock();
      return credential;
    };
    const fills: (string | null)[] = [];
    const result = fillLogin(deps, selection, async (_origin, password) => {
      fills.push(password);
      return "needs-password";
    });
    if (action === "navigate") expect(await result).toBe("origin-mismatch");
    else await expect(result).rejects.toMatchObject({ code: "closed" });
    expect(fills).toEqual([null]);
    session.lock();
  });

  it("fills a username-only step without reading a password", async () => {
    const { deps, selection, session, transport, choices } = await setup();
    expect(await fillLogin(deps, selection, async () => "filled")).toBe("filled");
    expect(choices).toEqual(["same"]);
    expect(transport.sent.filter((m) => (m as { cmd: number }).cmd === 5)).toEqual([]);
    session.lock();
  });
});
