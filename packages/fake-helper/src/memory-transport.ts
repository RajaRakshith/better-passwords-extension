import type { HelperMessage, Transport } from "@app/protocol";
import type { FakeHelper } from "./fake-helper.ts";

/** In-process transport wired straight to a FakeHelper, for unit tests. */
export class MemoryTransport implements Transport {
  readonly sent: unknown[] = [];
  #onMessage: (message: HelperMessage) => void = () => {};
  #onClose: (error?: string) => void = () => {};
  #open = true;

  constructor(readonly helper: FakeHelper) {}

  send(message: unknown): void {
    if (!this.#open) throw new Error("port closed");
    this.sent.push(message);
    // clone like a real port would, and answer asynchronously
    const copy = structuredClone(message) as HelperMessage;
    void this.helper.handle(copy).then((replies) => {
      for (const reply of replies) if (this.#open) this.#onMessage(structuredClone(reply));
    });
  }

  /** Delivers an unsolicited message from the helper. */
  push(message: HelperMessage): void {
    this.#onMessage(message);
  }

  onMessage(listener: (message: HelperMessage) => void): void {
    this.#onMessage = listener;
  }

  onClose(listener: (error?: string) => void): void {
    this.#onClose = listener;
  }

  close(): void {
    this.#open = false;
  }

  /** Simulates the helper process exiting. */
  kill(error = "Native host has exited."): void {
    this.#open = false;
    this.#onClose(error);
  }
}
