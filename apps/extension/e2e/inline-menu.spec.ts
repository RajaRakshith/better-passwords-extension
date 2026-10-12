import { expect, menuFrame, PAIRING_CODE, test } from "./fixtures.ts";

test("unlocks from the inline menu and fills the form", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#pass").click();

  // locked: the menu offers to unlock, and the code is typed inside the extension's own frame
  const menu = await menuFrame(page);
  await menu.getByText("Unlock to fill passwords").click();
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);

  await menu.getByText("e2e-user").click();
  await expect(page.locator("#user")).toHaveValue("e2e-user");
  await expect(page.locator("#pass")).toHaveValue("e2e-pass");
  await expect(page.locator("#newsletter-email")).toHaveValue("");
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
  await menu.getByText("Unlock to fill passwords").click();
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
  await menu.getByText("Unlock to fill passwords").click();
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
