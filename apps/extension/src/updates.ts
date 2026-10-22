// A new version of the extension that the browser has downloaded. The browser installs it once the
// extension is idle, and ours never is: it keeps Apple's helper connected so the session lasts. So
// we restart the extension ourselves, but only when that costs the user nothing (no unlocked session
// to lose), or when they ask for it, or after a day of waiting, when they've stepped away.

/** How long an update may wait for a harmless moment before the user's next break will do. */
export const OVERDUE_MS = 24 * 60 * 60_000;

export interface UpdateDeps {
  /** Whether restarting now would end something: an unlocked session, or a code on screen. */
  busy: () => boolean;
  /** Restarts the extension, which installs the waiting version. */
  restart: () => void;
  now?: () => number;
}

export class PendingUpdate {
  #version: string | undefined;
  #since = 0;

  constructor(private readonly deps: UpdateDeps) {}

  /** The waiting version, if any. */
  get version(): string | undefined {
    return this.#version;
  }

  /** Waiting long enough that the user's next break (screen lock, time away) is the moment. */
  get overdue(): boolean {
    return this.#version !== undefined && this.#now() - this.#since >= OVERDUE_MS;
  }

  /** The browser downloaded `version`: installs it now if that's harmless. */
  available(version: string): void {
    if (this.#version === undefined) this.#since = this.#now();
    this.#version = version;
    this.applyIfHarmless();
  }

  /** Installs the waiting version if nothing would be lost; call whenever the session changes. */
  applyIfHarmless(): boolean {
    if (this.#version === undefined || this.deps.busy()) return false;
    this.deps.restart();
    return true;
  }

  /** The user asked for it. */
  apply(): void {
    if (this.#version !== undefined) this.deps.restart();
  }

  #now(): number {
    return (this.deps.now ?? Date.now)();
  }
}
