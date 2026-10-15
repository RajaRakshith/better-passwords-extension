// Apple's helper saves a login in the background once the user clicks Save in macOS's prompt,
// and never reports back. The only way to know is to look the login up until it appears.

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
}

/**
 * Resolves true once the site's usernames show the save, false on timeout or abort. Lookup errors
 * are retried. `before` is the list from before the save: a login without a username may not be
 * listed as such, so for an empty username one more login also counts.
 */
export async function waitForLogin(
  lookup: () => Promise<string[]>,
  username: string,
  before: string[],
  { timeoutMs = 120_000, intervalMs = 1_000, signal }: WaitOptions = {},
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!signal?.aborted && Date.now() < deadline) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, intervalMs);
      const stop = () => {
        clearTimeout(timer);
        resolve();
      };
      signal?.addEventListener("abort", stop, { once: true });
    });
    if (signal?.aborted) return false;
    const usernames = await lookup().catch(() => undefined);
    if (!usernames) continue;
    if (usernames.includes(username)) return true;
    if (username === "" && usernames.length > before.length) return true;
  }
  return false;
}
