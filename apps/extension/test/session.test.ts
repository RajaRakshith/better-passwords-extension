import { FakeHelper, MemoryTransport } from "@app/fake-helper";
import { describe, expect, it } from "vitest";
import { Session } from "../src/session/session.ts";

const vault = [{ hostname: "example.com", username: "alice", password: "pw" }];

function setup() {
  const helper = new FakeHelper({ vault });
  const transports: MemoryTransport[] = [];
  const session = new Session({
    openTransport: () => {
      const t = new MemoryTransport(helper);
      transports.push(t);
      return t;
    },
  });
  return { helper, transports, session };
}

describe("Session", () => {
  it("pairs once and reuses the connection", async () => {
    const { helper, transports, session } = setup();
    await session.requestCode();
    await session.verifyCode(helper.currentCode ?? "");
    expect(session.status.state).toBe("unlocked");

    await session.requestCode(); // e.g. popup reopened: must not re-pair
    await session.connect();
    expect(transports).toHaveLength(1);
    expect(session.isUnlocked).toBe(true);
  });

  it("keeps the code on screen when the popup reopens", async () => {
    const { helper, session } = setup();
    await session.requestCode();
    const shown = helper.currentCode;
    await session.requestCode();
    expect(helper.currentCode).toBe(shown);
  });

  it("rejects malformed codes without burning the challenge", async () => {
    const { helper, session } = setup();
    await session.requestCode();
    await expect(session.verifyCode("12ab")).rejects.toThrow();
    await session.verifyCode(helper.currentCode ?? "");
    expect(session.status.state).toBe("unlocked");
  });

  it("reports a missing host registration as setup needed", async () => {
    const session = new Session({
      openTransport: () => {
        throw new Error("Specified native messaging host not found.");
      },
    });
    await expect(session.connect()).rejects.toThrow();
    expect(session.status.state).toBe("no-helper");
  });

  it("reports when the helper exits, and reconnects on next use", async () => {
    const { helper, transports, session } = setup();
    await session.requestCode();
    await session.verifyCode(helper.currentCode ?? "");
    transports[0]?.kill();
    expect(session.status.state).toBe("closed");

    await session.requestCode();
    expect(transports).toHaveLength(2);
    expect(session.status.state).toBe("awaiting-code");
  });

  it("lock ends the session", async () => {
    const { helper, session } = setup();
    await session.requestCode();
    await session.verifyCode(helper.currentCode ?? "");
    session.lock();
    expect(session.status.state).toBe("disconnected");
    await expect(session.unlockedClient()).rejects.toThrow();
  });
});
