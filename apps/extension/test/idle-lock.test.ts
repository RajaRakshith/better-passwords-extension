import { describe, expect, it } from "vitest";
import { IdleLock } from "../src/session/idle-lock.ts";

function setup() {
  const state = {
    now: 0,
    unlocked: true,
    idle: "active" as "active" | "idle" | "locked",
    locks: 0,
    seconds: [] as number[],
  };
  const policy = new IdleLock({
    now: () => state.now,
    isUnlocked: () => state.unlocked,
    lock: () => {
      state.unlocked = false;
      state.locks++;
    },
    queryState: async (seconds) => {
      state.seconds.push(seconds);
      return state.idle;
    },
  });
  return { state, policy };
}

describe("system inactivity locking", () => {
  it("locks when the OS reports the configured inactivity threshold", async () => {
    const { state, policy } = setup();
    await policy.configure(15);
    state.idle = "idle";
    await policy.onStateChanged("idle");
    expect(state.locks).toBe(1);
    expect(state.seconds).toEqual([900, 900]);
    await policy.check();
    expect(state.locks).toBe(1);
  });

  it("Never keeps the session paired even over long observation gaps", async () => {
    const { state, policy } = setup();
    await policy.configure(0);
    state.now = 3_600_000;
    state.idle = "idle";
    await policy.beforeAccess();
    expect(state.unlocked).toBe(true);
    expect(state.seconds).toEqual([]);
  });

  it("checks a system that is already idle at unlock or reconfiguration", async () => {
    for (const action of ["unlock", "configure"]) {
      const { state, policy } = setup();
      state.idle = "idle";
      if (action === "unlock") await policy.onUnlocked();
      else await policy.configure(5);
      expect(state.locks).toBe(1);
    }
  });

  it("refuses access after sleep hides an idle transition", async () => {
    const { state, policy } = setup();
    await policy.onUnlocked();
    state.now = 900_001;
    await expect(policy.beforeAccess()).rejects.toThrow();
    expect(state.locks).toBe(1);
  });

  it("periodic active samples keep normal use unlocked", async () => {
    const { state, policy } = setup();
    await policy.onUnlocked();
    for (let i = 0; i < 40; i++) {
      state.now += 30_000;
      await policy.check();
    }
    expect(state.unlocked).toBe(true);
  });

  it("fails closed when the OS idle state cannot be checked", async () => {
    let unlocked = true;
    const policy = new IdleLock({
      now: () => 0,
      isUnlocked: () => unlocked,
      lock: () => {
        unlocked = false;
      },
      queryState: async () => {
        throw new Error("unavailable");
      },
    });
    await expect(policy.beforeAccess()).rejects.toThrow();
    expect(unlocked).toBe(false);
  });

  it("ignores an idle answer from an obsolete configuration", async () => {
    let answer: (value: "idle") => void = () => {};
    let unlocked = true;
    const policy = new IdleLock({
      now: () => 0,
      isUnlocked: () => unlocked,
      lock: () => {
        unlocked = false;
      },
      queryState: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    });
    const old = policy.check();
    await policy.configure(0);
    answer("idle");
    await old;
    expect(unlocked).toBe(true);
  });

  it("waits for the current inactivity policy before granting access", async () => {
    const answers: Array<(state: "active" | "idle") => void> = [];
    let unlocked = true;
    const policy = new IdleLock({
      now: () => 0,
      isUnlocked: () => unlocked,
      lock: () => {
        unlocked = false;
      },
      queryState: () => new Promise((resolve) => answers.push(resolve)),
    });
    const oldCheck = policy.check();
    let outcome = "pending";
    const access = policy.beforeAccess().then(
      () => {
        outcome = "granted";
      },
      () => {
        outcome = "denied";
      },
    );
    const reconfigure = policy.configure(5);
    expect(answers).toHaveLength(2);
    answers[0]?.("idle");
    await oldCheck;
    await Promise.resolve();
    const outcomeBeforeCurrentAnswer = outcome;
    answers[1]?.("idle");
    await Promise.all([reconfigure, access]);
    expect(outcomeBeforeCurrentAnswer).toBe("pending");
    expect(outcome).toBe("denied");
    expect(unlocked).toBe(false);
  });

  it("refuses access if the wall clock moves backwards", async () => {
    const { state, policy } = setup();
    state.now = 1000;
    await policy.onUnlocked();
    state.now = 0;
    await expect(policy.beforeAccess()).rejects.toThrow();
    expect(state.unlocked).toBe(false);
  });
});
