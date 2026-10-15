import type { FieldKind } from "@/src/autofill/fields.ts";
import { Companion } from "@/src/companion.ts";
import { nativeHostFor } from "@/src/config.ts";
import { fillCredentials } from "@/src/fill.ts";
import {
  type AutofillStatus,
  CONTENT_SCRIPT_REQUESTS,
  type ContentMessage,
  DEFAULT_SETTINGS,
  type Envelope,
  type GeneratedPasswords,
  type NewPasswordContext,
  type NewPasswordResult,
  type Request,
  type Settings,
  type Status,
} from "@/src/messages.ts";
import { PortTransport } from "@/src/native/port-transport.ts";
import { generatePassword } from "@/src/passwords/generate.ts";
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

  const companion = new Companion();
  const status = (): Status => ({ ...session.status, variant: __VARIANT__ });

  /** Status plus whether the companion app can unlock with Touch ID. */
  async function fullStatus(): Promise<Status> {
    const base = status();
    if (base.state === "no-helper") return base;
    const state = await companion.state();
    return { ...base, companion: state, touchId: state === "ready" && (await getSettings()).touchId };
  }

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

  async function autofillStatus(caller: Caller & { kind: "content-script" }, kind: FieldKind): Promise<AutofillStatus> {
    const url = fillableUrl(caller.url);
    const settings = await getSettings();
    if (!url || !settings.inlineMenu) return { show: "none" };
    if (kind === "signup-email") return { show: "none" };
    if (kind === "new-password" && !settings.generatePasswords) return { show: "none" };
    if (session.status.state === "disconnected" || session.status.state === "closed") {
      await session.connect().catch(() => {});
    }
    if (!session.isUnlocked) return { show: session.status.state === "no-helper" ? "none" : "locked" };
    // saving needs the session, so new passwords are offered only once unlocked
    if (kind === "new-password") return { show: "generate" };
    const client = await session.unlockedClient();
    const logins = await client.getLogins(url.hostname, { tabId: caller.tabId });
    return { show: logins.length > 0 ? "logins" : "none" };
  }

  // Passwords generated for open menus (by tab and menu nonce), and the last one filled per tab.
  const generatedForMenu = new Map<string, GeneratedPasswords>();
  const filledByTab = new Map<number, { hostname: string; username: string; password: string }>();
  browser.tabs.onRemoved.addListener((tabId) => {
    filledByTab.delete(tabId);
    for (const key of generatedForMenu.keys()) if (key.startsWith(`${tabId}:`)) generatedForMenu.delete(key);
  });

  async function newPasswordContext(tabId: number, nonce: string): Promise<NewPasswordContext> {
    const context = (await relay(tabId, { type: "menu-new-password-context", nonce })) as
      | NewPasswordContext
      | undefined;
    if (!context) throw new Error("The password field is gone.");
    return context;
  }

  /**
   * Saves a generated password to Apple Passwords and fills it only once the user confirmed
   * macOS's Save prompt, so a page never gets a password that isn't saved.
   */
  async function useGeneratedPassword(tabId: number, nonce: string, password: string): Promise<NewPasswordResult> {
    const context = await newPasswordContext(tabId, nonce);
    if (!context.visible) return "menu-hidden";
    const url = await tabUrl(tabId);
    if (!url) throw new Error("this page can't be filled");
    const client = await session.unlockedClient();
    const tab = { tabId, frameId: 0 };
    const { username } = context;
    const existed = (await client.getLogins(url.hostname, tab)).some((login) => login.username === username);
    if ((await client.savePassword({ hostname: url.hostname, username, password }, tab)) !== "saved") {
      return "not-saved";
    }
    // an update looks like the old entry, so check the new password really is stored
    if (existed && (await client.getPassword(url.hostname, username, tab))?.password !== password) return "not-saved";
    generatedForMenu.delete(`${tabId}:${nonce}`);
    const reply = (await relay(tabId, { type: "menu-fill-new-password", nonce, origin: url.origin, password })) as
      | { result: NewPasswordResult }
      | undefined;
    const result = reply?.result ?? "no-fields";
    if (result === "filled") filledByTab.set(tabId, { hostname: url.hostname, username, password });
    return result;
  }

  /** The user typed a different username before submitting: save it with the generated password. */
  async function updateGeneratedUsername(caller: Caller & { kind: "content-script" }, username: string) {
    const filled = filledByTab.get(caller.tabId);
    if (!filled || fillableUrl(caller.url)?.hostname !== filled.hostname || filled.username === username) return;
    const client = await session.unlockedClient();
    const saved = await client.savePassword({ ...filled, username }, { tabId: caller.tabId, frameId: 0 });
    if (saved === "saved") filled.username = username;
  }

  async function handle(request: Request, caller: Caller): Promise<unknown> {
    if (caller.kind === "content-script") {
      if (request.type === "autofill-status") return autofillStatus(caller, request.kind);
      if (request.type === "generated-password-submitted") {
        void updateGeneratedUsername(caller, request.username);
        return null;
      }
      throw new Error("not allowed");
    }
    switch (request.type) {
      case "get-status":
        if (session.status.state === "disconnected") await session.connect().catch(() => {});
        return fullStatus();
      case "unlock-with-touch-id": {
        await session.requestCode();
        const code = await companion.readCode();
        try {
          await session.verifyCode(code);
        } catch (error) {
          // a wrong code burns the challenge; put a fresh one on screen for typing instead
          await session.requestNewCode().catch(() => {});
          throw error;
        }
        return status();
      }
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
      case "generate-passwords": {
        const tabId = tabOf(caller);
        const { rules } = await newPasswordContext(tabId, request.nonce);
        const passwords = {
          strong: generatePassword("strong", rules),
          alphanumeric: generatePassword("alphanumeric", rules),
        };
        generatedForMenu.set(`${tabId}:${request.nonce}`, passwords);
        return passwords;
      }
      case "use-generated-password": {
        const tabId = tabOf(caller);
        const passwords = generatedForMenu.get(`${tabId}:${request.nonce}`);
        if (!passwords) throw new Error("That password expired. Try again.");
        return { result: await useGeneratedPassword(tabId, request.nonce, passwords[request.style]) };
      }
      case "generated-password-submitted":
        throw new Error("content scripts only");
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
      case "open-passwords-app": {
        const tabId = caller.tabId ?? request.tabId;
        const url = tabId === undefined ? undefined : await tabUrl(tabId).catch(() => undefined);
        const client = await session.connect();
        client.openPasswordsApp(url?.origin);
        return null;
      }
      case "menu-resize":
      case "menu-close":
      case "menu-focus-field":
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
