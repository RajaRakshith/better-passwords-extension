import { nativeHostFor } from "@/src/config.ts";
import { fillCredentials } from "@/src/fill.ts";
import {
  type AutofillStatus,
  CONTENT_SCRIPT_REQUESTS,
  type ContentMessage,
  DEFAULT_SETTINGS,
  type Envelope,
  type Request,
  type Settings,
  type Status,
} from "@/src/messages.ts";
import { PortTransport } from "@/src/native/port-transport.ts";
import { Session } from "@/src/session/session.ts";
import { fillableUrl } from "@/src/url-policy.ts";

const KEEP_ALIVE = "keep-alive";

export default defineBackground(() => {
  const session = new Session({
    openTransport: () => new PortTransport(nativeHostFor(__VARIANT__)),
    browserName: import.meta.env.FIREFOX ? "Firefox" : "Chrome",
  });

  // An open native port keeps the worker alive in Chrome 105+; the alarm is a fallback that
  // wakes it if the browser suspends it anyway. Nothing to do on wake: state lives in memory.
  session.onChange(({ state }) => {
    if (state === "unlocked") void browser.alarms.create(KEEP_ALIVE, { periodInMinutes: 0.5 });
    else if (state === "closed" || state === "disconnected") void browser.alarms.clear(KEEP_ALIVE);
  });
  browser.alarms.onAlarm.addListener(() => {});

  browser.idle.onStateChanged.addListener(async (state) => {
    if (state !== "locked") return;
    if ((await getSettings()).lockOnScreenLock) session.lock();
  });

  const status = (): Status => ({ ...session.status, variant: __VARIANT__ });

  /**
   * Who sent a request. Extension pages may ask anything; when they live inside a tab (the inline
   * menu iframe), every tab-scoped request is bound to that tab, whatever `tabId` they pass.
   */
  type Caller = { kind: "page"; tabId?: number } | { kind: "content-script"; tabId: number; url: string };

  function tabOf(caller: Caller, requested?: number): number {
    const tabId = caller.tabId ?? requested;
    if (tabId === undefined) throw new Error("no tab to act on");
    return tabId;
  }

  function relay(tabId: number, message: ContentMessage) {
    return browser.tabs.sendMessage(tabId, message, { frameId: 0 });
  }

  async function autofillStatus(caller: Caller & { kind: "content-script" }): Promise<AutofillStatus> {
    const url = fillableUrl(caller.url);
    if (!url || !(await getSettings()).inlineMenu) return { show: "none" };
    if (session.status.state === "disconnected" || session.status.state === "closed") {
      await session.connect().catch(() => {});
    }
    if (!session.isUnlocked) return { show: session.status.state === "no-helper" ? "none" : "locked" };
    const client = await session.unlockedClient();
    const logins = await client.getLogins(url.hostname, { tabId: caller.tabId });
    return { show: logins.length > 0 ? "logins" : "none" };
  }

  async function handle(request: Request, caller: Caller): Promise<unknown> {
    if (caller.kind === "content-script") {
      if (request.type !== "autofill-status") throw new Error("not allowed");
      return autofillStatus(caller);
    }
    switch (request.type) {
      case "get-status":
        if (session.status.state === "disconnected") await session.connect().catch(() => {});
        return status();
      case "request-code":
        await (request.fresh ? session.requestNewCode() : session.requestCode());
        return status();
      case "verify-code":
        await session.verifyCode(request.code);
        return status();
      case "lock":
        session.lock();
        return status();
      case "list-logins": {
        const tabId = tabOf(caller, request.tabId);
        const url = await tabUrl(tabId);
        if (!url) return { logins: [] };
        const client = await session.unlockedClient();
        const logins = await client.getLogins(url.hostname, { tabId });
        return { hostname: url.hostname, logins: logins.map(({ username }) => ({ username })) };
      }
      case "fill": {
        const tabId = tabOf(caller, request.tabId);
        const { url, credential } = await credentialFor(tabId, request.username);
        const [injection] = await browser.scripting.executeScript({
          target: { tabId, frameIds: [0] },
          func: fillCredentials,
          args: [url.origin, credential.username, credential.password],
        });
        return { result: String(injection?.result ?? "no-fields") };
      }
      case "fill-from-menu": {
        const tabId = tabOf(caller);
        const { url, credential } = await credentialFor(tabId, request.username);
        const reply = (await relay(tabId, {
          type: "menu-fill",
          nonce: request.nonce,
          origin: url.origin,
          username: credential.username,
          password: credential.password,
        })) as { result: string } | undefined;
        return { result: reply?.result ?? "menu-hidden" };
      }
      case "menu-resize":
      case "menu-close":
        await relay(tabOf(caller), request).catch(() => {});
        return null;
      case "get-settings":
        return getSettings();
      case "set-settings": {
        const settings = { ...(await getSettings()), ...request.settings };
        await browser.storage.local.set({ settings });
        return settings;
      }
      case "autofill-status":
        throw new Error("content scripts only");
    }
  }

  async function credentialFor(tabId: number, username: string) {
    const url = await tabUrl(tabId);
    if (!url) throw new Error("this page can't be filled");
    const client = await session.unlockedClient();
    const credential = await client.getPassword(url.hostname, username, { tabId });
    if (!credential) throw new Error("that login is no longer saved");
    return { url, credential };
  }

  browser.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return false;
    let caller: Caller;
    if (sender.url?.startsWith(browser.runtime.getURL("/"))) {
      caller = sender.tab?.id === undefined ? { kind: "page" } : { kind: "page", tabId: sender.tab.id };
    } else if (
      sender.tab?.id !== undefined &&
      sender.frameId === 0 &&
      sender.url &&
      CONTENT_SCRIPT_REQUESTS.has(request.type)
    ) {
      caller = { kind: "content-script", tabId: sender.tab.id, url: sender.url };
    } else {
      return false;
    }
    handle(request, caller).then(
      (value) => sendResponse({ ok: true, value } satisfies Envelope<unknown>),
      (error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          code: (error as { code?: string })?.code,
        } as Envelope<unknown>),
    );
    return true;
  });
});

async function tabUrl(tabId: number): Promise<URL | undefined> {
  const tab = await browser.tabs.get(tabId);
  return fillableUrl(tab.url);
}

async function getSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) };
}
