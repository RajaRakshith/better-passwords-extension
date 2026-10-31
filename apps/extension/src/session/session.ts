// Owns the connection to Apple's helper for the lifetime of the background worker.
//
// Apple's extension drops the connection whenever its worker sleeps, and every new connection
// means a new code. Keeping one port open keeps the worker (and the helper's session) alive, so
// the user pairs once per browser launch instead.

import { ApplePasswordsClient, type ClientState, ProtocolError, type Transport } from "@app/protocol";

export type SessionState = "disconnected" | "no-helper" | ClientState;

export interface SessionStatus {
  state: SessionState;
  error?: string;
}

export interface SessionDeps {
  openTransport: () => Transport;
  browserName?: string;
  beforeAccess?: () => Promise<void>;
}

/** Chromium's errors when the host registration is missing or excludes this extension. */
const MISSING_HOST = /not found|forbidden|access to the specified native messaging host/i;

export class Session {
  #client: ApplePasswordsClient | undefined;
  #connecting: Promise<ApplePasswordsClient> | undefined;
  #status: SessionStatus = { state: "disconnected" };
  #listeners = new Set<(status: SessionStatus) => void>();
  #epoch = 0;
  #openingTransport: Transport | undefined;
  #cancelOpen: (() => void) | undefined;

  constructor(private readonly deps: SessionDeps) {}

  get status(): SessionStatus {
    return this.#status;
  }

  get isUnlocked(): boolean {
    return this.#client?.state === "unlocked";
  }

  get epoch(): number {
    return this.#epoch;
  }

  isCurrent(epoch: number): boolean {
    return epoch === this.#epoch && this.isUnlocked;
  }

  onChange(listener: (status: SessionStatus) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Connects if needed. Never re-pairs a live session. */
  async connect(): Promise<ApplePasswordsClient> {
    if (this.#client && this.#client.state !== "closed") return this.#client;
    if (!this.#connecting) {
      const pending = this.#open().finally(() => {
        if (this.#connecting === pending) this.#connecting = undefined;
      });
      this.#connecting = pending;
    }
    return this.#connecting;
  }

  /** Shows a code on the Mac, unless one is already on screen or the session is unlocked. */
  async requestCode(): Promise<void> {
    const client = await this.connect();
    if (client.state === "unlocked" || client.hasLiveChallenge) return;
    await this.#track(client, client.requestChallenge());
  }

  /** Forces a fresh code, replacing one the user may have lost. */
  async requestNewCode(): Promise<void> {
    const client = await this.connect();
    await this.#track(client, client.requestChallenge());
  }

  async verifyCode(code: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) throw new ProtocolError("the code has 6 digits", "incorrect-code");
    const client = await this.connect();
    await this.#track(client, client.verifyCode(code));
  }

  async unlockedClient(): Promise<ApplePasswordsClient> {
    const epoch = this.#epoch;
    await this.deps.beforeAccess?.();
    if (epoch !== this.#epoch) throw new ProtocolError("The password session ended. Unlock again.", "closed");
    const client = await this.connect();
    if (client.state !== "unlocked") throw new ProtocolError("not paired", "closed");
    return client;
  }

  /** Ends the session. Closing the port makes Apple's helper exit and forget the key. */
  lock(): void {
    this.#epoch++;
    this.#cancelOpen?.();
    this.#cancelOpen = undefined;
    this.#openingTransport?.close();
    this.#openingTransport = undefined;
    this.#connecting = undefined;
    this.#client?.close();
    this.#client = undefined;
    this.#set({ state: "disconnected" });
  }

  async #open(): Promise<ApplePasswordsClient> {
    const epoch = ++this.#epoch;
    let transport: Transport;
    try {
      transport = this.deps.openTransport();
      this.#openingTransport = transport;
    } catch (error) {
      this.#set({ state: "no-helper", error: message(error) });
      throw error;
    }

    let closeError: string | undefined;
    transport.onClose((error) => {
      closeError = error;
    });
    try {
      const cancelled = new Promise<never>((_resolve, reject) => {
        this.#cancelOpen = () => reject(new ProtocolError("The password session ended.", "closed"));
      });
      const opening = ApplePasswordsClient.connect(
        transport,
        this.deps.browserName ? { browserName: this.deps.browserName } : {},
      ).then((client) => {
        if (epoch !== this.#epoch) {
          client.close();
          throw new ProtocolError("The password session ended.", "closed");
        }
        return client;
      });
      const client = await Promise.race([opening, cancelled]);
      if (epoch !== this.#epoch) {
        client.close();
        throw new ProtocolError("The password session ended.", "closed");
      }
      this.#openingTransport = undefined;
      this.#cancelOpen = undefined;
      client.onStateChange((state) => {
        if (epoch !== this.#epoch || this.#client !== client) return;
        if (state !== "unlocked" && state !== "closed" && this.#status.state === "unlocked") {
          this.lock();
          return;
        }
        if (state === "closed") {
          this.#epoch++;
          if (this.#client === client) this.#client = undefined;
          this.#set(
            closeError && MISSING_HOST.test(closeError) ? { state: "no-helper", error: closeError } : { state },
          );
        } else {
          this.#set({ state });
        }
      });
      this.#client = client;
      this.#set({ state: client.state });
      return client;
    } catch (error) {
      if (epoch !== this.#epoch) throw new ProtocolError("The password session ended.", "closed");
      this.#openingTransport = undefined;
      this.#cancelOpen = undefined;
      const reason = closeError ?? message(error);
      this.#set(
        MISSING_HOST.test(reason) ? { state: "no-helper", error: reason } : { state: "disconnected", error: reason },
      );
      throw error;
    }
  }

  async #track<T>(client: ApplePasswordsClient, operation: Promise<T>): Promise<T> {
    try {
      const result = await operation;
      return result;
    } catch (error) {
      if (this.#client === client) this.#set({ state: client.state, error: message(error) });
      throw error;
    }
  }

  #set(status: SessionStatus): void {
    this.#status = status;
    for (const listener of this.#listeners) listener(status);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
