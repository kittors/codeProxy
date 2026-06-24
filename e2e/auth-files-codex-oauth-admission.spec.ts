import { expect, test, type Page } from "@playwright/test";

const codexOAuthFile = {
  name: "codex-oauth.json",
  type: "codex",
  provider: "codex",
  label: "Codex OAuth Primary",
  account_type: "oauth",
  auth_index: "codex-oauth-1",
  disabled: false,
  size: 1024,
  modified: 1782268800000,
  codex_oauth_admission: {
    enabled: true,
    allowed_clients: ["claude_code"],
    available_allowed_clients: [
      {
        id: "claude_code",
        label: "Claude Code",
        description:
          "Allow the Claude Code Codex plugin when Originator and User-Agent both match.",
      },
    ],
  },
  codex_cli_only: true,
  codex_cli_only_allowed_clients: ["claude_code"],
};

const codexApiKeyFile = {
  name: "codex-api-key.json",
  type: "codex",
  provider: "codex",
  label: "Codex API Key",
  account_type: "api_key",
  auth_index: "codex-api-key-1",
  disabled: false,
  size: 512,
  modified: 1782268800000,
};

const setAuthed = async (page: Page) => {
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
    localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("table"));
    localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
  });
};

const routeManagementMocks = async (page: Page) => {
  const patchBodies: Array<Record<string, unknown>> = [];
  let currentCodexOAuthFile = { ...codexOAuthFile };

  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/v0/management/auth-files/fields") && request.method() === "PATCH") {
      const body = request.postDataJSON() as Record<string, unknown>;
      patchBodies.push(body);
      currentCodexOAuthFile = {
        ...currentCodexOAuthFile,
        codex_oauth_admission: {
          ...currentCodexOAuthFile.codex_oauth_admission,
          enabled:
            typeof body.codex_cli_only === "boolean"
              ? body.codex_cli_only
              : currentCodexOAuthFile.codex_oauth_admission.enabled,
          allowed_clients: Array.isArray(body.codex_cli_only_allowed_clients)
            ? body.codex_cli_only_allowed_clients.map(String)
            : currentCodexOAuthFile.codex_oauth_admission.allowed_clients,
        },
        codex_cli_only:
          typeof body.codex_cli_only === "boolean"
            ? body.codex_cli_only
            : currentCodexOAuthFile.codex_cli_only,
        codex_cli_only_allowed_clients: Array.isArray(body.codex_cli_only_allowed_clients)
          ? body.codex_cli_only_allowed_clients.map(String)
          : currentCodexOAuthFile.codex_cli_only_allowed_clients,
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }

    if (path.endsWith("/v0/management/auth-files/download")) {
      const name = url.searchParams.get("name");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          type: "codex",
          account_type: name === "codex-api-key.json" ? "api_key" : "oauth",
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
        body: JSON.stringify({ files: [currentCodexOAuthFile, codexApiKeyFile] }),
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

    if (path.endsWith("/v0/management/usage/auth-file-trend")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          auth_index: url.searchParams.get("auth_index") || "codex-oauth-1",
          days: 7,
          hours: 5,
          request_total: 0,
          cycle_request_total: 0,
          cycle_cost_total: 0,
          weekly_quota_used_percent: null,
          cycle_start: "",
          daily_usage: [],
          hourly_usage: [],
          quota_series: [],
        }),
      });
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

  return { patchBodies };
};

test("Auth Files: Codex OAuth admission controls save the cli-only policy", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  const state = await routeManagementMocks(page);

  await page.goto("/#/auth-files");

  const oauthRow = page.locator("tr", { hasText: "Codex OAuth Primary" });
  await expect(oauthRow).toBeVisible();
  await oauthRow.getByRole("button", { name: /View|查看/i }).click();

  const dialog = page.getByRole("dialog", { name: /Codex OAuth Primary|查看/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /Fields|字段/i }).click();

  const panel = dialog.getByTestId("codex-oauth-admission-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/Official Codex client admission|官方 Codex 客户端准入/i);
  await expect(panel.getByText("Claude Code", { exact: true })).toBeVisible();
  await expect(panel).toContainText("Originator and User-Agent");
  await expect(panel).toContainText(/leave fingerprint fields empty|指纹字段留空/i);
  await expect(
    panel.getByRole("switch", {
      name: /Only allow official Codex clients|只允许官方 Codex 客户端/i,
    }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(panel.getByTestId("codex-oauth-admission-preset-claude_code")).toBeChecked();

  await panel
    .getByRole("switch", { name: /Only allow official Codex clients|只允许官方 Codex 客户端/i })
    .click();
  await panel.getByTestId("codex-oauth-admission-preset-claude_code").uncheck();
  await dialog.getByRole("button", { name: /Save|保存/i }).click();

  await expect.poll(() => state.patchBodies.length).toBe(1);
  expect(state.patchBodies[0]).toEqual({
    name: "codex-oauth.json",
    codex_cli_only: false,
    codex_cli_only_allowed_clients: [],
  });
});

test("Auth Files: Codex API key files do not expose OAuth admission controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  await routeManagementMocks(page);

  await page.goto("/#/auth-files");

  const apiKeyRow = page.locator("tr", { hasText: "Codex API Key" });
  await expect(apiKeyRow).toBeVisible();
  await apiKeyRow.getByRole("button", { name: /View|查看/i }).click();

  const dialog = page.getByRole("dialog", { name: /Codex API Key|查看/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /Fields|字段/i }).click();
  await expect(dialog.getByTestId("codex-oauth-admission-panel")).toHaveCount(0);
});
