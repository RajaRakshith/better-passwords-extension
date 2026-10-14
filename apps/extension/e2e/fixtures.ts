import { execSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type BrowserContext, test as base, chromium, type Frame, type Page } from "@playwright/test";
import { STORE_EXTENSION_ID, STORE_HOST } from "../src/config.ts";

export const PAIRING_CODE = "246810";
const extensionPath = resolve(import.meta.dirname, "../.output/store-chrome-mv3");
const fakeHelper = resolve(import.meta.dirname, "../../../packages/fake-helper/src/main.ts");

/** Registers the fake helper as the store build's native host inside a fresh profile. */
function profileWithFakeHelper(): string {
  const dir = mkdtempSync(join(tmpdir(), "app-e2e-"));
  const vault = join(dir, "vault.json");
  writeFileSync(vault, JSON.stringify([{ hostname: "localhost", username: "e2e-user", password: "e2e-pass" }]));

  // browsers start native hosts with a minimal PATH, so call bun by absolute path
  const bun = execSync("command -v bun", { encoding: "utf8" }).trim();
  const host = join(dir, "fake-helper.sh");
  writeFileSync(
    host,
    `#!/bin/sh\nexport FAKE_HELPER_CODE=${PAIRING_CODE} FAKE_HELPER_VAULT="${vault}" FAKE_HELPER_LOG="${join(dir, "helper.log")}"\nexec "${bun}" "${fakeHelper}"\n`,
  );
  chmodSync(host, 0o755);

  mkdirSync(join(dir, "profile", "NativeMessagingHosts"), { recursive: true });
  writeFileSync(
    join(dir, "profile", "NativeMessagingHosts", `${STORE_HOST}.json`),
    JSON.stringify({
      name: STORE_HOST,
      description: "fake Apple helper for e2e tests",
      path: host,
      type: "stdio",
      allowed_origins: [`chrome-extension://${STORE_EXTENSION_ID}/`],
    }),
  );
  return dir;
}

/** The inline menu's frame. It sits in a closed shadow root, so find it among the page's frames. */
export async function menuFrame(page: Page): Promise<Frame> {
  for (let i = 0; i < 50; i++) {
    const frame = page.frames().find((f) => f.url().includes("/menu.html#"));
    if (frame) {
      // The menu ignores clicks during its first 300 ms on screen (clickjacking guard); a person
      // never clicks that fast, so neither does the test. The clock starts once it has rendered.
      await frame.waitForSelector("#menu > *");
      await page.waitForTimeout(500);
      return frame;
    }
    await page.waitForTimeout(100);
  }
  throw new Error("the inline menu did not open");
}

const profileDirs = new WeakMap<BrowserContext, string>();

type Fixtures = {
  context: BrowserContext;
  popupUrl: string;
  /** Search URLs of the requests to open the Passwords app that reached the fake helper. */
  passwordsAppLaunches: () => string[];
};

export const test = base.extend<Fixtures, { siteUrl: string }>({
  // a tiny static server for the test pages, on http://localhost (which the extension allows)
  siteUrl: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature
    async ({}, use) => {
      const pages = resolve(import.meta.dirname, "pages");
      const server = createServer((req, res) => {
        const name = (req.url ?? "/").split("?")[0]?.replace(/[^a-z0-9.-]/gi, "") || "login.html";
        let body: Buffer;
        try {
          body = readFileSync(join(pages, name));
        } catch {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { "content-type": "text/html" }).end(body);
      });
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      await use(`http://localhost:${(server.address() as AddressInfo).port}`);
      server.close();
    },
    { scope: "worker" },
  ],
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature
  context: async ({}, use) => {
    const dir = profileWithFakeHelper();
    const context = await chromium.launchPersistentContext(join(dir, "profile"), {
      channel: "chromium",
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    profileDirs.set(context, dir);
    await use(context);
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  },
  passwordsAppLaunches: async ({ context }, use) => {
    const log = join(profileDirs.get(context) ?? "", "helper.log");
    await use(() => {
      let text = "";
      try {
        text = readFileSync(log, "utf8");
      } catch {
        // nothing logged yet
      }
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => (JSON.parse(line) as { url: string }).url);
    });
  },
  popupUrl: async ({ context }, use) => {
    if (context.serviceWorkers().length === 0) await context.waitForEvent("serviceworker");
    await use(`chrome-extension://${STORE_EXTENSION_ID}/popup.html`);
  },
});

export { expect } from "@playwright/test";
