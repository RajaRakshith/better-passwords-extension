import { expect, PAIRING_CODE, test } from "./fixtures.ts";

test("pairs with the helper over native messaging and keeps the session", async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await popup.goto(popupUrl);

  // opening the popup asks the helper for a code straight away
  const code = popup.getByLabel("Verification code");
  await expect(popup.getByText("Enter the code shown on your Mac")).toBeVisible();
  await code.fill(PAIRING_CODE);

  // unlocked: the popup itself is not a website, so it explains what to do
  await expect(popup.getByText("Open a website to see its saved passwords.")).toBeVisible();

  // reopening must reuse the session instead of asking for a new code
  await popup.reload();
  await expect(popup.getByText("Open a website to see its saved passwords.")).toBeVisible();
});

test("a wrong code is rejected and a fresh one is requested", async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await popup.goto(popupUrl);
  const code = popup.getByLabel("Verification code");
  await code.fill("000000"); // PAIRING_CODE is 246810
  await expect(popup.getByText("incorrect code")).toBeVisible();

  await code.fill(PAIRING_CODE);
  await expect(popup.getByText("Open a website to see its saved passwords.")).toBeVisible();
});

test("lock ends the session", async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await popup.goto(popupUrl);
  await popup.getByLabel("Verification code").fill(PAIRING_CODE);
  await popup.getByRole("button", { name: "Lock" }).click();

  const again = await context.newPage();
  await again.goto(popupUrl);
  await expect(again.getByText("Enter the code shown on your Mac")).toBeVisible();
});

test("the popup opens the Passwords app", async ({ context, popupUrl, passwordsAppLaunches }) => {
  const popup = await context.newPage();
  await popup.goto(popupUrl);
  await popup.getByLabel("Verification code").fill(PAIRING_CODE);
  await popup.getByRole("button", { name: "Open Passwords…" }).click();
  // the popup's own tab is not a website, so no search is passed
  await expect.poll(passwordsAppLaunches).toEqual([""]);
});
