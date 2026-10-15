import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "./fixtures.ts";

// Hide My Email needs icloud.com's Origin on the background's requests to iCloud. The rule that
// sets it must never apply to a website's requests, or a site could pass its own requests off as
// icloud.com's. A site's service worker belongs to no tab, like our background, so it's the case
// to check. Playwright can't show the headers a rule sets, so a real server records them: the
// browser resolves every *.icloud.com host to it.

interface Seen {
  path: string;
  origin: string | undefined;
}

const it = test.extend<object, { icloud: { seen: Seen[]; port: number } }>({
  icloud: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature
    async ({}, use) => {
      const dir = mkdtempSync(join(tmpdir(), "app-e2e-tls-"));
      const [key, cert] = [join(dir, "key.pem"), join(dir, "cert.pem")];
      const subject = ["-subj", "/CN=icloud.com", "-keyout", key, "-out", cert];
      execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", ...subject], {
        stdio: "ignore",
      });
      const seen: Seen[] = [];
      const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
        const path = (req.url ?? "/").split("?")[0] ?? "/";
        seen.push({ path, origin: req.headers.origin });
        const json = (body: unknown) =>
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
        if (path === "/setup/ws/1/validate") {
          return json({
            webservices: { premiummailsettings: { url: "https://p1-maildomainws.icloud.com", status: "active" } },
          });
        }
        if (path === "/v2/hme/list") return json({ success: true, result: { hmeEmails: [] } });
        return json({});
      });
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      await use({ seen, port: (server.address() as AddressInfo).port });
      server.close();
      rmSync(dir, { recursive: true, force: true });
    },
    { scope: "worker" },
  ],
  browserArgs: async ({ icloud }, use) => {
    await use([`--host-resolver-rules=MAP *.icloud.com 127.0.0.1:${icloud.port}`, "--ignore-certificate-errors"]);
  },
});

it("sets icloud.com's Origin on our own requests to iCloud, never on a website's", async ({
  context,
  siteUrl,
  popupUrl,
  icloud,
}) => {
  const popup = await context.newPage();
  await popup.goto(popupUrl);
  await popup.evaluate(() => {
    type Runtime = { runtime: { sendMessage(message: unknown): Promise<unknown> } };
    const { chrome } = globalThis as unknown as { chrome: Runtime };
    return chrome.runtime.sendMessage({ type: "set-settings", settings: { hideMyEmail: true } });
  });

  // our background asks iCloud for this site's address
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  await page.locator("#email").click();
  await expect.poll(() => icloud.seen.find((r) => r.path === "/v2/hme/list")?.origin).toBe("https://www.icloud.com");

  // a website's service worker sends iCloud a request of its own
  const site = await context.newPage();
  await site.goto(`${siteUrl}/service-worker.html`);
  await site.evaluate(() =>
    (window as unknown as { requestFromWorker(url: string): Promise<void> }).requestFromWorker(
      "https://p1-maildomainws.icloud.com/v1/hme/reserve",
    ),
  );
  await expect.poll(() => icloud.seen.some((r) => r.path === "/v1/hme/reserve")).toBe(true);
  expect(icloud.seen.find((r) => r.path === "/v1/hme/reserve")?.origin).toBe(new URL(siteUrl).origin);
});
