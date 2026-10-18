// Routes that aren't files. Requests for files in this folder never reach it (see wrangler.jsonc).
//   /download/mac   the newest companion app zip, wherever its release lives

const REPO = "fanckush/better-passwords-extension";
const RELEASES = `https://github.com/${REPO}/releases`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/download/mac") return downloadMac(url, ctx);
    return env.ASSETS.fetch(request);
  },
};

// GitHub's releases/latest is the extension's, so look up the newest companion-v* release. The answer
// is cached for a few minutes: unauthenticated GitHub API calls are rate limited.
async function downloadMac(url, ctx) {
  const key = new Request(url.origin + url.pathname);
  const cached = await caches.default.match(key);
  if (cached) return cached;

  const zip = await latestCompanionZip().catch(() => undefined);
  // no release yet, or GitHub is unreachable: the release list is the next best place
  if (!zip) return Response.redirect(RELEASES, 302);

  const response = new Response(null, {
    status: 302,
    headers: { Location: zip, "Cache-Control": "public, max-age=600" },
  });
  ctx.waitUntil(caches.default.put(key, response.clone()));
  return response;
}

async function latestCompanionZip() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=50`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "betterpasswords.app" },
  });
  if (!res.ok) return undefined;
  const release = (await res.json()).find((r) => !r.draft && !r.prerelease && r.tag_name.startsWith("companion-v"));
  return release?.assets.find((a) => a.name.endsWith("-mac.zip"))?.browser_download_url;
}
