import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, expect, type Page, test } from "@playwright/test";
import { choose, menuFrame, PAIRING_CODE, profileWithFakeHelper } from "../e2e/fixtures.ts";
import { EXTENSION_ID } from "../src/config.ts";

const videoDir = resolve(import.meta.dirname, "../../../docs/videos/store");
const mediaDir = resolve(import.meta.dirname, "../../../docs/images/store");
const demoHtml = readFileSync(resolve(import.meta.dirname, "demo.html"), "utf8");
const extensionPath = resolve(import.meta.dirname, "../.output/chrome-mv3");
const executable = process.env.STORE_MEDIA_BROWSER_EXECUTABLE ?? "/Applications/Helium.app/Contents/MacOS/Helium";
const origin = "https://northwind.example";

test("capture the real extension with an isolated demo vault", async () => {
  mkdirSync(mediaDir, { recursive: true });
  mkdirSync(videoDir, { recursive: true });
  const dir = profileWithFakeHelper("ok", false, "jane@example.com,jane.work@example.com", [
    { hostname: "northwind.example", username: "jane@example.com", password: "Dummy-password-01!" },
    { hostname: "northwind.example", username: "jane.work@example.com", password: "Dummy-password-02!" },
  ]);
  const context = await chromium.launchPersistentContext(resolve(dir, "profile"), {
    executablePath: executable,
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    recordVideo: { dir: resolve(dir, "recordings"), size: { width: 1280, height: 800 } },
    timeout: 20_000,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  context.setDefaultTimeout(10_000);
  try {
    // Every demo request is fulfilled locally. None reaches a website or a real iCloud account.
    await context.route(`${origin}/**`, async (route) => {
      if (new URL(route.request().url()).pathname === "/demo-icon.png") {
        return route.fulfill({ contentType: "image/png", body: readFileSync(resolve(extensionPath, "icon/128.png")) });
      }
      return route.fulfill({ contentType: "text/html", body: demoHtml });
    });
    await context.route(/https:\/\/[^/]*icloud\.com\//, async (route) => {
      const path = new URL(route.request().url()).pathname;
      const result =
        path === "/setup/ws/1/validate"
          ? { webservices: { premiummailsettings: { url: "https://p1-maildomainws.icloud.com", status: "active" } } }
          : path === "/v2/hme/list"
            ? {
                success: true,
                result: {
                  hmeEmails: [{ hme: "northwind.demo@icloud.com", label: "northwind.example", isActive: true }],
                },
              }
            : { success: false };
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(result) });
    });

    if (context.serviceWorkers().length === 0) await context.waitForEvent("serviceworker");
    const worker = context.serviceWorkers()[0];
    if (!worker) throw new Error("Extension worker did not start");
    await worker.evaluate(async () => {
      const storage = (
        globalThis as unknown as { chrome: { storage: { local: { set(value: unknown): Promise<void> } } } }
      ).chrome.storage.local;
      await storage.set({ settings: { touchId: false, companionCodeHint: false } });
    });
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
    await expect(popup.getByLabel("Verification code")).toBeVisible();
    await popup.getByLabel("Verification code").fill(PAIRING_CODE);
    await expect(popup.getByText("Open a website to see its saved passwords.")).toBeVisible();
    await popup.close();

    async function scene(name: string, dark = false): Promise<Page> {
      console.info("Store capture scene:", name);
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: dark ? "dark" : "light", reducedMotion: "reduce" });
      await page.goto(`${origin}/demo?scene=${name}${dark ? "&theme=dark" : ""}`);
      await page.bringToFront();
      return page;
    }
    async function capture(page: Page, file: string) {
      await page.mouse.move(1200, 760);
      await page.screenshot({ path: resolve(mediaDir, file), type: "png", animations: "disabled" });
      await page.close();
    }

    const signin = await scene("signin");
    await signin.locator("#email").click();
    let menu = await menuFrame(signin);
    await expect(menu.getByText("jane@example.com", { exact: true })).toBeVisible();
    await menu.getByText("jane@example.com", { exact: true }).hover();
    await capture(signin, "01-inline-signin-light.png");

    const dark = await scene("dark", true);
    await dark.locator("#email").click();
    menu = await menuFrame(dark);
    await expect(menu.getByText("jane.work@example.com", { exact: true })).toBeVisible();
    await capture(dark, "02-inline-signin-dark.png");

    const generate = await scene("generate");
    await generate.locator("#email").fill("jane@example.com");
    await generate.locator("#email").press("Tab");
    menu = await menuFrame(generate);
    await expect(menu.getByText("Strong Password", { exact: true })).toBeVisible();
    await capture(generate, "03-generate-password.png");

    const control = await context.newPage();
    await control.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
    await control.evaluate(async () => {
      const runtime = (
        globalThis as unknown as { chrome: { runtime: { sendMessage(message: unknown): Promise<unknown> } } }
      ).chrome.runtime;
      await runtime.sendMessage({ type: "set-settings", settings: { hideMyEmail: true } });
    });
    await control.close();
    const email = await scene("email");
    await email.locator("#email").click();
    menu = await menuFrame(email);
    await expect(menu.getByText("northwind.demo@icloud.com", { exact: true })).toBeVisible();
    await expect(menu.getByText("jane.work@example.com", { exact: true })).toBeVisible();
    await capture(email, "04-email-suggestions.png");

    const saved = await scene("saved");
    await saved.locator("#email").fill("new.account@example.com");
    await saved.locator("#email").press("Tab");
    menu = await menuFrame(saved);
    await choose(menu, "Strong Password");
    await saved.locator("#submit").click();
    await expect(saved.locator("#confirmation")).toBeVisible();
    await expect
      .poll(async () => {
        await saved.locator("#email").click();
        await saved.locator("#email").press("Tab");
        return (await menuFrame(saved)).getByText("Strong Password Saved", { exact: true }).isVisible();
      })
      .toBe(true);
    await capture(saved, "05-save-to-apple-passwords.png");

    const video = await scene("video");
    const recording = video.video();
    await video.waitForTimeout(1200);
    await video.mouse.move(180, 300);
    await video.mouse.move(350, 411, { steps: 30 });
    await video.locator("#email").click();
    menu = await menuFrame(video);
    await video.waitForTimeout(2000);
    await menu.getByText("jane@example.com", { exact: true }).hover();
    await video.waitForTimeout(1200);
    await choose(menu, "jane@example.com");
    await expect(video.locator("#email")).toHaveValue("jane@example.com");
    await expect(video.locator("#password")).toHaveValue("Dummy-password-01!");
    await video.waitForTimeout(2000);
    await video.locator("#password").press("Tab");
    await video.locator("#submit").press("Enter");
    await expect(video.locator("#confirmation")).toBeVisible();
    await video.waitForTimeout(2500);
    await video.close();
    await recording?.saveAs(resolve(videoDir, "signin-demo.webm"));
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
