import { expect, test, type Page } from "@playwright/test";

const codexTerminalUserAgent = "codex_cli_rs/0.125.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464";
const codexBetaFeatures = "terminal_resize_reflow,memories,goals";

const identitySummaries = {
  claude: {
    provider: "claude",
    account_key: "authsub_claude_primary",
    auth_subject_id: "authsub_claude_primary",
    enabled: true,
    primary_source: "learned",
    learned: true,
    learned_fields: 7,
    effective_fields: 7,
    source_counts: { learned: 7, preset: 0, builtin_default: 0 },
    client_product: "claude-cli",
    client_variant: "cli",
    version: "2.1.161",
    updated_at: "2026-06-23T08:15:00Z",
    last_seen_at: "2026-06-23T08:16:00Z",
  },
  codex: {
    provider: "codex",
    account_key: "authsub_codex_terminal",
    auth_subject_id: "authsub_codex_terminal",
    enabled: true,
    primary_source: "learned",
    learned: true,
    learned_fields: 4,
    effective_fields: 5,
    source_counts: { learned: 4, preset: 0, builtin_default: 1 },
    client_product: "codex_cli_rs",
    client_variant: "Codex Desktop",
    version: "0.125.0",
    updated_at: "2026-06-23T10:13:50Z",
    last_seen_at: "2026-06-23T10:13:50Z",
  },
  gemini: {
    provider: "gemini",
    account_key: "authsub_gemini_builtin",
    auth_subject_id: "authsub_gemini_builtin",
    enabled: true,
    primary_source: "builtin_default",
    learned: false,
    learned_fields: 0,
    effective_fields: 3,
    source_counts: { learned: 0, preset: 0, builtin_default: 3 },
    client_product: "",
    client_variant: "",
    version: "",
  },
} as const;

const authFiles = [
  {
    id: "claude-auth-id",
    name: "claude-oauth-primary.json",
    type: "claude",
    provider: "claude",
    label: "Claude OAuth Primary",
    account_type: "oauth",
    auth_index: "claude-oauth-1",
    disabled: false,
    size: 1024,
    modified: 1782268800000,
    identity_fingerprint_summary: identitySummaries.claude,
  },
  {
    id: "codex-auth-id",
    name: "codex-terminal-oauth.json",
    type: "codex",
    provider: "codex",
    label: "Codex Terminal OAuth",
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
    identity_fingerprint_summary: identitySummaries.codex,
  },
  {
    id: "gemini-auth-id",
    name: "gemini-cli-primary.json",
    type: "gemini",
    provider: "gemini",
    label: "Gemini CLI Primary",
    account_type: "oauth",
    auth_index: "gemini-oauth-1",
    disabled: false,
    size: 1024,
    modified: 1782268800000,
    identity_fingerprint_summary: identitySummaries.gemini,
  },
];

