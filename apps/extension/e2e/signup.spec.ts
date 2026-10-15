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
