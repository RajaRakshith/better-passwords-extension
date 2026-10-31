import { FakeHelper, MemoryTransport } from "@app/fake-helper";
import { Command, type HelperMessage } from "@app/protocol";
import { describe, expect, it } from "vitest";
import { Session } from "../src/session/session.ts";

function signal() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("Session invalidation", () => {
  it("invalidates an unlocked epoch when locked and reconnects with a fresh epoch", async () => {
    const helper = new FakeHelper();
    const transports: MemoryTransport[] = [];
    const session = new Session({
      openTransport: () => {
        const t = new MemoryTransport(helper);
        transports.push(t);
        return t;
      },
    });
    await session.requestCode();
    await session.verifyCode(helper.currentCode ?? "");
    const epoch = session.epoch;
    expect(session.isCurrent(epoch)).toBe(true);
    session.lock();
    expect(session.isCurrent(epoch)).toBe(false);
    await session.requestCode();
    await session.verifyCode(helper.currentCode ?? "");
    transports[0]?.kill();
    expect(session.isUnlocked).toBe(true);
    expect(session.isCurrent(epoch)).toBe(false);
    session.lock();
  });

  it("does not resurrect a connection that finishes after Lock", async () => {
    const ready = signal();
    const resume = signal();
    class SlowHelper extends FakeHelper {
      override async handle(message: HelperMessage) {
        if (message.cmd === Command.GetCapabilities) {
          ready.release();
          await resume.promise;
        }
        return super.handle(message);
      }
    }
    const session = new Session({ openTransport: () => new MemoryTransport(new SlowHelper()) });
    const connected = session.connect().catch((e: unknown) => e);
    await ready.promise;
    session.lock();
    resume.release();
    expect(await connected).toMatchObject({ code: "closed" });
    expect(session.status.state).toBe("disconnected");
  });

  it("runs the access guard and never returns a client when it locks the session", async () => {
    const helper = new FakeHelper();
    let expire = false;
    let guarded = 0;
    const session = new Session({
      openTransport: () => new MemoryTransport(helper),
      beforeAccess: async () => {
        guarded++;
        if (expire) session.lock();
      },
    });
    await session.requestCode();
    await session.verifyCode(helper.currentCode ?? "");
    expect((await session.unlockedClient()).state).toBe("unlocked");
    expire = true;
    await expect(session.unlockedClient()).rejects.toMatchObject({ code: "closed" });
    expect(guarded).toBe(2);
  });
});
