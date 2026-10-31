/** A locked popup cannot be repopulated by an earlier asynchronous render. */
export class PopupView {
  #ended = false;
  constructor(
    private readonly root: HTMLElement,
    private readonly close: () => void,
  ) {}
  show(...children: Node[]): void {
    if (!this.#ended) this.root.replaceChildren(...children);
  }
  endSession(): void {
    if (this.#ended) return;
    this.#ended = true;
    this.root.replaceChildren();
    this.close();
  }
}
