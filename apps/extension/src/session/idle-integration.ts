import type { IdleTimeoutMinutes } from "../messages.ts";

export function idleDetectionSeconds(minutes: IdleTimeoutMinutes): number {
  return minutes === 0 ? 3600 : minutes * 60;
}

/** Update timing is independent of the user's session-lock threshold. */
export async function updateBreakState(
  queryState: (seconds: number) => Promise<"active" | "idle" | "locked">,
): Promise<boolean> {
  return (await queryState(3600)) !== "active";
}
