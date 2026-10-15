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

/** A generated password filled into a tab, until Apple Passwords has it. */
interface GeneratedLogin {
  hostname: string;
  password: string;
  /** "unsaved": not asked yet, or the user declined; "saving": macOS's prompt is up. */
  state: "unsaved" | "saving" | "saved";
  /** The username it was (or is being) saved with. */
  username?: string;
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

  // Passwords generated for open menus (by tab and menu nonce), and the one filled per tab.
  const generatedForMenu = new Map<string, GeneratedPasswords>();
  const generatedByTab = new Map<number, GeneratedLogin>();
  // Filled passwords Apple Passwords may not have (not saved yet, declined, or an update that
  // can't be confirmed), kept in memory until the session ends for the popup to show.
  const unconfirmed: { hostname: string; username: string; password: string }[] = [];
  session.onChange(({ state }) => {
    if (state !== "unlocked") unconfirmed.length = 0;
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    generatedByTab.delete(tabId);
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
   * Fills a generated password right away, like Safari. Apple Passwords is asked to save it when
   * the form is submitted (see saveGenerated); until it has it, the popup keeps it.
   */
  async function fillGenerated(tabId: number, nonce: string, password: string): Promise<NewPasswordResult> {
    const context = await newPasswordContext(tabId, nonce);
    if (!context.visible) return "menu-hidden";
    const url = await tabUrl(tabId);
    if (!url) throw new Error("this page can't be filled");
    const fill = { type: "menu-fill-new-password", nonce, origin: url.origin, password } as const;
    const reply = (await relay(tabId, fill).catch(() => undefined)) as { result: NewPasswordResult } | undefined;
    const result = reply?.result ?? "no-fields";
    if (result !== "filled") return result;
    const previous = generatedByTab.get(tabId);
    if (previous) forget(previous.password);
    generatedByTab.set(tabId, { hostname: url.hostname, password, state: "unsaved" });
    unconfirmed.push({ hostname: url.hostname, username: context.username, password });
    return result;
  }

  function forget(password: string) {
    const index = unconfirmed.findIndex((entry) => entry.password === password);
    if (index >= 0) unconfirmed.splice(index, 1);
  }

  /**
   * The form with a generated password was submitted (or the page left): ask Apple Passwords to
   * save it with the form's username. A new login confirms the save; an update can't be seen, so
   * it's assumed and the password stays in the popup's list.
   */
  async function saveGenerated(caller: Caller & { kind: "content-script" }, username: string) {
    const generated = generatedByTab.get(caller.tabId);
    if (!generated || fillableUrl(caller.url)?.hostname !== generated.hostname) return;
    if (generated.state !== "unsaved" && generated.username === username) return;
    generated.state = "saving";
    generated.username = username;
    const before = await usernamesFor(generated.hostname);
    const client = await session.unlockedClient();
    const { hostname, password } = generated;
    await client.savePassword({ hostname, username, password }, { tabId: caller.tabId, frameId: 0 });
    const tab = caller.tabId;
    if (username !== "" && before.includes(username)) return markSaved(tab, generated, username, false);
    const saved = await waitForLogin(() => usernamesFor(hostname), username, before);
    if (generated.username !== username) return; // a newer submit took over
    if (saved === undefined) generated.state = "unsaved";
    // without a username, it's the one the user typed into macOS's Save dialog
    else markSaved(tab, generated, saved, true);
  }

  function markSaved(tabId: number, generated: GeneratedLogin, username: string, confirmed: boolean) {
    generated.state = "saved";
    generated.username = username;
    if (confirmed) forget(generated.password);
    void relay(tabId, { type: "generated-password-saved", password: generated.password }).catch(() => {});
  }

  async function handle(request: Request, caller: Caller): Promise<unknown> {
    if (caller.kind === "content-script") {
      if (request.type === "autofill-status") return autofillStatus(caller, request.kind);
      if (request.type === "generated-password-submitted") {
        void saveGenerated(caller, request.username);
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
        return { result: await fillGenerated(tabId, request.nonce, passwords[request.style]) };
      }
      case "unconfirmed-passwords": {
        const url = await tabUrl(tabOf(caller, request.tabId));
        return unconfirmed
          .filter((entry) => entry.hostname === url?.hostname)
          .map(({ username, password }) => ({ username, password }));
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
