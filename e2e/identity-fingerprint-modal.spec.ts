import { expect, test, type Page } from "@playwright/test";

const codexTerminalUserAgent =
  "codex_cli_rs/0.125.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464";
const codexBetaFeatures = "terminal_resize_reflow,memories,goals";

const identitySummaries = {
  codex: {
    provider: "codex",
    account_key: "codex-e2e-account",
    auth_subject_id: "codex-e2e-account",
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
    account_key: "gemini-e2e-account",
    auth_subject_id: "gemini-e2e-account",
    enabled: true,
    primary_source: "builtin_default",
    learned: false,
    learned_fields: 0,
    effective_fields: 3,
    source_counts: { learned: 0, preset: 0, builtin_default: 3 },
  },
} as const;

const authFiles = [
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
    identity_fingerprint_summary: identitySummaries.codex,
  },
  {
    id: "gemini-auth-id",
    name: "gemini-cli-oauth.json",
    type: "gemini",
    provider: "gemini",
    label: "Gemini CLI OAuth",
    account_type: "oauth",
    auth_index: "gemini-oauth-1",
    disabled: false,
    size: 1024,
    modified: 1782268800000,
    identity_fingerprint_summary: identitySummaries.gemini,
  },
];

const accountDetails = {
  "codex-e2e-account": {
    summary: identitySummaries.codex,
    effective: {
      provider: "codex",
      account_key: "codex-e2e-account",
      auth_subject_id: "codex-e2e-account",
      enabled: true,
      client_product: "codex_cli_rs",
      version: "0.125.0",
      fields: {
        "user-agent": { value: codexTerminalUserAgent, source: "learned" },
        version: { value: "0.125.0", source: "learned" },
        originator: { value: "Codex Desktop", source: "learned" },
        "x-codex-beta-features": {
          value: codexBetaFeatures,
          source: "learned",
        },
        "websocket-beta": {
          value: "responses_websockets=2026-02-06",
          source: "builtin_default",
        },
      },
    },
    learned: {
      provider: "codex",
      account_key: "codex-e2e-account",
      auth_subject_id: "codex-e2e-account",
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
  "gemini-e2e-account": {
    summary: identitySummaries.gemini,
    effective: {
      provider: "gemini",
      account_key: "gemini-e2e-account",
      auth_subject_id: "gemini-e2e-account",
      enabled: true,
      fields: {
        "user-agent": {
          value: "google-api-nodejs-client/9.16.0",
          source: "builtin_default",
        },
        "x-goog-api-client": {
          value: "gl-node/24.3.0",
          source: "builtin_default",
        },
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
    localStorage.setItem(
      "authFilesPage.filesViewMode.v1",
      JSON.stringify("table"),
    );
    localStorage.setItem(
      "authFilesPage.quotaAutoRefreshMs.v1",
      JSON.stringify(0),
    );
  });
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }

    if (path.endsWith("/v0/management/model-configs")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }

    if (path.endsWith("/v0/management/model-owner-presets")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }

    if (path.endsWith("/v0/management/auth-group-model-owner-mappings")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"items":[]}',
      });
      return;
    }

    if (path.endsWith("/v0/management/proxy-pool")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"items":[]}',
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

    await route.fulfill({
      status: request.method() === "GET" ? 200 : 204,
      contentType: "application/json",
      body: request.method() === "GET" ? "{}" : "",
    });
  });
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1360, height: 860 });
  await setAuthed(page);
  await routeManagementMocks(page);
});

test("legacy identity fingerprint URL redirects to AI Accounts", async ({
  page,
}) => {
  await page.goto("/manage/#/identity-fingerprint");

  await expect(page).toHaveURL(/#\/access\/ai-accounts/);
  await expect(
    page.getByRole("heading", { name: /AI Accounts|AI 账号|Account & Security|账号与安全/i }),
  ).toBeVisible();
  await expect(
    page.locator('a[href="#/access/ai-accounts"]:visible'),
  ).toHaveCount(1);
  await expect(page.locator('a[href="#/identity-fingerprint"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /Generate from recent requests|从近期请求生成/i,
    }),
  ).toHaveCount(0);
});

test("learned Codex runtime state is visible from account details", async ({
  page,
}) => {
  await page.goto("/manage/#/identity-fingerprint");

  const codexRow = page.locator("tr", { hasText: "Codex Terminal OAuth" });
  await expect(codexRow).toBeVisible();
  await codexRow.getByRole("button", { name: /Details|详情/i }).click();

  const dialog = page.getByRole("dialog", {
    name: /Codex Terminal OAuth|查看/i,
  });
  await expect(
    dialog.getByRole("tab", { name: /Usage|用量/i }),
  ).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: /Identity|身份/i }).click();

  const panel = page.getByTestId("auth-file-identity-fingerprint");
  const summary = panel.getByTestId("auth-file-identity-summary");
  const fields = panel.getByTestId("auth-file-identity-fields");
  await expect(summary).toContainText("codex-e2e-account");
  await expect(summary).toContainText("codex_cli_rs / Codex Desktop");
  await expect(fields).toContainText(codexTerminalUserAgent);
  await expect(fields).toContainText(codexBetaFeatures);
  await expect(fields).toContainText(/Section|分组/i);
  await expect(fields).toContainText(/Field|字段/i);
  await expect(fields).toContainText(/Value|值/i);
  await expect(fields).toContainText(/Source|来源/i);
  await expect(fields).toContainText(/Learned Fields|自学习字段/i);
  await expect(fields).toContainText(/Observed Headers|观测请求头/i);
  await expect(panel).not.toContainText("Session_id");
  await expect(panel).not.toContainText("Conversation_id");
  const summaryBox = await summary.boundingBox();
  const fieldsBox = await fields.boundingBox();
  if (!summaryBox || !fieldsBox) {
    throw new Error(
      "identity fingerprint summary and fields columns must be visible",
    );
  }
  expect(fieldsBox.x).toBeGreaterThan(summaryBox.x + summaryBox.width - 8);
});

test("Gemini account uses builtin defaults without legacy manual save flow", async ({
  page,
}) => {
  await page.goto("/manage/#/identity-fingerprint");

  const geminiRow = page.locator("tr", { hasText: "Gemini CLI OAuth" });
  await expect(geminiRow).toBeVisible();
  await geminiRow.getByRole("button", { name: /Details|详情/i }).click();

  const panel = page.getByTestId("auth-file-identity-fingerprint");
  await expect(panel).toContainText(/System default|系统默认/i);
  await expect(panel).toContainText("google-api-nodejs-client/9.16.0");
  await expect(panel).toContainText("pluginType=GEMINI");
  await expect(page.getByRole("button", { name: /^Save$|^保存$/ })).toHaveCount(
    0,
  );
});
