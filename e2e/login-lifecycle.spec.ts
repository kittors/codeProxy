import { expect, test } from "@playwright/test";

test("Login: successful sign in persists auth snapshot and restores monitor route after reload", async ({
  page,
}) => {
  await page.route("**/v0/management/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.goto("/#/login");
  await page.evaluate(() => {
    localStorage.removeItem("code-proxy-admin-auth");
  });

  await page.getByRole("textbox", { name: "Eg: https://example.com:8317" }).fill("http://127.0.0.1:8317");
  await page.getByRole("textbox", { name: "Enter MANAGEMENT_KEY" }).fill("test-management-key");
  await page.getByRole("checkbox", { name: "Remember password" }).check();
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/#\/monitor$/);

  const authSnapshot = await page.evaluate(() => localStorage.getItem("code-proxy-admin-auth"));
  expect(authSnapshot).toBeTruthy();
  expect(authSnapshot).toContain("test-management-key");
  expect(authSnapshot).toContain("expiresAt");

  await page.reload();
  await expect(page).toHaveURL(/#\/monitor$/);
});
