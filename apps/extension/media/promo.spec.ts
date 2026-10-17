import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, test } from "@playwright/test";

const mediaDir = resolve(import.meta.dirname, "../../../docs/images/store");

test("render store promotional artwork at the exact upload sizes", async () => {
  const browser = await chromium.launch({
    executablePath: process.env.STORE_MEDIA_BROWSER_EXECUTABLE ?? "/Applications/Helium.app/Contents/MacOS/Helium",
    headless: true,
  });
  try {
    mkdirSync(mediaDir, { recursive: true });
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.route("https://promo.example/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const file =
        path === "/icon.svg"
          ? resolve(import.meta.dirname, "../assets/icon.svg")
          : path === "/screenshot.png"
            ? resolve(mediaDir, "01-inline-signin-light.png")
            : resolve(import.meta.dirname, "promo.html");
      await route.fulfill({
        contentType: path === "/icon.svg" ? "image/svg+xml" : path === "/screenshot.png" ? "image/png" : "text/html",
        body: readFileSync(file),
      });
    });
    for (const [name, width, height] of [
      ["06-small-promo-tile", 440, 280],
      ["07-marquee-promo-tile", 1400, 560],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("https://promo.example/");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: resolve(mediaDir, `${name}.png`), omitBackground: false });
    }
  } finally {
    await browser.close();
  }
});