const accountDetails = {
  authsub_claude_primary: {
    summary: identitySummaries.claude,
    effective: {
      provider: "claude",
      account_key: "authsub_claude_primary",
      auth_subject_id: "authsub_claude_primary",
      enabled: true,
      client_product: "claude-cli",
      version: "2.1.161",
      fields: {
        "user-agent": {
          value: "claude-cli/2.1.161 (external, cli)",
          source: "learned",
        },
        "cli-version": { value: "2.1.161", source: "learned" },
        entrypoint: { value: "cli", source: "learned" },
        "anthropic-beta": { value: "oauth-2025-04-20", source: "learned" },
        "stainless-package-version": { value: "0.94.0", source: "learned" },
        "stainless-runtime-version": { value: "v24.3.0", source: "learned" },
        "stainless-timeout": { value: "600", source: "learned" },
      },
    },
    learned: {
      provider: "claude",
      account_key: "authsub_claude_primary",
      auth_subject_id: "authsub_claude_primary",
      client_product: "claude-cli",
      client_variant: "cli",
      version: "2.1.161",
      fields: {
        "user-agent": "claude-cli/2.1.161 (external, cli)",
        "cli-version": "2.1.161",
        entrypoint: "cli",
        "anthropic-beta": "oauth-2025-04-20",
        "stainless-package-version": "0.94.0",
        "stainless-runtime-version": "v24.3.0",
        "stainless-timeout": "600",
      },
      observed_headers: {
        "User-Agent": "claude-cli/2.1.161 (external, cli)",
        "X-App": "cli",
        "Anthropic-Beta": "oauth-2025-04-20",
        "X-Stainless-Package-Version": "0.94.0",
        "X-Stainless-Runtime-Version": "v24.3.0",
        "X-Stainless-Timeout": "600",
      },
      created_at: "2026-06-23T08:14:00Z",
      updated_at: "2026-06-23T08:15:00Z",
      last_seen_at: "2026-06-23T08:16:00Z",
    },
    preset: {},
    builtin_default: {},
  },
  authsub_codex_terminal: {
    summary: identitySummaries.codex,
    effective: {
      provider: "codex",
      account_key: "authsub_codex_terminal",
      auth_subject_id: "authsub_codex_terminal",
      enabled: true,
      client_product: "codex_cli_rs",
      version: "0.125.0",
      fields: {
        "user-agent": { value: codexTerminalUserAgent, source: "learned" },
        version: { value: "0.125.0", source: "learned" },
        originator: { value: "Codex Desktop", source: "learned" },
        "x-codex-beta-features": { value: codexBetaFeatures, source: "learned" },
        "websocket-beta": {
          value: "responses_websockets=2026-02-06",
          source: "builtin_default",
        },
      },
    },
    learned: {
      provider: "codex",
      account_key: "authsub_codex_terminal",
      auth_subject_id: "authsub_codex_terminal",
      client_product: "codex_cli_rs",
      client_variant: "Codex Desktop",
      version: "0.125.0",
      fields: {
        "user-agent": codexTerminalUserAgent,
        version: "0.125.0",
        originator: "Codex Desktop",
        "x-codex-beta-features": codexBetaFeatures,
      },
      observed_headers: {
        "User-Agent": codexTerminalUserAgent,
        Version: "0.125.0",
        Originator: "Codex Desktop",
        "X-Codex-Beta-Features": codexBetaFeatures,
      },
      created_at: "2026-06-23T10:13:40Z",
      updated_at: "2026-06-23T10:13:50Z",
      last_seen_at: "2026-06-23T10:13:50Z",
    },
    preset: {},
    builtin_default: {},
  },
  authsub_gemini_builtin: {
    summary: identitySummaries.gemini,
    effective: {
      provider: "gemini",
      account_key: "authsub_gemini_builtin",
      auth_subject_id: "authsub_gemini_builtin",
      enabled: true,
      fields: {
        "user-agent": {
          value: "google-api-nodejs-client/9.16.0",
          source: "builtin_default",
        },
        "x-goog-api-client": { value: "gl-node/24.3.0", source: "builtin_default" },
        "client-metadata": {
          value: "pluginType=GEMINI,ideType=IDE_UNSPECIFIED",
          source: "builtin_default",
        },
      },
    },
    preset: {},
    builtin_default: {},
  },
} as const;

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
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/v0/management/identity-fingerprint/account")) {
      const accountKey = url.searchParams.get("account_key") ?? "";
      const detail = accountDetails[accountKey as keyof typeof accountDetails];
      await route.fulfill({
        status: detail ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(detail ?? { error: "not found" }),
      });
      return;
    }

    if (path.endsWith("/v0/management/auth-files/download")) {
      const name = url.searchParams.get("name") ?? "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ name, type: name.split("-")[0] || "codex" }),
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
        body: JSON.stringify({ files: authFiles }),
      });
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

    await route.fulfill({
      status: request.method() === "GET" ? 200 : 204,
      contentType: "application/json",
      body: request.method() === "GET" ? "{}" : "",
    });
  });
};

