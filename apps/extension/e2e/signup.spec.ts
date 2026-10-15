import type { Frame } from "@playwright/test";
import { choose, expect, menuFrame, PAIRING_CODE, test } from "./fixtures.ts";

/** A suggested password: hidden but for its start, shown while the eye is hovered. */
async function revealed(menu: Frame, index: number): Promise<string> {
  const detail = menu.locator(".password").nth(index);
  expect(await detail.textContent()).toMatch(/^.{3}[•-]+$/);
  // the menu resizes as it renders; hover once it has settled, as a person would
  await menu.page().waitForTimeout(500);
  await menu.locator(".reveal").nth(index).hover();
  await expect(detail).not.toContainText("•");
  return (await detail.textContent()) ?? "";
}

/** Opens the menu on the new password field and unlocks it. */
async function unlockedMenu(page: import("@playwright/test").Page): Promise<Frame> {
  await page.locator("#new").click();
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to suggest a strong password");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  return menu;
}

test("fills a strong password at once, and saves it when the form is submitted", async ({
  context,
  siteUrl,
  helperSaves,
}) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  await page.locator("#email").fill("new-user@example.com");
  const menu = await unlockedMenu(page);
  const preview = await revealed(menu, 0);
  expect(preview).toMatch(/^[a-zA-Z0-9]{6}-[a-zA-Z0-9]{6}-[a-zA-Z0-9]{6}$/);
  await choose(menu, "Strong Password");

  // like Safari: filled right away, nothing saved yet
  await expect(page.locator("#new")).toHaveValue(preview);
  await expect(page.locator("#confirm")).toHaveValue(preview);
  expect(helperSaves()).toEqual([]);
  await page.locator("#email").click();
  await page.locator("#confirm").click();
  await expect((await menuFrame(page)).getByText("You'll be asked to save it when you continue")).toBeVisible();

  // submitting asks Apple Passwords to save it, with the form's username
  await page.locator("#email").fill("renamed@example.com");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect
    .poll(helperSaves)
    .toEqual([{ hostname: "localhost", username: "renamed@example.com", password: preview }]);

  // once Apple Passwords lists it, the field says so
  await expect
    .poll(async () => {
      await page.locator("#email").click();
      await page.locator("#new").click();
      return (await menuFrame(page)).getByText("Strong Password Saved").isVisible();
    })
    .toBe(true);
});

test("offers passwords without special characters; the eye chooses like its row", async ({
  context,
  siteUrl,
  helperSaves,
}) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  const menu = await unlockedMenu(page);
  const preview = await revealed(menu, 1);
  expect(preview).toMatch(/^[a-zA-Z0-9]{20}$/);
  await menu.locator(".reveal").nth(1).click();
  await expect(page.locator("#new")).toHaveValue(preview);
  // no username in the form: macOS asks for one in its dialog when saving
  await page.getByRole("button", { name: "Create account" }).click();
  await expect.poll(helperSaves).toEqual([{ hostname: "localhost", username: "", password: preview }]);
});

test("never offers new passwords on a login form", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/login.html`);
  await page.locator("#pass").click();
  const menu = await menuFrame(page);
  await expect(menu.getByText("Unlock to fill passwords")).toBeVisible();
});

test("replacing a saved password is saved on submit and assumed done", async ({ context, siteUrl, helperSaves }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  // e2e-user already has a saved password for this site
  await page.locator("#email").fill("e2e-user");
  const menu = await unlockedMenu(page);
  const preview = await revealed(menu, 0);
  await choose(menu, "Strong Password");
  await expect(page.locator("#new")).toHaveValue(preview);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect.poll(helperSaves).toEqual([{ hostname: "localhost", username: "e2e-user", password: preview }]);
  await expect
    .poll(async () => {
      await page.locator("#email").click();
      await page.locator("#new").click();
      return (await menuFrame(page)).getByText("Strong Password Saved").isVisible();
    })
    .toBe(true);
});

test.describe("when the user doesn't save", () => {
  test.use({ declineSaves: true });

  test("the password stays filled, and the field says it isn't saved", async ({ context, siteUrl, helperSaves }) => {
    const page = await context.newPage();
    await page.goto(`${siteUrl}/signup.html`);
    await page.locator("#email").fill("no-save@example.com");
    const menu = await unlockedMenu(page);
    const preview = await revealed(menu, 0);
    await choose(menu, "Strong Password");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForTimeout(1_500);
    expect(helperSaves()).toEqual([]);
    await expect(page.locator("#new")).toHaveValue(preview);
    await page.locator("#email").click();
    await page.locator("#new").click();
    await expect((await menuFrame(page)).getByText("You'll be asked to save it when you continue")).toBeVisible();
  });
});

test("typing a password of one's own closes the suggestions", async ({ context, siteUrl }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  const menu = await unlockedMenu(page);
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
