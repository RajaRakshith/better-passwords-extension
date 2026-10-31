import type { Frame, Page } from "@playwright/test";
import type { Envelope, Request, Response } from "../src/messages.ts";
import { choose, expect, menuFrame, PAIRING_CODE, test } from "./fixtures.ts";

async function ask<R extends Request>(page: Page | Frame, request: R): Promise<Envelope<Response<R>>> {
  return page.evaluate((message) => {
    const { chrome } = globalThis as unknown as {
      chrome: { runtime: { sendMessage(request: unknown): Promise<Envelope<Response<R>>> } };
    };
    const nonce = new URLSearchParams(location.hash.slice(1)).get("nonce");
    return chrome.runtime.sendMessage({ ...message, ...(nonce ? { menuNonce: nonce } : {}) });
  }, request);
}

test.beforeEach(async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await popup.goto(popupUrl);
  await popup.getByLabel("Verification code").fill(PAIRING_CODE);
  await expect(popup.getByLabel("Lock after inactivity")).toBeVisible();
  await popup.close();
});

test("rejects stale and empty selected origins before password retrieval", async ({
  context,
  siteUrl,
  passwordReads,
}) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl.replace("localhost", "127.0.0.1")}/login.html`);
  await page.locator("#pass").click();
  const menu = await menuFrame(page);
  const response = await ask(menu, {
    type: "fill",
    tabId: 0,
    username: "e2e-user",
    expectedOrigin: new URL(siteUrl).origin,
  });
  expect(response).toEqual({ ok: true, value: { result: "origin-mismatch" } });
  expect(await ask(menu, { type: "fill", tabId: 0, username: "e2e-user", expectedOrigin: "" })).toEqual({
    ok: true,
    value: { result: "origin-mismatch" },
  });
  expect(passwordReads()).toBe(0);
  await expect(page.locator("#pass")).toHaveValue("");
});

test.describe("pending native reads", () => {
  test.use({ holdPasswordReplies: true });
  test("Lock invalidates an actual inline selection while the native read is pending", async ({
    context,
    siteUrl,
    popupUrl,
    passwordReads,
    releasePasswordReplies,
  }) => {
    const control = await context.newPage();
    await control.goto(popupUrl.replace("popup.html", "companion.html"));
    const page = await context.newPage();
    await page.goto(`${siteUrl}/login.html`);
    await page.bringToFront();
    await page.locator("#pass").click();
    await choose(await menuFrame(page), "e2e-user");
    await expect.poll(passwordReads).toBe(1);
    expect(await ask(control, { type: "lock" })).toMatchObject({ ok: true });
    releasePasswordReplies();
    await page.waitForTimeout(300);
    await expect(page.locator("#pass")).toHaveValue("");
    expect(await ask(control, { type: "get-status" })).toMatchObject({ ok: true, value: { state: "locked" } });
  });
  test("navigation during a native read does not redirect the credential", async ({
    context,
    siteUrl,
    passwordReads,
    releasePasswordReplies,
  }) => {
    const page = await context.newPage();
    await page.goto(`${siteUrl}/login.html`);
    await page.locator("#pass").click();
    await choose(await menuFrame(page), "e2e-user");
    await expect.poll(passwordReads).toBe(1);
    await page.goto(`${siteUrl.replace("localhost", "127.0.0.1")}/login.html`);
    releasePasswordReplies();
    await page.waitForTimeout(300);
    await expect(page.locator("#pass")).toHaveValue("");
  });
});

test("weak signup rules show an error without filling or saving a candidate", async ({
  context,
  siteUrl,
  helperSaves,
}) => {
  const page = await context.newPage();
  await page.goto(`${siteUrl}/signup.html`);
  await page.locator("#new").evaluate((field) => {
    field.setAttribute("maxlength", "1");
    field.setAttribute("passwordrules", "allowed: [a]; maxlength: 1");
  });
  await page.locator("#new").click();
  const menu = await menuFrame(page);
  await expect(menu.getByText("This site's restrictions prevent a strong password suggestion.")).toBeVisible();
  await expect(menu.getByRole("option", { name: /Strong Password/ })).toHaveCount(0);
  await expect(page.locator("#new")).toHaveValue("");
  expect(helperSaves()).toEqual([]);
});

test("inactivity choices survive reopening the popup", async ({ context, popupUrl }) => {
  const popup = await context.newPage();
  await popup.goto(popupUrl);
  await expect(popup.getByLabel("Lock after inactivity")).toHaveValue("15");
  await popup.getByLabel("Lock after inactivity").selectOption("5");
  await popup.reload();
  await expect(popup.getByLabel("Lock after inactivity")).toHaveValue("5");
  await expect(popup.getByText(/Locking clears temporary passwords/)).toBeVisible();
});