test("Account & Security shows auth files and account identity fingerprint details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  await routeManagementMocks(page);

  await page.goto("/#/account-security");

  await expect(page.getByRole("link", { name: /Account & Security|账号与安全/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Auth Files|认证文件/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Identity Fingerprint|身份指纹/i })).toHaveCount(0);
  await expect(page.getByText("Claude OAuth Primary")).toBeVisible();
  await expect(page.getByText("Codex Terminal OAuth")).toBeVisible();
  await expect(page.getByText("Gemini CLI Primary")).toBeVisible();

  const codexRow = page.locator("tr", { hasText: "Codex Terminal OAuth" });
  await expect(codexRow).toBeVisible();
  await codexRow.getByRole("button", { name: /Details|详情/i }).click();

  const dialog = page.getByRole("dialog", { name: /Codex Terminal OAuth|查看/i });
  await expect(dialog).toBeVisible();
  const topTabs = dialog.getByRole("tab");
  await expect(topTabs.nth(0)).toHaveText(/Usage|用量/i);
  await expect(dialog.getByRole("tab", { name: /Usage|用量/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await dialog.getByRole("tab", { name: /Identity|身份/i }).click();

  const identityPanel = dialog.getByTestId("auth-file-identity-fingerprint");
  const identitySummary = identityPanel.getByTestId("auth-file-identity-summary");
  const identityFields = identityPanel.getByTestId("auth-file-identity-fields");
  await expect(identitySummary).toContainText("authsub_codex_terminal");
  await expect(identitySummary).toContainText("codex_cli_rs / Codex Desktop");
  await expect(identityFields).toContainText(codexTerminalUserAgent);
  await expect(identityFields).toContainText(codexBetaFeatures);
  await expect(identityFields).toContainText(/Section|分组/i);
  await expect(identityFields).toContainText(/Field|字段/i);
  await expect(identityFields).toContainText(/Value|值/i);
  await expect(identityFields).toContainText(/Source|来源/i);
  await expect(identityFields).toContainText(/Effective Fields|生效字段/i);
  await expect(identityFields).toContainText(/Learned Fields|自学习字段/i);
  await expect(identityFields).toContainText(/Observed Headers|观测请求头/i);
  await expect(identityPanel.getByText(/Learned|自学习/i).first()).toBeVisible();
  await expect(identityPanel.getByText(/System default|系统默认/i).first()).toBeVisible();
  await expect(identityFields.getByText("websocket-beta")).toBeVisible();
  await expect(identityPanel).not.toContainText("Session_id");
  await expect(identityPanel).not.toContainText("Conversation_id");
  const summaryBox = await identitySummary.boundingBox();
  const fieldsBox = await identityFields.boundingBox();
  if (!summaryBox || !fieldsBox) {
    throw new Error("identity fingerprint summary and fields columns must be visible");
  }
  expect(fieldsBox.x).toBeGreaterThan(summaryBox.x + summaryBox.width - 8);

  await dialog.getByRole("button", { name: /^(Close|关闭)$/ }).click();

  const geminiRow = page.locator("tr", { hasText: "Gemini CLI Primary" });
  await expect(geminiRow).toBeVisible();
  await geminiRow.getByRole("button", { name: /Details|详情/i }).click();
  const geminiDialog = page.getByRole("dialog", { name: /Gemini CLI Primary|查看/i });
  await expect(geminiDialog).toBeVisible();
  const geminiPanel = geminiDialog.getByTestId("auth-file-identity-fingerprint");
  await expect(geminiPanel).toContainText(/System default|系统默认/i);
  await expect(geminiPanel).toContainText("google-api-nodejs-client/9.16.0");
  await expect(geminiPanel).toContainText("pluginType=GEMINI");
});

test("Account & Security keeps card mode usable and redirects old identity route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setAuthed(page, "cards");
  await routeManagementMocks(page);

  await page.goto("/#/identity-fingerprint");

  await expect(page).toHaveURL(/#\/account-security/);
  await expect(page.getByRole("heading", { name: /Account & Security|账号与安全/i })).toBeVisible();
  await expect(page.locator('a[href="#/account-security"]')).toHaveCount(1);
  await expect(page.locator('a[href="#/auth-files"]')).toHaveCount(0);
  await expect(page.locator('a[href="#/identity-fingerprint"]')).toHaveCount(0);
  await expect(
    page.locator('[class*="group/card"]', { hasText: "Codex Terminal OAuth" }),
  ).toBeVisible();
  await expect(
    page.locator('[class*="group/card"]', { hasText: "Claude OAuth Primary" }),
  ).toBeVisible();
});
