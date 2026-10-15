import type { BrowserContext, Frame } from "@playwright/test";
import { choose, expect, menuFrame, test } from "./fixtures.ts";

/** A fake icloud.com for the extension's background, recording what it was asked. */
async function fakeICloud(
  context: BrowserContext,
  { signedIn = true, existing }: { signedIn?: boolean; existing?: string } = {},
) {
  const seen: { path: string; origin: string | undefined; body?: unknown }[] = [];
  let generated = 0;
  await context.route(/https:\/\/[^/]*icloud\.com\//, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    seen.push({ path: pathname, origin: request.headers().origin, body: request.postDataJSON?.() ?? undefined });
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (pathname === "/setup/ws/1/validate") {
      return signedIn
        ? json({
            webservices: { premiummailsettings: { url: "https://p1-maildomainws.icloud.com", status: "active" } },
          })
        : json({ success: false }, 421);
    }
    if (pathname === "/v2/hme/list") {
      const hmeEmails = existing ? [{ hme: existing, label: "localhost", isActive: true }] : [];
      return json({ success: true, result: { hmeEmails } });
    }
    if (pathname === "/v1/hme/generate")
      return json({ success: true, result: { hme: `fresh${++generated}@icloud.com` } });
    if (pathname === "/v1/hme/reserve") {
      const { hme } = request.postDataJSON() as { hme: string };
      return json({ success: true, result: { hme: { hme } } });
    }
    return route.fulfill({ status: 404 });
  });
  return seen;
}

async function emailMenu(page: import("@playwright/test").Page): Promise<Frame> {
  await page.locator("#email").click();
  return menuFrame(page);
}

test("advertises Hide My Email on sign-up email fields until dismissed", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  const menu = await emailMenu(page);
  await expect(menu.getByText("Use Hide My Email")).toBeVisible();
  // the ✕ dismisses the hint for good, without turning Hide My Email on
  await page.waitForTimeout(500);
  await menu.getByRole("button", { name: "Don't show again" }).click();
  await expect.poll(() => page.locator("app-autofill-menu").count()).toBe(0);
  await page.locator("#new").click();
  await page.locator("#email").click();
  await page.waitForTimeout(800);
  expect(await page.locator("app-autofill-menu").count()).toBe(0);
});

test("never on login forms", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#newsletter-email").click();
  await page.waitForTimeout(800);
  expect(await page.locator("app-autofill-menu").count()).toBe(0);
});

test("turned on from the hint, creates an address for the site and fills it in", async ({ context, siteUrl }) => {
  const seen = await fakeICloud(context);
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  const menu = await emailMenu(page);
  await choose(menu, "Use Hide My Email");
  await choose(menu, "Hide My Email…");
  await expect(menu.getByText("fresh1@icloud.com")).toBeVisible();
  await choose(menu, "Try Another");
  await choose(menu, "fresh2@icloud.com");
  await expect(page.locator("#email")).toHaveValue("fresh2@icloud.com");

  const reserve = seen.find((call) => call.path === "/v1/hme/reserve");
  expect(reserve?.body).toEqual({
    hme: "fresh2@icloud.com",
    label: "localhost",
    note: "Created by Apple Passwords Plus",
  });
});

test("offers the address made for this site before", async ({ context, siteUrl }) => {
  const seen = await fakeICloud(context, { existing: "kept@icloud.com" });
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  let menu = await emailMenu(page);
  await choose(menu, "Use Hide My Email");
  await expect(menu.getByText("kept@icloud.com")).toBeVisible();
  await choose(menu, "kept@icloud.com");
  await expect(page.locator("#email")).toHaveValue("kept@icloud.com");
  expect(seen.some((call) => call.path === "/v1/hme/reserve")).toBe(false);

  // on from now on: no hint, straight to the address
  await page.locator("#new").click();
  menu = await emailMenu(page);
  await expect(menu.getByText("kept@icloud.com")).toBeVisible();
});

test("asks to sign in to iCloud when the browser isn't", async ({ context, siteUrl }) => {
  await fakeICloud(context, { signedIn: false });
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  const menu = await emailMenu(page);
  await choose(menu, "Use Hide My Email");
  await expect(menu.getByText("Sign In to iCloud for Hide My Email")).toBeVisible();
});

test("the iCloud header rule exists only while Hide My Email is on", async ({ context, siteUrl, popupUrl }) => {
  await fakeICloud(context);
  const [worker] = context.serviceWorkers();
  const rules = () =>
    (worker ?? context.serviceWorkers()[0])?.evaluate(async () => {
      type DNR = { declarativeNetRequest: { getSessionRules(): Promise<{ condition: unknown }[]> } };
      return (globalThis as unknown as { chrome: DNR }).chrome.declarativeNetRequest.getSessionRules();
    });
  expect(await rules()).toEqual([]);

  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  await choose(await emailMenu(page), "Use Hide My Email");
  await expect.poll(rules).toEqual([
    expect.objectContaining({
      condition: { requestDomains: ["icloud.com"], tabIds: [-1], resourceTypes: ["xmlhttprequest"] },
    }),
  ]);

  // turned off (as the popup's toggle does): the rule goes
  const popup = await context.newPage();
  await popup.goto(popupUrl);
  await popup.evaluate(() => {
    type Runtime = { runtime: { sendMessage(message: unknown): Promise<unknown> } };
    const { chrome } = globalThis as unknown as { chrome: Runtime };
    return chrome.runtime.sendMessage({ type: "set-settings", settings: { hideMyEmail: false } });
  });
  await expect.poll(rules).toEqual([]);
});
