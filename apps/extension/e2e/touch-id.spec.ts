import { choose, expect, menuFrame, PAIRING_CODE, test } from "./fixtures.ts";

// The Touch ID companion is replaced by a fake native host that answers as the real one does
// after the user confirmed (or cancelled) Touch ID.

test.describe("with the companion app", () => {
  test.use({ companion: "ok" });

  test("the popup unlocks with Touch ID, without typing", async ({ context, popupUrl }) => {
    const popup = await context.newPage();
    await popup.goto(popupUrl);
    await expect(popup.getByText("Open a website to see its saved passwords.")).toBeVisible();
    await expect(popup.getByLabel("Unlock with Touch ID")).toBeChecked();
  });

  test("the inline menu unlocks with Touch ID and fills", async ({ context, siteUrl }) => {
    const page = await context.newPage();
    await page.goto(`${siteUrl}/login.html`);
    await page.locator("#pass").click();
    const menu = await menuFrame(page);
    await choose(menu, "Unlock with Touch ID");
    await choose(menu, "e2e-user");
    await expect(page.locator("#pass")).toHaveValue("e2e-pass");
  });

  test("turning Touch ID off goes back to typing the code", async ({ context, popupUrl }) => {
    const popup = await context.newPage();
    await popup.goto(popupUrl);
    await popup.getByLabel("Unlock with Touch ID").uncheck();
    await popup.getByRole("button", { name: "Lock" }).click();

    const again = await context.newPage();
    await again.goto(popupUrl);
    await expect(again.getByText("Enter the code shown on your Mac")).toBeVisible();
    await expect(again.getByRole("button", { name: "Use Touch ID" })).toHaveCount(0);
  });
});

test.describe("when Touch ID is cancelled", () => {
  test.use({ companion: "cancelled" });

  test("the code can still be typed", async ({ context, popupUrl }) => {
    const popup = await context.newPage();
    await popup.goto(popupUrl);
    await expect(popup.getByText("Touch ID was cancelled.")).toBeVisible();
    await expect(popup.getByRole("button", { name: "Use Touch ID" })).toBeVisible();
    await popup.getByLabel("Verification code").fill(PAIRING_CODE);
    await expect(popup.getByText("Open a website to see its saved passwords.")).toBeVisible();
  });
});

test.describe("when the companion still needs setup", () => {
  test.use({ companion: "needs-accessibility" });

  test("the popup asks for the code and says how to finish setup", async ({ context, popupUrl }) => {
    const popup = await context.newPage();
    await popup.goto(popupUrl);
    await expect(popup.getByText("Enter the code shown on your Mac")).toBeVisible();
    await expect(popup.getByText("finish setup in the Apple Passwords Plus app")).toBeVisible();
  });
});
