import { FakeHelper, MemoryTransport } from "@app/fake-helper";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplePasswordsClient, Command, type HelperMessage, SecureChannel } from "../src/index.ts";

function signal() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

class LateReplyHelper extends FakeHelper {
  readonly ready = signal();
  held: HelperMessage | undefined;
  override async handle(request: HelperMessage): Promise<HelperMessage[]> {
    const replies = await super.handle(request);
    if (request.cmd !== Command.GetPasswordForLoginName) return replies;
    if (!this.held) {
      this.held = replies[0];
      this.ready.release();
      return [];
    }
    return [this.held];
  }
}

async function setup() {
  const helper = new LateReplyHelper({
    vault: [
      { hostname: "bank.test", username: "same", password: "bank-secret" },
      { hostname: "other.test", username: "same", password: "other-secret" },
      { hostname: "other.test", username: "different", password: "different-secret" },
    ],
  });
  const transport = new MemoryTransport(helper);
  const client = await ApplePasswordsClient.connect(transport);
  await client.requestChallenge();
  await client.verifyCode(helper.currentCode ?? "");
  return { helper, transport, client };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("credential request ownership", () => {
  it.each([
    { tabId: 1, username: "same" },
    { tabId: 2, username: "same" },
    { tabId: 1, username: "different" },
  ])("rejects a competing read without replacing the first ($tabId/$username)", async ({ tabId, username }) => {
    const { client, helper, transport } = await setup();
    const first = client.getPassword("bank.test", "same", { tabId: 1 }).catch((error: unknown) => error);
    await helper.ready.promise;
    await expect(client.getPassword("other.test", username, { tabId })).rejects.toMatchObject({ code: "busy" });
    expect(transport.sent.filter((m) => (m as HelperMessage).cmd === Command.GetPasswordForLoginName)).toHaveLength(1);
    if (helper.held) transport.push(helper.held);
    expect(await first).toEqual({ username: "same", password: "bank-secret" });
    client.close();
  });

  it("owns the read even before request encryption has finished", async () => {
    const { client, helper, transport } = await setup();
    const first = client.getPassword("bank.test", "same", { tabId: 1 }).catch((error: unknown) => error);
    const competing = client.getPassword("other.test", "same", { tabId: 1 }).catch((error: unknown) => error);
    await helper.ready.promise;
    expect(await competing).toMatchObject({ code: "busy" });
    if (helper.held) transport.push(helper.held);
    expect(await first).toEqual({ username: "same", password: "bank-secret" });
    client.close();
  });

  it("expires an unanswered password at 120 seconds and destroys the connection", async () => {
    const { client, helper } = await setup();
    vi.useFakeTimers();
    const result = client.getPassword("bank.test", "same", { tabId: 1 }).catch((error: unknown) => error);
    await helper.ready.promise;
    await vi.advanceTimersByTimeAsync(119_999);
    expect(client.state).toBe("unlocked");
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ code: "timeout" });
    expect(client.state).toBe("closed");
    await expect(client.getPassword("other.test", "same", { tabId: 1 })).rejects.toMatchObject({ code: "closed" });
  });

  it("does not return a password when Lock happens during reply decryption", async () => {
    const { client, helper, transport } = await setup();
    const entered = signal();
    const resume = signal();
    const original = SecureChannel.prototype.decryptReply;
    vi.spyOn(SecureChannel.prototype, "decryptReply").mockImplementation(async function (this: SecureChannel, bytes) {
      entered.release();
      await resume.promise;
      return original.call(this, bytes);
    });
    const result = client.getPassword("bank.test", "same", { tabId: 1 }).catch((error: unknown) => error);
    await helper.ready.promise;
    if (helper.held) transport.push(helper.held);
    await entered.promise;
    client.close();
    resume.release();
    expect(await result).toMatchObject({ code: "closed" });
  });
});
