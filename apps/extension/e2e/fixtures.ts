import { execSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { type BrowserContext, test as base, chromium } from "@playwright/test";
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
    `#!/bin/sh\nexport FAKE_HELPER_CODE=${PAIRING_CODE} FAKE_HELPER_VAULT="${vault}"\nexec "${bun}" "${fakeHelper}"\n`,
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

export const test = base.extend<{ context: BrowserContext; popupUrl: string }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture signature
  context: async ({}, use) => {
    const dir = profileWithFakeHelper();
    const context = await chromium.launchPersistentContext(join(dir, "profile"), {
      channel: "chromium",
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  },
  popupUrl: async ({ context }, use) => {
    if (context.serviceWorkers().length === 0) await context.waitForEvent("serviceworker");
    await use(`chrome-extension://${STORE_EXTENSION_ID}/popup.html`);
  },
});

export { expect } from "@playwright/test";
