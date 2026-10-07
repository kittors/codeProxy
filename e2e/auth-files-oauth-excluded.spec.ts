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
    page.getByRole("dialog", { name: /OAuth Excluded Models|OAuth 模型禁用/i }),
  ).toBeVisible();
  await expect(page.getByText(/No config|No configuration|暂无配置/i)).toBeVisible();

  const refreshButton = page.getByRole("button", { name: /Refresh|刷新/i }).first();
  await expect(refreshButton).toBeEnabled();

  await page.waitForTimeout(200);
  expect(excludedCalls).toBe(1);
});

test("Auth Files: add-account dialog submits the pasted callback for the login it started", async ({
  page,
  context,
}) => {
  // A server that is not on this machine: the provider's redirect to localhost
  // cannot reach it, so the address has to be pasted back.
  const apiBase = "http://relay.example.test";
  await page.addInitScript((base) => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: base,
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
  }, apiBase);

  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  const callbackPayloads: string[] = [];
  let callbackReceived = false;
  await page.route("**/v0/management/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/codex-auth-url")) {
      await route.fulfill(
        json({
          status: "ok",
          url: "https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=e2e-state",
          state: "e2e-state",
          flow: "redirect",
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }),
      );
      return;
    }
    if (path.endsWith("/oauth-callback")) {
      callbackPayloads.push(route.request().postData() ?? "");
      callbackReceived = true;
      await route.fulfill(json({ status: "ok" }));
      return;
    }
    if (path.endsWith("/get-auth-status")) {
      await route.fulfill(json({ status: callbackReceived ? "ok" : "wait" }));
      return;
    }
    if (path.endsWith("/auth-files")) {
      await route.fulfill(json({ files: [] }));
      return;
    }
    await route.fulfill(json({}));
  });
  // The provider's page opens in a new tab; keep it off the network.
  await context.route("https://auth.openai.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<p>provider sign-in</p>" }),
  );

  await page.goto("/#/auth-files");
  await page.getByRole("button", { name: /Add AI account|添加 AI 账号/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const providerTab = context.waitForEvent("page");
  await dialog.getByRole("button", { name: /Sign in with Codex|前往 Codex 登录/ }).click();
  const providerPage = await providerTab;
  await expect.poll(() => providerPage.url()).toContain("auth.openai.com/oauth/authorize");
  await providerPage.close();

  const callbackBox = dialog.getByRole("textbox", { name: /Callback address|回调地址/ });
  await callbackBox.fill(
    "http://localhost:1455/auth/callback?code=test-code&scope=openid&state=e2e-state",
  );
  await callbackBox.press("Enter");

  await expect.poll(() => callbackPayloads.length).toBe(1);
  const payload = JSON.parse(callbackPayloads[0] ?? "{}");
  expect(payload).toMatchObject({ provider: "codex", code: "test-code", state: "e2e-state" });
  await expect(
    dialog.getByRole("heading", { name: /Codex account added|已添加 Codex 账号/ }),
  ).toBeVisible();
});

test("Auth Files: mobile cards expose the selection checkbox without hover", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
    localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
  });

  await page.route("**/v0/management/config", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.route("**/v0/management/auth-files", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        files: [
          {
            name: "qwen.json",
            type: "qwen",
            size: 1024,
            modified: Date.now(),
            disabled: false,
          },
        ],
      }),
    });
  });
  await page.route("**/v0/management/usage**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ source: [], auth_index: [] }),
    });
  });
  await page.route("**/v0/management/model-configs**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/v0/management/model-owner-presets", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/v0/management/auth-group-model-owner-mappings", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{\"items\":[]}" });
  });
  await page.route("**/v0/management/proxy-pool", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{\"items\":[]}" });
  });

  await page.goto("/#/auth-files");

  await expect(page.getByText("qwen.json")).toBeVisible();
  const checkbox = page.getByRole("checkbox", { name: "Select qwen.json" });
  await expect
    .poll(async () =>
      checkbox.evaluate((input) => {
        const style = getComputedStyle(input.parentElement as HTMLElement);
        return `${style.opacity}:${style.pointerEvents}`;
      }),
    )
    .toBe("1:auto");

  await checkbox.click();
  await expect(checkbox).toBeChecked();
});
