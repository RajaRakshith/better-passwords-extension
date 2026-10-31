import { describe, expect, it } from "vitest";
import { idleDetectionSeconds, updateBreakState } from "../src/session/idle-integration.ts";
import { OVERDUE_MS, PendingUpdate } from "../src/updates.ts";

describe("session idle and update policy independence", () => {
  it("does not interpret five-minute idle as a one-hour update break", async () => {
    let now = 0;
    let restarts = 0;
    const update = new PendingUpdate({
      now: () => now,
      busy: () => true,
      restart: () => {
        restarts++;
      },
    });
    update.available("2.0.0");
    now = OVERDUE_MS;
    const isBreak = await updateBreakState(async (seconds) => (seconds < 3600 ? "idle" : "active"));
    if (update.overdue && isBreak) update.apply();
    expect(restarts).toBe(0);
    expect(idleDetectionSeconds(5)).toBe(300);
    expect(idleDetectionSeconds(0)).toBe(3600);
  });
  it.each(["idle", "locked"] as const)("accepts an actual one-hour idle or locked break: %s", async (state) => {
    expect(await updateBreakState(async (seconds) => (seconds === 3600 ? state : "active"))).toBe(true);
  });
});
