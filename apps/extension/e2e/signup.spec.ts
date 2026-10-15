import { choose, expect, menuFrame, PAIRING_CODE, test } from "./fixtures.ts";

test("suggests a strong password, saves it, then fills it", async ({ context, siteUrl, helperSaves }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  await page.locator("#email").fill("new-user@example.com");
  await page.locator("#new").click();

  const menu = await menuFrame(page);
  await choose(menu, "Unlock to suggest a strong password");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  const preview = await menu.locator(".password").first().textContent();
  expect(preview).toMatch(/^[a-zA-Z0-9]{6}-[a-zA-Z0-9]{6}-[a-zA-Z0-9]{6}$/);
  await choose(menu, "Strong Password");

  // the fake helper "clicked Save" in macOS's prompt; only then is the password filled in
  await expect(page.locator("#new")).toHaveValue(preview ?? "");
  await expect(page.locator("#confirm")).toHaveValue(preview ?? "");
  expect(helperSaves()).toEqual([{ hostname: "localhost", username: "new-user@example.com", password: preview }]);

  // back in either field, the menu says it's saved instead of offering new passwords
  await page.locator("#email").click();
  await page.locator("#confirm").click();
  await expect((await menuFrame(page)).getByText("Strong Password Saved")).toBeVisible();

  // a different email when submitting is saved too
  await page.locator("#email").fill("renamed@example.com");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect
    .poll(() => helperSaves().map((save) => save.username))
    .toEqual(["new-user@example.com", "renamed@example.com"]);
});

test("offers passwords without special characters", async ({ context, siteUrl, helperSaves }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  await page.locator("#new").click();
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to suggest a strong password");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  const preview = await menu.locator(".password").nth(1).textContent();
  expect(preview).toMatch(/^[a-zA-Z0-9]{20}$/);
  await choose(menu, "Without Special Characters");
  await expect(page.locator("#new")).toHaveValue(preview ?? "");
  // no email typed yet: saved without a username, which the helper allows
  expect(helperSaves()).toEqual([{ hostname: "localhost", username: "", password: preview }]);
});

test("never offers new passwords on a login form", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#pass").click();
  const menu = await menuFrame(page);
  await expect(menu.getByText("Unlock to fill passwords")).toBeVisible();
});

test("replacing a saved password fills it once the user confirms", async ({ context, siteUrl, helperSaves }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  // e2e-user already has a saved password for this site
  await page.locator("#email").fill("e2e-user");
  await page.locator("#new").click();
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to suggest a strong password");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  const preview = await menu.locator(".password").first().textContent();
  await choose(menu, "Strong Password");

  await expect(menu.getByText("This replaces your saved password")).toBeVisible();
  expect(helperSaves()).toEqual([{ hostname: "localhost", username: "e2e-user", password: preview }]);
  await expect(page.locator("#new")).toHaveValue("");
  await choose(menu, "I Updated It, Fill It In");
  await expect(page.locator("#new")).toHaveValue(preview ?? "");
});

test.describe("when the user doesn't save", () => {
  test.use({ declineSaves: true });

  test("nothing is filled, the wait survives reopening the menu, and Cancel ends it", async ({ context, siteUrl }) => {
    const page = await context.newPage();
    await page.goto(`${siteUrl}/signup.html`);
    await page.locator("#email").fill("new-user@example.com");
    await page.locator("#new").click();
    let menu = await menuFrame(page);
    await choose(menu, "Unlock to suggest a strong password");
    await menu.getByLabel("Verification code").fill(PAIRING_CODE);
    await choose(menu, "Strong Password");
    await expect(menu.getByText("Click Save in the dialog on your Mac")).toBeVisible();

    // leave the field and come back: still waiting
    await page.locator("#email").click();
    await page.locator("#new").click();
    menu = await menuFrame(page);
    await expect(menu.getByText("Click Save in the dialog on your Mac")).toBeVisible();

    await choose(menu, "Cancel");
    await expect(menu.getByText("Strong Password").first()).toBeVisible();
    await expect(page.locator("#new")).toHaveValue("");
  });
});

test("typing a password of one's own closes the suggestions", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  await page.locator("#new").click();
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to suggest a strong password");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  await expect(menu.getByText("Without Special Characters")).toBeVisible();
  await page.locator("#new").focus();
  await page.keyboard.type("my own password");
  await expect.poll(() => page.locator("app-autofill-menu").count()).toBe(0);
  // and it stays closed for that field
  await page.locator("#email").click();
  await page.locator("#new").click();
  await page.waitForTimeout(500);
  expect(await page.locator("app-autofill-menu").count()).toBe(0);
});
