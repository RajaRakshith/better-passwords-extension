/** Missing metadata is compatible only because the request itself has an exclusive owner. */
export function credentialSitesMatch(hostname: string, sites: unknown): boolean {
  if (sites === undefined) return true;
  if (!Array.isArray(sites) || sites.length === 0) return false;
  let matched = false;
  try {
    const expected = new URL(`https://${hostname}`).hostname;
    for (const site of sites) {
      if (typeof site !== "string" || !site || site.trim() !== site) return false;
      const url = new URL(site.includes("://") ? site : `https://${site}`);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
      if (url.hostname === expected) matched = true;
    }
  } catch {
    return false;
  }
  return matched;
}
