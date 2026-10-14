// The optional Mac companion app (apps/companion). After Touch ID it reads the pairing code off
// Apple's window, so the user doesn't have to type it. It is a separate native host, and the
// extension works the same without it.

import { COMPANION_HOST } from "./config.ts";

/** "ready": installed and allowed; "needs-setup": installed but Accessibility is off. */
export type CompanionState = "ready" | "needs-setup" | "not-installed";

interface HostResponse {
  ok: boolean;
  version?: number;
  code?: string;
  accessibility?: boolean;
  error?: string;
  message?: string;
}

export class CompanionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

type SendNative = (host: string, message: unknown) => Promise<unknown>;

const STATE_TTL_MS = 30_000;

export class Companion {
  #cached: { state: CompanionState; at: number } | undefined;

  constructor(
    private readonly sendNative: SendNative = (host, message) =>
      browser.runtime.sendNativeMessage(host, message as object),
    private readonly now: () => number = Date.now,
  ) {}

  /** Whether the companion can unlock. Cached briefly: each check starts the host and the agent. */
  async state(): Promise<CompanionState> {
    if (this.#cached && this.now() - this.#cached.at < STATE_TTL_MS) return this.#cached.state;
    let state: CompanionState;
    try {
      const reply = (await this.sendNative(COMPANION_HOST, { type: "hello" })) as HostResponse | undefined;
      state = reply?.ok ? (reply.accessibility ? "ready" : "needs-setup") : "needs-setup";
    } catch {
      // the host isn't registered: the app isn't installed, or its setup didn't run
      state = "not-installed";
    }
    this.#cached = { state, at: this.now() };
    return state;
  }

  /** Asks for Touch ID and returns the code Apple's helper shows. */
  async readCode(): Promise<string> {
    let reply: HostResponse | undefined;
    try {
      reply = (await this.sendNative(COMPANION_HOST, { type: "read-code" })) as HostResponse | undefined;
    } catch (error) {
      this.#cached = undefined;
      throw new CompanionError(error instanceof Error ? error.message : String(error), "not-installed");
    }
    if (reply?.ok && typeof reply.code === "string" && /^\d{6}$/.test(reply.code)) return reply.code;
    if (reply?.error === "needs-accessibility" || reply?.error === "agent-unavailable") this.#cached = undefined;
    throw new CompanionError(reply?.message ?? "Touch ID didn't work.", reply?.error ?? "failed");
  }
}
