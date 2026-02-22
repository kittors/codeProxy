import { expect, test } from "@playwright/test";

test("Auth Files: OAuth excluded models tab should not stay loading on empty response", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
      }),
    );
  });

  await page.route("**/v0/management/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/v0/management/auth-files", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ files: [] }),
    });
  });

  await page.route("**/v0/management/usage", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ apis: {} }),
    });
  });

  let excludedCalls = 0;
  await page.route("**/v0/management/oauth-excluded-models", async (route) => {
    excludedCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ "oauth-excluded-models": {} }),
    });
  });

  await page.goto("/#/auth-files?tab=excluded");

  await expect(page.getByRole("button", { name: "OAuth 排除模型" })).toBeVisible();
  await expect(page.getByText("暂无配置")).toBeVisible();

  const refreshButton = page.getByRole("button", { name: "刷新" }).first();
  await expect(refreshButton).toBeEnabled();

  await page.waitForTimeout(200);
  expect(excludedCalls).toBe(1);
});
