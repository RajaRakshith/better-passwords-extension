import { choose, expect, menuFrame, PAIRING_CODE, test } from "./fixtures.ts";

test("unlocks from the inline menu and fills the form", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#pass").click();

  // locked: the menu offers to unlock, and the code is typed inside the extension's own frame
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to fill passwords");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);

  await choose(menu, "e2e-user");
  await expect(page.locator("#user")).toHaveValue("e2e-user");
  await expect(page.locator("#pass")).toHaveValue("e2e-pass");
  await expect(page.locator("#newsletter-email")).toHaveValue("");
  // filled and done: no field is left focused
  await expect(page.locator("#pass")).not.toBeFocused();
  await expect(page.locator("#user")).not.toBeFocused();
});

test("moving to the next field opens a fresh menu that still fills", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#user").click();
  let menu = await menuFrame(page);
  await choose(menu, "Unlock to fill passwords");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  await expect(menu.getByText("e2e-user")).toBeVisible();

  // Tab to the password field: the old frame is replaced, so the menu gets its full height back
  // and a new nonce that the content script accepts
  const first = menu;
  await page.locator("#user").focus();
  await page.keyboard.press("Tab");
  await expect.poll(() => page.frames().some((f) => f.url().includes("/menu.html#") && f !== first)).toBe(true);
  menu = await menuFrame(page);
  await expect(menu.getByText("Open Passwords…")).toBeVisible();
  const height = await page.locator("app-autofill-menu").evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThan(70);

  await choose(menu, "e2e-user");
  await expect(page.locator("#pass")).toHaveValue("e2e-pass");
});

test("arrow keys move between the field and the menu", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#pass").click();
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to fill passwords");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  await expect(menu.getByText("e2e-user")).toBeVisible();

  await page.locator("#pass").focus();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("option", { name: /e2e-user/ })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#pass")).toBeFocused();
  // the menu stays open, and ↓ goes back into it
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("option", { name: /e2e-user/ })).toBeFocused();
});

test("opens the Passwords app for the current site", async ({ context, siteUrl, passwordsAppLaunches }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#pass").click();
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to fill passwords");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);

  await choose(menu, "Open Passwords…");
  await expect.poll(passwordsAppLaunches).toEqual([siteUrl]);
  await expect.poll(() => page.locator("app-autofill-menu").count()).toBe(0);
});

test("Escape closes the menu and keeps it closed until the user asks again", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#pass").click();
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to fill passwords");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  await expect(menu.getByText("e2e-user")).toBeVisible();

  await page.locator("#pass").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.locator("#pass")).toBeFocused();
  await page.waitForTimeout(300);
  expect(await page.locator("app-autofill-menu").count()).toBe(0);

  // ↓ in the field brings it back
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => page.locator("app-autofill-menu").count()).toBe(1);
});

test("stays away from fields that aren't for logging in", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#newsletter-email").click();
  await page.waitForTimeout(500);
  expect(page.frames().some((f) => f.url().includes("/menu.html"))).toBe(false);
});

test("refuses to fill when the page makes the menu transparent", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#pass").click();
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to fill passwords");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  await expect(menu.getByText("e2e-user")).toBeVisible();

  // a clickjacking page fades everything out, hoping the user clicks blindly
  await page.evaluate(() => {
    document.documentElement.style.opacity = "0.1";
  });
  await menu.getByText("e2e-user").click({ force: true });
  await page.waitForTimeout(500);
  await expect(page.locator("#pass")).toHaveValue("");
});

test("ignores a copy of the menu framed by the page itself", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  // unlock through the real menu first, so a fill would otherwise succeed
  await page.locator("#pass").click();
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to fill passwords");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  await expect(menu.getByText("e2e-user")).toBeVisible();

  // the page embeds menu.html on its own, with a made-up nonce
  const menuUrl = menu.url().split("#")[0];
  await page.evaluate((url) => {
    const frame = document.createElement("iframe");
    frame.src = `${url}#nonce=forged&mode=logins`;
    frame.id = "forged";
    document.body.append(frame);
  }, menuUrl);
  await expect(page.frameLocator("#forged").getByText("e2e-user")).toBeVisible();

  // Even if a click there got through, the fill is refused: the content script only answers the
  // nonce of the menu it opened itself. Send the request as an accepted click would.
  const forged = page.frames().find((f) => f.url().includes("nonce=forged"));
  const reply = await forged?.evaluate(() => {
    type Runtime = { runtime: { sendMessage(message: unknown): Promise<unknown> } };
    const { chrome } = globalThis as unknown as { chrome: Runtime };
    return chrome.runtime.sendMessage({ type: "fill-from-menu", nonce: "forged", username: "e2e-user" });
  });
  expect(reply).toEqual({ ok: true, value: { result: "menu-hidden" } });
  await expect(page.locator("#pass")).toHaveValue("");
});

test("a long list of logins scrolls inside the menu", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#pass").click();
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to fill passwords");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  await expect(menu.getByText("e2e-user")).toBeVisible();
  // make the list longer than the menu's cap, as on a site with many saved logins
  await menu.evaluate(() => {
    const panel = document.getElementById("menu") as HTMLElement;
    const row = panel.querySelector(".row") as HTMLElement;
    for (let i = 0; i < 15; i++) panel.prepend(row.cloneNode(true));
  });
  const scrolled = await menu.evaluate(async () => {
    const panel = document.getElementById("menu") as HTMLElement;
    panel.scrollTop = 200;
    return { scrollTop: panel.scrollTop, overflows: panel.scrollHeight > panel.clientHeight };
  });
  expect(scrolled.overflows).toBe(true);
  expect(scrolled.scrollTop).toBeGreaterThan(0);
});
