import type { Frame } from "@playwright/test";
import { choose, expect, menuFrame, PAIRING_CODE, test } from "./fixtures.ts";

/** A suggested password: hidden but for its start, shown while the eye is hovered. */
async function revealed(menu: Frame, index: number): Promise<string> {
  const detail = menu.locator(".password").nth(index);
  expect(await detail.textContent()).toMatch(/^.{3}[•-]+$/);
  await menu.locator(".reveal").nth(index).hover();
  await expect(detail).not.toContainText("•");
  return (await detail.textContent()) ?? "";
}

test("suggests a strong password, saves it, then fills it", async ({ context, siteUrl, helperSaves }) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  await page.locator("#email").fill("new-user@example.com");
  await page.locator("#new").click();

  const menu = await menuFrame(page);
  await choose(menu, "Unlock to suggest a strong password");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  const preview = await revealed(menu, 0);
  expect(preview).toMatch(/^[a-zA-Z0-9]{6}-[a-zA-Z0-9]{6}-[a-zA-Z0-9]{6}$/);
  await choose(menu, "Strong Password");

  // the fake helper "clicked Save" in macOS's prompt; only then is the password filled in
  await expect(page.locator("#new")).toHaveValue(preview);
  await expect(page.locator("#confirm")).toHaveValue(preview);
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
  const preview = await revealed(menu, 1);
  expect(preview).toMatch(/^[a-zA-Z0-9]{20}$/);
  // the eye is part of the row: clicking it chooses the password too
  await menu.locator(".reveal").nth(1).click();
  await expect(page.locator("#new")).toHaveValue(preview);
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

test("replacing a saved password fills it right away and keeps it for the session", async ({
  context,
  siteUrl,
  helperSaves,
}) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  // e2e-user already has a saved password for this site
  await page.locator("#email").fill("e2e-user");
  await page.locator("#new").click();
  const menu = await menuFrame(page);
  await choose(menu, "Unlock to suggest a strong password");
  await menu.getByLabel("Verification code").fill(PAIRING_CODE);
  const preview = await revealed(menu, 0);
  await choose(menu, "Strong Password");

  // an update can't be confirmed, so it's filled without waiting
  await expect(page.locator("#new")).toHaveValue(preview);
  expect(helperSaves()).toEqual([{ hostname: "localhost", username: "e2e-user", password: preview }]);

  // (the popup lists it for the session; a popup opened as a tab can't show it, see tabOf)
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
