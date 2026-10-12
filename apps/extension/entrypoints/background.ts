import { nativeHostFor } from "@/src/config.ts";
import { fillCredentials } from "@/src/fill.ts";
import { DEFAULT_SETTINGS, type Envelope, type Request, type Settings, type Status } from "@/src/messages.ts";
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

  async function handle(request: Request): Promise<unknown> {
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
        const url = await tabUrl(request.tabId);
        if (!url) return { logins: [] };
        const client = await session.unlockedClient();
        const logins = await client.getLogins(url.hostname, { tabId: request.tabId });
        return { hostname: url.hostname, logins: logins.map(({ username }) => ({ username })) };
      }
      case "fill": {
        const url = await tabUrl(request.tabId);
        if (!url) throw new Error("this page can't be filled");
        const client = await session.unlockedClient();
        const credential = await client.getPassword(url.hostname, request.username, { tabId: request.tabId });
        if (!credential) throw new Error("that login is no longer saved");
        const [injection] = await browser.scripting.executeScript({
          target: { tabId: request.tabId, frameIds: [0] },
          func: fillCredentials,
          args: [url.origin, credential.username, credential.password],
        });
        return { result: String(injection?.result ?? "no-fields") };
      }
      case "get-settings":
        return getSettings();
      case "set-settings": {
        const settings = { ...(await getSettings()), ...request.settings };
        await browser.storage.local.set({ settings });
        return settings;
      }
    }
  }

  browser.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
    // only our own extension pages (popup, or the popup opened as a tab). Content scripts report
    // the web page's URL and other extensions a different id, so both are refused.
    const ownPage = sender.id === browser.runtime.id && sender.url?.startsWith(browser.runtime.getURL("/")) === true;
    if (!ownPage) return false;
    handle(request).then(
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
