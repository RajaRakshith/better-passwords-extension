import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuMessage } from "../src/messages.ts";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/messages.ts", () => ({ send, bindToMenu: vi.fn() }));
vi.mock("../src/ui/accent.ts", () => ({ applySystemAccent: vi.fn() }));

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("inline menu session expiry", () => {
  let receive: (message: MenuMessage, sender: { id: string }) => void;
  let panel: HTMLElement;

  beforeEach(() => {
    vi.resetModules();
    send.mockReset();
    send.mockResolvedValue({});
    document.body.innerHTML = '<div id="menu"></div>';
    panel = document.getElementById("menu") as HTMLElement;
    vi.stubGlobal("browser", {
      runtime: {
        id: "test-extension",
        onMessage: {
          addListener: (listener: typeof receive) => {
            receive = listener;
          },
        },
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function lock() {
    receive({ type: "session-changed", unlocked: false }, { id: "test-extension" });
  }

  it("does not redisplay a generated password response delivered after Lock", async () => {
    const generated = deferred<{ strong: string }>();
    send.mockImplementation((request) =>
      request.type === "generate-passwords" ? generated.promise : Promise.resolve({}),
    );
    window.location.hash = "nonce=test&kind=new-password&mode=generate";
    await import("../entrypoints/menu/main.ts");
    lock();
    await vi.waitFor(() => expect(panel.textContent).toContain("Unlock to suggest"));
    generated.resolve({ strong: "generated-secret" });
    await generated.promise;
    await Promise.resolve();
    expect(panel.querySelector(".reveal")).toBeNull();
    expect(panel.textContent).toContain("Unlock to suggest");
  });

  it("removes generated secrets synchronously before querying locked status", async () => {
    const status = deferred<object>();
    send.mockImplementation((request) => {
      if (request.type === "generate-passwords") return Promise.resolve({ strong: "generated-secret" });
      if (request.type === "get-status") return status.promise;
      return Promise.resolve({});
    });
    window.location.hash = "nonce=test&kind=new-password&mode=generate";
    await import("../entrypoints/menu/main.ts");
    await vi.waitFor(() => expect(panel.querySelector(".reveal")).not.toBeNull());
    lock();
    const remainingReveal = panel.querySelector(".reveal");
    status.resolve({});
    await status.promise;
    expect(remainingReveal).toBeNull();
  });

  it.each([false, true])("does not restore %s cached login results after Lock", async (alreadyDisplayed) => {
    const logins = deferred<object>();
    send.mockImplementation((request) => (request.type === "list-logins" ? logins.promise : Promise.resolve({})));
    window.location.hash = "nonce=test&kind=login";
    await import("../entrypoints/menu/main.ts");
    const result = { logins: [{ username: "private-user" }], hostname: "example.com", origin: "https://example.com" };
    if (alreadyDisplayed) {
      logins.resolve(result);
      await vi.waitFor(() => expect(panel.textContent).toContain("private-user"));
    }
    lock();
    await vi.waitFor(() => expect(panel.textContent).toContain("Unlock to fill"));
    logins.resolve(result);
    await logins.promise;
    await Promise.resolve();
    receive({ type: "menu-filter", nonce: "test", query: "" }, { id: "test-extension" });
    expect(panel.textContent).not.toContain("private-user");
    expect(panel.textContent).toContain("Unlock to fill");
  });
});
