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
import { waitForLogin } from "@/src/passwords/wait-for-login.ts";
import { Session } from "@/src/session/session.ts";
import { fillableUrl } from "@/src/url-policy.ts";

const KEEP_ALIVE = "keep-alive";

/**
 * A tab id for our own lookups. Around a save the helper sends the real tab unrequested updates
 * that list no logins; replies echo the tab id, so these can't be mistaken for ours.
 */
const PROBE_TAB = { tabId: 2 ** 31 - 1, frameId: 0 };

interface PendingSave {
  url: URL;
  username: string;
  password: string;
  /** The menu to fill through; updated when the menu is reopened. */
  nonce: string;
  /** The site's usernames before the save. */
  before: string[];
  abort: AbortController;
  outcome?: Promise<NewPasswordResult>;
}

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

  // Passwords generated for open menus (by tab and menu nonce), saves waiting for the user's
  // answer to macOS's prompt (one per tab), and the last generated password filled per tab.
  const generatedForMenu = new Map<string, GeneratedPasswords>();
  const pendingSaves = new Map<number, PendingSave>();
  const filledByTab = new Map<number, { hostname: string; username: string; password: string }>();
  // generated passwords that replaced a saved one: Apple's helper can't confirm the update, so
  // they're kept (in memory, until the session ends) for the popup to show
  const unconfirmed: { hostname: string; username: string; password: string; at: number }[] = [];
  session.onChange(({ state }) => {
    if (state !== "unlocked") unconfirmed.length = 0;
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    pendingSaves.get(tabId)?.abort.abort();
    pendingSaves.delete(tabId);
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

  /** The usernames saved for a site, looked up on a tab id of our own (see PROBE_TAB). */
  async function usernamesFor(hostname: string): Promise<string[]> {
    const client = await session.unlockedClient();
    return (await client.getLogins(hostname, PROBE_TAB)).map((login) => login.username);
  }

  /**
   * Asks Apple Passwords to save a generated password. For a new username, the page gets it once
   * the login shows up in Apple Passwords. Replacing a saved password can't be seen in the site's
   * logins (and reading the password back costs a Touch ID prompt), so it's filled right away and
   * kept in memory until the session ends, in case the user didn't click Update Password.
   */
  async function startSave(tabId: number, nonce: string, password: string): Promise<NewPasswordResult> {
    if (pendingSaves.has(tabId)) return awaitPendingSave(tabId, nonce);
    const context = await newPasswordContext(tabId, nonce);
    if (!context.visible) return "menu-hidden";
    const url = await tabUrl(tabId);
    if (!url) throw new Error("this page can't be filled");
    const { username } = context;
    const before = await usernamesFor(url.hostname);
    const replaces = before.includes(username);
    const client = await session.unlockedClient();
    await client.savePassword({ hostname: url.hostname, username, password }, { tabId, frameId: 0 });
    const pending: PendingSave = { url, username, password, nonce, before, abort: new AbortController() };
    if (replaces) {
      unconfirmed.push({ hostname: url.hostname, username, password, at: Date.now() });
      return finishSave(tabId, pending);
    }
    pendingSaves.set(tabId, pending);
    return awaitPendingSave(tabId, nonce);
  }

  function awaitPendingSave(tabId: number, nonce: string): Promise<NewPasswordResult> {
    const pending = pendingSaves.get(tabId);
    if (!pending) return Promise.resolve("not-saved");
    pending.nonce = nonce;
    pending.outcome ??= waitForLogin(() => usernamesFor(pending.url.hostname), pending.username, pending.before, {
      signal: pending.abort.signal,
    }).then((saved) => (saved ? finishSave(tabId, pending) : dropSave(tabId, pending)));
    return pending.outcome;
  }

  function dropSave(tabId: number, pending: PendingSave): NewPasswordResult {
    if (pendingSaves.get(tabId) === pending) pendingSaves.delete(tabId);
    return "not-saved";
  }

  async function finishSave(tabId: number, pending: PendingSave, saved = true): Promise<NewPasswordResult> {
    if (pendingSaves.get(tabId) === pending) pendingSaves.delete(tabId);
    const { url, username, password, nonce } = pending;
    const fill = { type: "menu-fill-new-password", nonce, origin: url.origin, password, saved } as const;
    const reply = (await relay(tabId, fill).catch(() => undefined)) as { result: NewPasswordResult } | undefined;
    const result = reply?.result ?? "no-fields";
    if (result === "filled") filledByTab.set(tabId, { hostname: url.hostname, username, password });
    return result;
  }

  /** The user typed a different username before submitting: save it with the generated password. */
  async function updateGeneratedUsername(caller: Caller & { kind: "content-script" }, username: string) {
    const filled = filledByTab.get(caller.tabId);
    if (!filled || fillableUrl(caller.url)?.hostname !== filled.hostname || filled.username === username) return;
    const before = await usernamesFor(filled.hostname);
    const client = await session.unlockedClient();
    await client.savePassword({ ...filled, username }, { tabId: caller.tabId, frameId: 0 });
    if (await waitForLogin(() => usernamesFor(filled.hostname), username, before)) filled.username = username;
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
        // a menu reopened while a save waits for the user picks up where it left off
        const pending = pendingSaves.get(tabId);
        if (pending) return { pending: "waiting", username: pending.username };
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
        return { result: await startSave(tabId, request.nonce, passwords[request.style]) };
      }
      case "await-generated-password":
        return { result: await awaitPendingSave(tabOf(caller), request.nonce) };
      case "unconfirmed-passwords": {
        const url = await tabUrl(tabOf(caller, request.tabId));
        return unconfirmed
          .filter((entry) => entry.hostname === url?.hostname)
          .map(({ username, password }) => ({ username, password }));
      }
      case "fill-generated-unsaved": {
        const tabId = tabOf(caller);
        const pending = pendingSaves.get(tabId);
        if (!pending) return { result: "not-saved" };
        pending.abort.abort();
        pendingSaves.delete(tabId);
        pending.nonce = request.nonce;
        // not in Apple Passwords: keep it for the popup for the rest of the session
        unconfirmed.push({
          hostname: pending.url.hostname,
          username: pending.username,
          password: pending.password,
          at: Date.now(),
        });
        return { result: await finishSave(tabId, pending, false) };
      }
      case "cancel-generated-password": {
        const tabId = tabOf(caller);
        pendingSaves.get(tabId)?.abort.abort();
        pendingSaves.delete(tabId);
        return null;
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
