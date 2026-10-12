// Messages from our own UI (popup) to the background worker. Pages never talk to the background.

import type { SessionStatus } from "./session/session.ts";

export type Request =
  | { type: "get-status" }
  | { type: "request-code"; fresh?: boolean }
  | { type: "verify-code"; code: string }
  | { type: "list-logins"; tabId: number }
  | { type: "fill"; tabId: number; username: string }
  | { type: "lock" }
  | { type: "get-settings" }
  | { type: "set-settings"; settings: Partial<Settings> };

export interface Settings {
  /** End the session when the Mac locks or sleeps. */
  lockOnScreenLock: boolean;
}

export const DEFAULT_SETTINGS: Settings = { lockOnScreenLock: false };

export interface Status extends SessionStatus {
  variant: "store" | "github";
}

export interface LoginsResult {
  /** Undefined when the active tab is not a page we fill (e.g. chrome:// or plain http). */
  hostname?: string;
  logins: { username: string }[];
}

export type Response<R extends Request> = R extends { type: "get-status" }
  ? Status
  : R extends { type: "list-logins" }
    ? LoginsResult
    : R extends { type: "fill" }
      ? { result: string }
      : R extends { type: "get-settings" | "set-settings" }
        ? Settings
        : Status;

/** Wire envelope, so errors cross the message boundary as data instead of being lost. */
export type Envelope<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

export async function send<R extends Request>(request: R): Promise<Response<R>> {
  const reply = (await browser.runtime.sendMessage(request)) as Envelope<Response<R>> | undefined;
  if (!reply) throw new Error("no reply from the background worker");
  if (!reply.ok) throw Object.assign(new Error(reply.error), { code: reply.code });
  return reply.value;
}
