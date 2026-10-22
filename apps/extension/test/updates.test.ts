import { describe, expect, it } from "vitest";
import { OVERDUE_MS, PendingUpdate } from "../src/updates.ts";

function setup(busy: boolean) {
  const state = { busy, restarts: 0, now: 0 };
  const update = new PendingUpdate({
    busy: () => state.busy,
    restart: () => state.restarts++,
    now: () => state.now,
  });
  return { state, update };
}

describe("PendingUpdate", () => {
  it("installs right away when nothing would be lost", () => {
    const { state, update } = setup(false);
    update.available("2.0.0");
    expect(state.restarts).toBe(1);
  });

  it("waits while unlocked, then installs once the session ends", () => {
    const { state, update } = setup(true);
    update.available("2.0.0");
    expect(state.restarts).toBe(0);
    expect(update.version).toBe("2.0.0");
    expect(update.applyIfHarmless()).toBe(false);
    state.busy = false;
    expect(update.applyIfHarmless()).toBe(true);
    expect(state.restarts).toBe(1);
  });

  it("installs when the user asks, even while unlocked", () => {
    const { state, update } = setup(true);
    update.available("2.0.0");
    update.apply();
    expect(state.restarts).toBe(1);
  });

  it("does nothing without a waiting version", () => {
    const { state, update } = setup(false);
    expect(update.applyIfHarmless()).toBe(false);
    update.apply();
    expect(state.restarts).toBe(0);
  });

  it("is overdue after a day of waiting, counted from the first version seen", () => {
    const { state, update } = setup(true);
    update.available("2.0.0");
    state.now = OVERDUE_MS - 1;
    update.available("2.0.1");
    expect(update.overdue).toBe(false);
    state.now = OVERDUE_MS;
    expect(update.overdue).toBe(true);
    expect(update.version).toBe("2.0.1");
  });
});
