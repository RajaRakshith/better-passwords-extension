// Apple's helper saves a login in the background once the user clicks Save in macOS's prompt,
// and never reports back. The only way to know is to look the login up until it appears.

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
}

/** Resolves true once `lookup` lists `username`, false on timeout or abort. Lookup errors are retried. */
export async function waitForLogin(
  lookup: () => Promise<string[]>,
  username: string,
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
    if (usernames?.includes(username)) return true;
  }
  return false;
}
