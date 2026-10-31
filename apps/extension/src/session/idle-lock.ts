import { ProtocolError } from "@app/protocol";
import type { IdleTimeoutMinutes } from "../messages.ts";

type IdleState = "active" | "idle" | "locked";
interface IdleDeps {
  queryState(seconds: number): Promise<IdleState>;
  lock(): void;
  isUnlocked(): boolean;
  now(): number;
}

/** Browser system-idle checks plus conservative expiry after a missed observation interval. */
export class IdleLock {
  #minutes: IdleTimeoutMinutes = 15;
  #generation = 0;
  #lastObserved: number | undefined;
  #lockedSince: number | undefined;
  #checking: Promise<void> | undefined;

  constructor(private readonly deps: IdleDeps) {}

  async configure(minutes: IdleTimeoutMinutes): Promise<void> {
    this.#minutes = minutes;
    this.#generation++;
    this.#checking = undefined;
    this.#lastObserved = this.deps.now();
    this.#lockedSince = undefined;
    await this.check();
  }

  async onUnlocked(): Promise<void> {
    this.#generation++;
    this.#checking = undefined;
    this.#lastObserved = this.deps.now();
    this.#lockedSince = undefined;
    await this.check();
  }

  async onStateChanged(_state: IdleState): Promise<void> {
    await this.check();
  }

  check(): Promise<void> {
    if (!this.deps.isUnlocked() || this.#minutes === 0) return Promise.resolve();
    if (this.#checking) return this.#checking;
    const generation = this.#generation;
    const interval = this.#minutes * 60_000;
    const pending = this.#observe(generation, interval).finally(() => {
      if (this.#checking === pending) this.#checking = undefined;
    });
    this.#checking = pending;
    return pending;
  }

  async #observe(generation: number, interval: number): Promise<void> {
    try {
      const state = await this.deps.queryState(interval / 1000);
      if (generation !== this.#generation || !this.deps.isUnlocked()) return;
      const now = this.deps.now();
      const gap = this.#lastObserved === undefined ? 0 : now - this.#lastObserved;
      this.#lastObserved = now;
      if (state === "locked") this.#lockedSince ??= now;
      else this.#lockedSince = undefined;
      if (
        gap < 0 ||
        gap >= interval ||
        state === "idle" ||
        (this.#lockedSince !== undefined && now - this.#lockedSince >= interval)
      ) {
        this.deps.lock();
      }
    } catch (error) {
      if (generation !== this.#generation || !this.deps.isUnlocked()) return;
      this.deps.lock();
      throw error;
    }
  }

  async beforeAccess(): Promise<void> {
    await this.check();
    if (!this.deps.isUnlocked()) throw new ProtocolError("The password session ended. Unlock again.", "closed");
  }
}
