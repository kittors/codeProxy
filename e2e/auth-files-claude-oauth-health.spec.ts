import { expect, test, type Page } from "@playwright/test";

const claudeOAuthFile = {
  name: "claude-oauth-primary.json",
  type: "claude",
  provider: "claude",
  label: "Claude OAuth Primary",
  account_type: "oauth",
  auth_index: "claude-oauth-1",
  disabled: false,
  size: 1024,
  modified: 1782182400000,
  claude_oauth_health: {
    enabled: true,
    status: "refresh_pending",
    updated_at: "2026-06-23T08:00:00Z",
    last_runtime_status: 401,
    last_runtime_at: "2026-06-23T08:00:00Z",
    temporary_unschedulable_until: "2099-06-23T08:10:00Z",
    temporary_unschedulable_reason: "oauth_401",
    refresh_available: true,
    windows: {
      five_hour: {
        status: "rejected",
        reset_at: "2099-06-23T10:00:00Z",
        utilization: 1.02,
        exceeded: true,
      },
      seven_day: {
        status: "allowed_warning",
        reset_at: "2099-06-26T08:00:00Z",
        utilization: 1.15,
        exceeded: true,
        surpassed_threshold: true,
      },
    },
    runtime_profile: {
      name: "claude_oauth_runtime",
      identity_fingerprint: "claude_headers",
      transport: "go_http_transport",
      egress: "proxy_pool",
    },
  },
};

const claudeApiKeyFile = {
  name: "claude-api-key.json",
  type: "claude",
  provider: "claude",
  label: "Claude API Key",
  account_type: "api_key",
  disabled: false,
  size: 512,
  modified: 1782182400000,
};

const setAuthed = async (page: Page, viewMode: "table" | "cards" = "table") => {
  await page.addInitScript((mode) => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
    localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify(mode));
    localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
  }, viewMode);
};

const routeManagementMocks = async (page: Page) => {
  await page.route("**/v0/management/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/v0/management/auth-files/download")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "claude",
          account_type: "oauth",
          proxy_id: "primary",
        }),
      });
      return;
    }

    if (path.endsWith("/v0/management/auth-files/models")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [] }),
      });
      return;
    }

    if (path.endsWith("/v0/management/auth-files")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ files: [claudeOAuthFile, claudeApiKeyFile] }),
      });
      return;
    }

    if (path.endsWith("/v0/management/config")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }

    if (path.endsWith("/v0/management/model-configs")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    if (path.endsWith("/v0/management/model-owner-presets")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    if (path.endsWith("/v0/management/auth-group-model-owner-mappings")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' });
      return;
    }

    if (path.endsWith("/v0/management/proxy-pool")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"items":[]}' });
      return;
    }

    if (path.endsWith("/v0/management/usage/entity-stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ source: [], auth_index: [] }),
      });
      return;
    }

    if (path.endsWith("/v0/management/usage")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ apis: {} }),
      });
      return;
    }

    if (path.endsWith("/v0/management/update/check")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ update_available: false }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
};

test("Auth Files: Claude OAuth health is visible in table rows and detail fields", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  await routeManagementMocks(page);

  await page.goto("/#/auth-files");

  const oauthRow = page.locator("tr", { hasText: "Claude OAuth Primary" });
  await expect(oauthRow).toBeVisible();
  await expect(oauthRow.getByText("OAuth refresh pending")).toBeVisible();
  await expect(oauthRow.getByText("5h limited")).toBeVisible();
  await expect(oauthRow.getByText("7d limited")).toBeVisible();

  const apiKeyRow = page.locator("tr", { hasText: "claude-api-key.json" });
  await expect(apiKeyRow).toBeVisible();
  await expect(apiKeyRow.getByText("OAuth refresh pending")).toHaveCount(0);
  await expect(apiKeyRow.getByText("5h limited")).toHaveCount(0);
  await expect(apiKeyRow.getByText("7d limited")).toHaveCount(0);

  await oauthRow.getByRole("button", { name: /Details|详情/i }).click();

  const dialog = page.getByRole("dialog", { name: /Claude OAuth Primary|查看/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Fields|字段/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const healthPanel = dialog.getByTestId("claude-oauth-health-panel");
  await expect(healthPanel).toBeVisible();
  await expect(healthPanel).toContainText(/Claude OAuth health|Claude OAuth 状态/i);
  await expect(healthPanel).toContainText("refresh_pending");
  await expect(healthPanel).toContainText("401");
  await expect(healthPanel).toContainText("oauth_401");
  await expect(healthPanel).toContainText("proxy_pool");
  await expect(healthPanel).toContainText(/5h window|5 小时窗口/i);
  await expect(healthPanel).toContainText(/7d window|7 天窗口/i);
  await expect(healthPanel).toContainText("claude_headers");
  await expect(healthPanel).toContainText("go_http_transport");
});

test("Auth Files: Claude OAuth health badges render in mobile card mode only for OAuth", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setAuthed(page, "cards");
  await routeManagementMocks(page);

  await page.goto("/#/auth-files");

  const oauthCard = page.locator('[class*="group/card"]', {
    hasText: "Claude OAuth Primary",
  });
  await expect(oauthCard).toBeVisible();
  await expect(oauthCard.getByText("OAuth refresh pending")).toBeVisible();
  await expect(oauthCard.getByText("5h limited")).toBeVisible();
  await expect(oauthCard.getByText("7d limited")).toBeVisible();

  const apiKeyCard = page.locator('[class*="group/card"]', { hasText: "claude-api-key.json" });
  await expect(apiKeyCard).toBeVisible();
  await expect(apiKeyCard.getByText("OAuth refresh pending")).toHaveCount(0);
  await expect(apiKeyCard.getByText("5h limited")).toHaveCount(0);
  await expect(apiKeyCard.getByText("7d limited")).toHaveCount(0);
});
