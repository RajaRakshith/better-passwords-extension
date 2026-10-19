// Routes that aren't files. Requests for files in this folder never reach it (see wrangler.jsonc).
//   /download/mac              the newest companion app disk image, wherever its release lives
//   /companion/appcast.xml     that release's Sparkle appcast, which the app checks for updates

const REPO = "fanckush/better-passwords-extension";
const RELEASES = `https://github.com/${REPO}/releases`;
/** GitHub is asked at most this often per route; unauthenticated API calls are rate limited. */
const CACHE_SECONDS = 600;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/download/mac") return cached(url, ctx, downloadMac);
    if (url.pathname === "/companion/appcast.xml") return cached(url, ctx, appcast);
    return env.ASSETS.fetch(request);
  },
};

async function cached(url, ctx, respond) {
  const key = new Request(url.origin + url.pathname);
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const response = await respond();
  if (response.headers.has("Cache-Control")) ctx.waitUntil(caches.default.put(key, response.clone()));
  return response;
}

async function downloadMac() {
  const release = await latestCompanionRelease().catch(() => undefined);
  // 1.0.0 shipped a zip
  const file = asset(release, "-mac.dmg") ?? asset(release, "-mac.zip");
  // no release yet, or GitHub is unreachable: the release list is the next best place
  if (!file) return Response.redirect(RELEASES, 302);
  return new Response(null, {
    status: 302,
    headers: { Location: file, "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
  });
}

// Served rather than redirected, so the address the app knows never changes. Sparkle checks the
// appcast's signature, so this copy needs no more trust than GitHub's.
async function appcast() {
  const release = await latestCompanionRelease().catch(() => undefined);
  const file = asset(release, "appcast.xml");
  const res = file ? await fetch(file).catch(() => undefined) : undefined;
  if (!res?.ok) return new Response("No appcast yet.", { status: 404 });
  return new Response(res.body, {
    headers: { "Content-Type": "application/xml", "Cache-Control": `public, max-age=${CACHE_SECONDS}` },
  });
}

function asset(release, suffix) {
  return release?.assets.find((a) => a.name.endsWith(suffix))?.browser_download_url;
}

// GitHub's releases/latest is the extension's, so look up the newest companion-v* release.
async function latestCompanionRelease() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=50`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "betterpasswords.app" },
  });
  if (!res.ok) return undefined;
  return (await res.json()).find((r) => !r.draft && !r.prerelease && r.tag_name.startsWith("companion-v"));
}
