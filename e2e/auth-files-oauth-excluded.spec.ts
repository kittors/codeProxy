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
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
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

  await expect(
    page.getByRole("tab", { name: /OAuth Excluded Models|OAuth 模型禁用/i }),
  ).toBeVisible();
  await expect(page.getByText(/No config|No configuration|暂无配置/i)).toBeVisible();

  const refreshButton = page.getByRole("button", { name: /Refresh|刷新/i }).first();
  await expect(refreshButton).toBeEnabled();

  await page.waitForTimeout(200);
  expect(excludedCalls).toBe(1);
});

test("Auth Files: OAuth dialog should submit callback url through management api", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
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

  const callbackPayloads: string[] = [];
  await page.route("**/v0/management/oauth-callback", async (route) => {
    callbackPayloads.push(route.request().postData() ?? "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.route("**/v0/management/get-auth-status**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "wait" }),
    });
  });

  await page.goto("/#/auth-files");

  await page.getByRole("button", { name: /Add OAuth Login|增加 OAuth 登录/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const callbackInput = page.getByPlaceholder(
    /Paste the full callback URL from browser|粘贴浏览器中的完整回调 URL/i,
  );
  const callbackUrl = "http://localhost:1455/auth/callback?code=test-code&state=test-state";
  await callbackInput.fill(callbackUrl);

  await page.getByRole("button", { name: /Submit callback|提交回调/i }).click();

  await expect.poll(() => callbackPayloads.length).toBe(1);
  expect(callbackPayloads[0]).toContain('"provider":"codex"');
  expect(callbackPayloads[0]).toContain(`"redirect_url":"${callbackUrl}"`);
  const submittedStatus = page
    .getByText("Submitted", { exact: true })
    .or(page.getByText("已提交", { exact: true }));
  await expect(submittedStatus).toBeVisible();
});
