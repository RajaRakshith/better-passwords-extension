// Which pages may receive credentials. Fills target only the page the user is on, matched by origin.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Returns the URL if passwords may be listed and filled on it, otherwise undefined. */
export function fillableUrl(rawUrl: string | undefined): URL | undefined {
  if (!rawUrl) return undefined;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (url.protocol === "https:") return url;
  // plain http only for local development servers
  if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return url;
  return undefined;
}
