import { expect, test, type Page } from "@playwright/test";

const codexCLIUserAgent =
  "codex_cli_rs/0.125.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464";
const codexDesktopUserAgent =
  "Codex Desktop/0.144.0-alpha.4 (Mac OS 26.5.2; arm64) unknown (Codex Desktop; 26.707.31123)";
const codexCLIBetaFeatures = "terminal_resize_reflow,memories,goals";
const codexDesktopBetaFeatures = "remote_compaction_v2,desktop_companion";
const codexExtraLearnedFields = Object.fromEntries(
  Array.from({ length: 18 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return [`x-codex-learned-${number}`, `learned-value-${number}`];
  }),
);
const codexExtraEffectiveFields = Object.fromEntries(
  Object.entries(codexExtraLearnedFields).map(([key, value]) => [
    key,
    { value, source: "learned" },
  ]),
);

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
    profile_key: "codex_cli_rs",
    profile_family: "cli",
    auth_subject_id: "authsub_codex_terminal",
    enabled: true,
    primary_source: "learned",
    learned: true,
    learned_fields: 23,
    effective_fields: 23,
    source_counts: { learned: 23, preset: 0, builtin_default: 0 },
    client_product: "codex_cli_rs",
    client_variant: "CLI",
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

const codexQuotaStatus = {
  auth_index: "codex-oauth-1",
  provider: "codex",
  refresh_state: "success",
  health_status: "ok",
  plan_type: "plus",
  quotas: [
    {
      quota_key: "code_5h",
      quota_label: "m_quota.code_5h",
      percent: 88,
      reset_at: "2026-07-22T17:00:00Z",
      window_seconds: 18000,
    },
    {
      quota_key: "code_week",
      quota_label: "m_quota.code_weekly",
      percent: 63,
      reset_at: "2026-07-28T10:00:00Z",
      window_seconds: 604800,
    },
    {
      quota_key: "spark_week",
      quota_label: "GPT-5.3-Codex-Spark Extended Reasoning: Weekly",
      percent: 94,
      reset_at: "2026-07-28T10:00:00Z",
      window_seconds: 604800,
    },
  ],
  usage: { cycle_request_total: 42, cycle_known: true },
  version: 1,
  upstream_checked_at: "2026-07-21T10:00:00Z",
  updated_at: "2026-07-21T10:00:00Z",
};

const codexCLIProfile = {
  selectable: true,
  summary: identitySummaries.codex,
  effective: {
    provider: "codex",
    account_key: "authsub_codex_terminal",
    profile_key: "codex_cli_rs",
    profile_family: "cli",
    auth_subject_id: "authsub_codex_terminal",
    enabled: true,
    client_product: "codex_cli_rs",
    client_variant: "CLI",
    version: "0.125.0",
    fields: {
      "user-agent": { value: codexCLIUserAgent, source: "learned" },
      version: { value: "0.125.0", source: "learned" },
      originator: { value: "codex_cli_rs", source: "learned" },
      "x-codex-beta-features": {
        value: codexCLIBetaFeatures,
        source: "learned",
      },
      ...codexExtraEffectiveFields,
      "websocket-beta": {
        value: "responses_websockets=2026-02-06",
        source: "learned",
      },
    },
  },
  learned: {
    provider: "codex",
    account_key: "authsub_codex_terminal",
    profile_key: "codex_cli_rs",
    profile_family: "cli",
    auth_subject_id: "authsub_codex_terminal",
    client_product: "codex_cli_rs",
    client_variant: "CLI",
    version: "0.125.0",
    fields: {
      "user-agent": codexCLIUserAgent,
      version: "0.125.0",
      originator: "codex_cli_rs",
      "x-codex-beta-features": codexCLIBetaFeatures,
      "websocket-beta": "responses_websockets=2026-02-06",
      ...codexExtraLearnedFields,
    },
    observed_headers: {
      "User-Agent": codexCLIUserAgent,
      Version: "0.125.0",
      Originator: "codex_cli_rs",
      "X-Codex-Beta-Features": codexCLIBetaFeatures,
      "OpenAI-Beta": "responses_websockets=2026-02-06",
    },
    created_at: "2026-06-23T10:13:40Z",
    updated_at: "2026-06-23T10:13:50Z",
    last_seen_at: "2026-06-23T10:13:50Z",
  },
};

const codexDesktopProfile = {
  selectable: true,
  summary: {
    provider: "codex",
    account_key: "authsub_codex_terminal",
    profile_key: "codex_desktop",
    profile_family: "desktop",
    auth_subject_id: "authsub_codex_terminal",
    enabled: true,
    primary_source: "learned",
    learned: true,
    learned_fields: 5,
    effective_fields: 5,
    source_counts: { learned: 5, preset: 0, builtin_default: 0 },
    client_product: "Codex Desktop",
    client_variant: "Desktop",
    version: "0.144.0-alpha.4",
    updated_at: "2026-07-10T08:30:00Z",
    last_seen_at: "2026-07-10T08:30:00Z",
  },
  effective: {
    provider: "codex",
    account_key: "authsub_codex_terminal",
    profile_key: "codex_desktop",
    profile_family: "desktop",
    auth_subject_id: "authsub_codex_terminal",
    enabled: true,
    client_product: "Codex Desktop",
    client_variant: "Desktop",
    version: "0.144.0-alpha.4",
    fields: {
      "user-agent": { value: codexDesktopUserAgent, source: "learned" },
      version: { value: "0.144.0-alpha.4", source: "learned" },
      originator: { value: "Codex Desktop", source: "learned" },
      "x-codex-beta-features": {
        value: codexDesktopBetaFeatures,
        source: "learned",
      },
      "websocket-beta": {
        value: "responses_websockets=desktop",
        source: "learned",
      },
    },
  },
  learned: {
    provider: "codex",
    account_key: "authsub_codex_terminal",
    profile_key: "codex_desktop",
    profile_family: "desktop",
    auth_subject_id: "authsub_codex_terminal",
    client_product: "Codex Desktop",
    client_variant: "Desktop",
    version: "0.144.0-alpha.4",
    fields: {
      "user-agent": codexDesktopUserAgent,
      version: "0.144.0-alpha.4",
      originator: "Codex Desktop",
      "x-codex-beta-features": codexDesktopBetaFeatures,
      "websocket-beta": "responses_websockets=desktop",
    },
    observed_headers: {
      "User-Agent": codexDesktopUserAgent,
      Version: "0.144.0-alpha.4",
      Originator: "Codex Desktop",
      "X-Codex-Beta-Features": codexDesktopBetaFeatures,
      "OpenAI-Beta": "responses_websockets=desktop",
    },
    created_at: "2026-07-10T08:29:45Z",
    updated_at: "2026-07-10T08:30:00Z",
    last_seen_at: "2026-07-10T08:30:00Z",
  },
};

const buildCodexAccountDetail = (
  strategy: "cli_preferred" | "active_profile",
  activeProfileKey: string,
  revision: number,
) => {
  const profiles = [codexCLIProfile, codexDesktopProfile];
  const selectedProfileKey =
    strategy === "active_profile" &&
    profiles.some((profile) => profile.summary.profile_key === activeProfileKey)
      ? activeProfileKey
      : "codex_cli_rs";
  const selectedProfile =
    profiles.find(
      (profile) => profile.summary.profile_key === selectedProfileKey,
    ) ?? codexCLIProfile;
  return {
    summary: selectedProfile.summary,
    effective: selectedProfile.effective,
    learned: selectedProfile.learned,
    profiles,
    policy: {
      provider: "codex",
      account_key: "authsub_codex_terminal",
      strategy,
      ...(strategy === "active_profile"
        ? { active_profile_key: activeProfileKey }
        : {}),
      revision,
      updated_at: "2026-07-10T08:30:00Z",
    },
    selected_profile_key: selectedProfileKey,
    selection_reason:
      strategy === "active_profile" ? "active_profile" : "cli_preferred",
    preset: {},
    builtin_default: {},
  };
};

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
  authsub_codex_terminal: buildCodexAccountDetail("cli_preferred", "", 0),
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
    localStorage.setItem(
      "authFilesPage.filesViewMode.v1",
      JSON.stringify(mode),
    );
    localStorage.setItem(
      "authFilesPage.quotaAutoRefreshMs.v1",
      JSON.stringify(0),
    );
  }, viewMode);
};

const swipeVerticallyFromPoint = async (
  page: Page,
  x: number,
  y: number,
  deltaY: number,
) => {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Input.synthesizeScrollGesture", {
      x,
      y,
      yDistance: deltaY,
      speed: 800,
      gestureSourceType: "touch",
    });
  } finally {
    await client.detach();
  }
};

const routeManagementMocks = async (
  page: Page,
  options?: { withQuotaStatus?: boolean },
) => {
  let codexStrategy: "cli_preferred" | "active_profile" = "cli_preferred";
  let codexActiveProfileKey = "";
  let codexPolicyRevision = 0;

  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (
      options?.withQuotaStatus &&
      path.includes("/ai-accounts/status-refresh/") &&
      request.method() === "GET"
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "identity-refresh",
          state: "completed",
          total: 0,
          completed: 0,
          failed: 0,
          results: [],
        }),
      });
      return;
    }

    if (options?.withQuotaStatus && path.endsWith("/ai-accounts/status-refresh")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "identity-refresh",
          accepted: 0,
          deduplicated: 0,
        }),
      });
      return;
    }

    if (options?.withQuotaStatus && path.endsWith("/ai-accounts/status")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [codexQuotaStatus] }),
      });
      return;
    }

    if (
      path.endsWith("/v0/management/identity-fingerprint/account/policy") &&
      request.method() === "PUT"
    ) {
      const payload = request.postDataJSON() as {
        provider?: string;
        account_key?: string;
        strategy?: "cli_preferred" | "active_profile";
        active_profile_key?: string;
      };
      if (
        payload.provider !== "codex" ||
        payload.account_key !== "authsub_codex_terminal"
      ) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "invalid account policy target" }),
        });
        return;
      }
      codexStrategy = payload.strategy ?? "cli_preferred";
      codexActiveProfileKey =
        codexStrategy === "active_profile"
          ? (payload.active_profile_key ?? "")
          : "";
      codexPolicyRevision += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildCodexAccountDetail(
            codexStrategy,
            codexActiveProfileKey,
            codexPolicyRevision,
          ),
        ),
      });
      return;
    }

    if (path.endsWith("/v0/management/identity-fingerprint/account")) {
      const accountKey = url.searchParams.get("account_key") ?? "";
      const detail =
        accountKey === "authsub_codex_terminal"
          ? buildCodexAccountDetail(
              codexStrategy,
              codexActiveProfileKey,
              codexPolicyRevision,
            )
          : accountDetails[accountKey as keyof typeof accountDetails];
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

test("AI Accounts shows auth files and account identity fingerprint details", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  await routeManagementMocks(page);

  await page.goto("/#/access/ai-accounts");

  await expect(
    page.getByRole("link", { name: /AI Accounts|AI 账号|Account & Security|账号与安全/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Auth Files|认证文件/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Identity Fingerprint|身份指纹/i }),
  ).toHaveCount(0);
  await expect(page.getByText("Claude OAuth Primary")).toBeVisible();
  await expect(page.getByText("Codex Terminal OAuth")).toBeVisible();
  await expect(page.getByText("Gemini CLI Primary")).toBeVisible();

  const codexRow = page.locator("tr", { hasText: "Codex Terminal OAuth" });
  await expect(codexRow).toBeVisible();
  await codexRow.getByRole("button", { name: /Details|详情/i }).click();

  const dialog = page.getByRole("dialog", {
    name: /Codex Terminal OAuth|查看/i,
  });
  await expect(dialog).toBeVisible();
  const topTabs = dialog.getByRole("tab");
  await expect(topTabs.nth(0)).toHaveText(/Usage|用量/i);
  await expect(
    dialog.getByRole("tab", { name: /Usage|用量/i }),
  ).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: /Identity|身份/i }).click();

  const identityPanel = dialog.getByTestId("auth-file-identity-fingerprint");
  const identitySummary = identityPanel.getByTestId(
    "auth-file-identity-summary",
  );
  const identityFields = identityPanel.getByTestId("auth-file-identity-fields");
  const cliProfileCard = identitySummary.getByTestId(
    "identity-profile-codex_cli_rs",
  );
  const desktopProfileCard = identitySummary.getByTestId(
    "identity-profile-codex_desktop",
  );
  const currentOutbound = identitySummary.locator("p", {
    hasText: /Current outbound identity|当前出站身份/i,
  });
  await expect(identitySummary).toContainText("authsub_codex_terminal");
  await expect(cliProfileCard).toBeVisible();
  await expect(desktopProfileCard).toBeVisible();
  await expect(cliProfileCard).toContainText(/In use|出站中/i);
  await expect(desktopProfileCard).not.toContainText(/In use|出站中/i);
  await expect(currentOutbound).toContainText("codex_cli_rs / CLI");
  await expect(identityFields).toContainText(codexCLIUserAgent);
  await expect(identityFields).toContainText(codexCLIBetaFeatures);
  await expect(identityFields).not.toContainText(codexDesktopUserAgent);
  await expect(identityFields).not.toContainText(codexDesktopBetaFeatures);
  await expect(identityFields).toContainText(/Section|分组/i);
  await expect(identityFields).toContainText(/Field|字段/i);
  await expect(identityFields).toContainText(/Value|值/i);
  await expect(identityFields).toContainText(/Source|来源/i);
  await expect(identityFields).toContainText(/Effective Fields|生效字段/i);
  await expect(identityFields).toContainText(/Learned Fields|自学习字段/i);
  await expect(identityFields).toContainText(/Observed Headers|观测请求头/i);
  await expect(
    identityPanel.getByText(/Learned|自学习/i).first(),
  ).toBeVisible();
  await expect(
    identityFields.getByText("websocket-beta").first(),
  ).toBeVisible();
  await expect(identityPanel).not.toContainText("Session_id");
  await expect(identityPanel).not.toContainText("Conversation_id");
  const summaryBox = await identitySummary.boundingBox();
  const fieldsBox = await identityFields.boundingBox();
  if (!summaryBox || !fieldsBox) {
    throw new Error(
      "identity fingerprint summary and fields columns must be visible",
    );
  }
  expect(fieldsBox.x).toBeGreaterThan(summaryBox.x + summaryBox.width - 8);
  const identityDetailScroller = dialog.getByTestId("auth-file-detail-scroll");
  await expect(identityDetailScroller).toHaveCSS("overflow-x", "hidden");
  await expect(identityDetailScroller).toHaveCSS("overflow-y", "hidden");
  const identityTableViewport = identityFields.locator(
    '[data-scrollbar-visibility="hover"]',
  );
  await expect(identityTableViewport).toBeVisible();
  const desktopTableScrollState = await identityTableViewport.evaluate(
    (node: HTMLElement) => {
      node.scrollTop = 120;
      node.scrollLeft = 160;
      const style = window.getComputedStyle(node);
      return {
        canScrollX: node.scrollWidth > node.clientWidth,
        canScrollY: node.scrollHeight > node.clientHeight,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        scrollLeft: node.scrollLeft,
        scrollTop: node.scrollTop,
      };
    },
  );
  expect(desktopTableScrollState.overflowX).toBe("auto");
  expect(desktopTableScrollState.overflowY).toBe("auto");
  expect(desktopTableScrollState.canScrollX).toBe(true);
  expect(desktopTableScrollState.canScrollY).toBe(true);
  expect(desktopTableScrollState.scrollLeft).toBeGreaterThan(0);
  expect(desktopTableScrollState.scrollTop).toBeGreaterThan(0);

  await desktopProfileCard.click();
  await expect(currentOutbound).toContainText("codex_cli_rs / CLI");
  await expect(identityFields).toContainText(codexDesktopUserAgent);
  await expect(identityFields).toContainText("Codex Desktop");
  await expect(identityFields).toContainText(codexDesktopBetaFeatures);
  await expect(identityFields).not.toContainText(codexCLIUserAgent);
  await expect(identityFields).not.toContainText(codexCLIBetaFeatures);

  await identitySummary
    .getByRole("button", { name: /Use for outbound|设为出站身份/i })
    .click();
  await expect(desktopProfileCard).toContainText(/In use|出站中/i);
  await expect(cliProfileCard).not.toContainText(/In use|出站中/i);
  await expect(currentOutbound).toContainText("Codex Desktop / Desktop");
  await expect(identityFields).toContainText(codexDesktopUserAgent);
  await expect(identityFields).not.toContainText(codexCLIUserAgent);

  await dialog.getByRole("button", { name: /^(Close|关闭)$/ }).click();

  const geminiRow = page.locator("tr", { hasText: "Gemini CLI Primary" });
  await expect(geminiRow).toBeVisible();
  await geminiRow.getByRole("button", { name: /Details|详情/i }).click();
  const geminiDialog = page.getByRole("dialog", {
    name: /Gemini CLI Primary|查看/i,
  });
  await expect(geminiDialog).toBeVisible();
  const geminiPanel = geminiDialog.getByTestId(
    "auth-file-identity-fingerprint",
  );
  await expect(geminiPanel).toContainText(/System default|系统默认/i);
  await expect(geminiPanel).toContainText("google-api-nodejs-client/9.16.0");
  await expect(geminiPanel).toContainText("pluginType=GEMINI");
});

test("AI Accounts table shows direct quota metrics and keeps actions fixed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page, "table");
  await routeManagementMocks(page, { withQuotaStatus: true });

  await page.goto("/#/access/ai-accounts");

  const table = page.getByRole("table");
  const codexRow = page.locator("tr", { hasText: "Codex Terminal OAuth" });
  await expect(codexRow).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Quota|配额/i })).toHaveCount(0);
  await expect(codexRow.getByText("Code: 5h")).toBeVisible();
  await expect(codexRow.getByText("Code: Weekly")).toBeVisible();
  await expect(
    codexRow.getByText("GPT-5.3-Codex-Spark Extended Reasoning: Weekly"),
  ).toBeVisible();

  const metrics = codexRow.getByTestId("auth-file-quota-metric");
  await expect(metrics).toHaveCount(3);
  await expect(metrics.nth(0)).toHaveAttribute("data-layout", "compact");
  await expect(metrics.nth(1)).toHaveAttribute("data-layout", "compact");
  await expect(metrics.nth(2)).toHaveAttribute("data-layout", "wide");

  const viewport = table.locator(
    "xpath=ancestor::div[@data-scrollbar-visibility='hover'][1]",
  );
  const actionsCell = codexRow.locator('td[data-vt-column-key="actions"]');
  const viewportBox = await viewport.boundingBox();
  const actionsBefore = await actionsCell.boundingBox();
  if (!viewportBox || !actionsBefore) {
    throw new Error("AI Accounts table viewport and fixed actions cell must be visible");
  }

  await viewport.evaluate((node: HTMLElement) => {
    node.scrollLeft = node.scrollWidth;
  });
  await expect
    .poll(async () => viewport.evaluate((node: HTMLElement) => node.scrollLeft))
    .toBeGreaterThan(0);

  const actionsAfter = await actionsCell.boundingBox();
  if (!actionsAfter) {
    throw new Error("AI Accounts fixed actions cell must remain visible after horizontal scroll");
  }
  expect(Math.abs(actionsAfter.x - actionsBefore.x)).toBeLessThanOrEqual(2);
  expect(actionsAfter.x + actionsAfter.width).toBeLessThanOrEqual(
    viewportBox.x + viewportBox.width + 2,
  );
});

test("AI Accounts keeps card mode usable and redirects old identity route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await setAuthed(page, "cards");
  await routeManagementMocks(page);

  await page.goto("/#/identity-fingerprint");

  await expect(page).toHaveURL(/#\/access\/ai-accounts/);
  await expect(
    page.getByRole("heading", { name: /AI Accounts|AI 账号|Account & Security|账号与安全/i }),
  ).toBeVisible();
  await expect(
    page.locator('a[href="#/access/ai-accounts"]:visible'),
  ).toHaveCount(1);
  await expect(page.locator('a[href="#/auth-files"]')).toHaveCount(0);
  await expect(page.locator('a[href="#/identity-fingerprint"]')).toHaveCount(0);
  await expect(
    page.locator('[class*="group/card"]', { hasText: "Codex Terminal OAuth" }),
  ).toBeVisible();
  await expect(
    page.locator('[class*="group/card"]', { hasText: "Claude OAuth Primary" }),
  ).toBeVisible();

  const cardsRoot = page.getByTestId("auth-files-cards");
  const cardsContent = cardsRoot.locator("[data-scroll-area-content]");
  const codexCard = page.locator('[class*="group/card"]', {
    hasText: "Codex Terminal OAuth",
  });
  const cardsContentBox = await cardsContent.boundingBox();
  const codexCardBox = await codexCard.boundingBox();
  if (!cardsContentBox || !codexCardBox) {
    throw new Error("cards content and codex card must be visible on mobile");
  }
  const leftGap = codexCardBox.x - cardsContentBox.x;
  const rightGap =
    cardsContentBox.x +
    cardsContentBox.width -
    (codexCardBox.x + codexCardBox.width);
  expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2);

  const shellScrollBefore = await page.evaluate(() => {
    const shellScroller =
      document.getElementById("main-content")?.parentElement;
    if (!(shellScroller instanceof HTMLElement)) return null;
    shellScroller.scrollTop = 0;
    return {
      clientHeight: shellScroller.clientHeight,
      scrollHeight: shellScroller.scrollHeight,
      scrollTop: shellScroller.scrollTop,
    };
  });
  if (!shellScrollBefore) {
    throw new Error("AI Accounts shell scroll container must exist");
  }
  expect(shellScrollBefore.scrollHeight).toBeGreaterThan(
    shellScrollBefore.clientHeight + 20,
  );

  const quotaPanel = codexCard.getByTestId("auth-file-card-quota");
  await quotaPanel.scrollIntoViewIfNeeded();
  const shellScrollStart = await page.evaluate(() => {
    const shellScroller =
      document.getElementById("main-content")?.parentElement;
    return shellScroller instanceof HTMLElement ? shellScroller.scrollTop : 0;
  });
  const quotaBox = await quotaPanel.boundingBox();
  if (!quotaBox) {
    throw new Error("Codex quota panel must be visible on mobile");
  }
  await swipeVerticallyFromPoint(
    page,
    quotaBox.x + quotaBox.width / 2,
    quotaBox.y + quotaBox.height / 2,
    -260,
  );

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const shellScroller =
          document.getElementById("main-content")?.parentElement;
        return shellScroller instanceof HTMLElement
          ? shellScroller.scrollTop
          : 0;
      }),
    )
    .toBeGreaterThan(shellScrollStart + 20);
});

test("AI Accounts keeps wide desktop cards stretched in a three-column grid", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await setAuthed(page, "cards");
  await routeManagementMocks(page);

  await page.goto("/#/access/ai-accounts");

  const cardsRoot = page.getByTestId("auth-files-cards");
  const cardsContent = cardsRoot.locator("[data-scroll-area-content]");
  await expect(
    page.locator('[class*="group/card"]', { hasText: "Codex Terminal OAuth" }),
  ).toBeVisible();

  const desktopCardLayout = await cardsContent.evaluate((node: HTMLElement) => {
    const style = window.getComputedStyle(node);
    const cards = Array.from(
      node.querySelectorAll<HTMLElement>('[class*="group/card"]'),
    ).map((card) => {
      const box = card.getBoundingClientRect();
      return {
        x: box.x,
        width: box.width,
        maxWidth: window.getComputedStyle(card).maxWidth,
      };
    });
    return {
      gridTemplateColumns: style.gridTemplateColumns,
      justifyItems: style.justifyItems,
      cards,
    };
  });

  expect(
    desktopCardLayout.gridTemplateColumns.split(" ").filter(Boolean),
  ).toHaveLength(3);
  expect(desktopCardLayout.justifyItems).toBe("stretch");
  expect(desktopCardLayout.cards).toHaveLength(3);
  expect(
    desktopCardLayout.cards.every((card) => card.maxWidth === "none"),
  ).toBe(true);
  expect(desktopCardLayout.cards[1].x).toBeGreaterThan(
    desktopCardLayout.cards[0].x,
  );
  expect(desktopCardLayout.cards[2].x).toBeGreaterThan(
    desktopCardLayout.cards[1].x,
  );
  expect(
    Math.min(...desktopCardLayout.cards.map((card) => card.width)),
  ).toBeGreaterThan(320);
});

test("AI Accounts mobile table scroll chains from the middle of the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await setAuthed(page, "table");
  await routeManagementMocks(page);

  await page.goto("/#/access/ai-accounts");

  const filterToggle = page.getByTestId("auth-files-mobile-filter-toggle");
  await filterToggle.click();
  await expect(filterToggle).toHaveAttribute("aria-expanded", "true");

  const tableViewport = page
    .locator('[data-scrollbar-visibility="hover"]')
    .first();
  await expect(tableViewport).toBeVisible();
  await expect(tableViewport).toHaveCSS("overscroll-behavior-y", "auto");
  const tableScrollMetrics = await tableViewport.evaluate(
    (node: HTMLElement) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
      scrollTop: node.scrollTop,
    }),
  );
  expect(tableScrollMetrics.scrollHeight).toBeLessThanOrEqual(
    tableScrollMetrics.clientHeight + 2,
  );
  expect(tableScrollMetrics.scrollTop).toBe(0);
  await tableViewport.evaluate((node: HTMLElement) =>
    node.scrollIntoView({ block: "start", inline: "nearest" }),
  );

  const shellScrollState = await page.evaluate(() => {
    const shellScroller =
      document.getElementById("main-content")?.parentElement;
    if (!(shellScroller instanceof HTMLElement)) return null;
    return {
      clientHeight: shellScroller.clientHeight,
      scrollHeight: shellScroller.scrollHeight,
      scrollTop: shellScroller.scrollTop,
      maxScrollTop: shellScroller.scrollHeight - shellScroller.clientHeight,
    };
  });
  if (!shellScrollState) {
    throw new Error("AI Accounts shell scroll container must exist");
  }
  expect(shellScrollState.scrollHeight).toBeGreaterThan(
    shellScrollState.clientHeight + 20,
  );
  expect(shellScrollState.scrollTop).toBeGreaterThan(20);

  const box = await tableViewport.boundingBox();
  const viewportSize = page.viewportSize();
  if (!box) {
    throw new Error(
      "AI Accounts table viewport must be visible on mobile",
    );
  }
  if (!viewportSize) {
    throw new Error("AI Accounts mobile viewport must be available");
  }
  const visibleLeft = Math.max(box.x, 16);
  const visibleRight = Math.min(box.x + box.width, viewportSize.width - 16);
  const visibleTop = Math.max(box.y, 80);
  const visibleBottom = Math.min(box.y + box.height, viewportSize.height - 80);
  expect(visibleRight).toBeGreaterThan(visibleLeft + 20);
  expect(visibleBottom).toBeGreaterThan(visibleTop + 20);
  await swipeVerticallyFromPoint(
    page,
    (visibleLeft + visibleRight) / 2,
    (visibleTop + visibleBottom) / 2,
    260,
  );

  await expect
    .poll(async () =>
      page.evaluate(() => {
        const shellScroller =
          document.getElementById("main-content")?.parentElement;
        return shellScroller instanceof HTMLElement
          ? shellScroller.scrollTop
          : 0;
      }),
    )
    .toBeLessThan(shellScrollState.scrollTop);
});

test("AI Accounts identity detail stacks cleanly on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setAuthed(page, "cards");
  await routeManagementMocks(page);

  await page.goto("/#/access/ai-accounts");

  const codexCard = page.locator('[class*="group/card"]', {
    hasText: "Codex Terminal OAuth",
  });
  await expect(codexCard).toBeVisible();
  await codexCard.getByRole("button", { name: /Details|详情/i }).click();

  const dialog = page.getByRole("dialog", {
    name: /Codex Terminal OAuth|查看/i,
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /Identity|身份/i }).click();

  const identityPanel = dialog.getByTestId("auth-file-identity-fingerprint");
  const identitySummary = identityPanel.getByTestId(
    "auth-file-identity-summary",
  );
  const identityFields = identityPanel.getByTestId("auth-file-identity-fields");
  await expect(identitySummary).toContainText("authsub_codex_terminal");
  await expect(
    identityFields.getByText("websocket-beta").first(),
  ).toBeVisible();

  const summaryBox = await identitySummary.boundingBox();
  const fieldsBox = await identityFields.boundingBox();
  if (!summaryBox || !fieldsBox) {
    throw new Error(
      "identity fingerprint summary and fields columns must be visible on mobile",
    );
  }
  expect(fieldsBox.y).toBeGreaterThan(summaryBox.y + summaryBox.height - 8);
  expect(Math.abs(fieldsBox.x - summaryBox.x)).toBeLessThanOrEqual(8);
  const detailScroller = dialog.getByTestId("auth-file-detail-scroll");
  await expect(detailScroller).toHaveCSS("overflow-x", "hidden");
  await expect(detailScroller).toHaveCSS("overflow-y", "auto");
  const mobileTable = identityFields.getByTestId(
    "auth-file-identity-table-mobile",
  );
  await expect(mobileTable).toBeVisible();
  await expect(mobileTable.locator("[data-vt-natural-flow]")).toBeVisible();
  await expect(
    identityFields.locator('[data-scrollbar-visibility="hover"]'),
  ).toHaveCount(0);

  const detailScrollState = await detailScroller.evaluate(
    (node: HTMLElement) => {
      node.scrollTop = 160;
      const style = window.getComputedStyle(node);
      return {
        canScrollY: node.scrollHeight > node.clientHeight,
        overflowY: style.overflowY,
        scrollTop: node.scrollTop,
      };
    },
  );
  expect(detailScrollState.overflowY).toBe("auto");
  expect(detailScrollState.canScrollY).toBe(true);
  expect(detailScrollState.scrollTop).toBeGreaterThan(0);

  const mobileTableScrollState = await mobileTable.evaluate(
    (node: HTMLElement) => {
      node.scrollLeft = 160;
      const style = window.getComputedStyle(node);
      return {
        canScrollX: node.scrollWidth > node.clientWidth,
        overflowX: style.overflowX,
        scrollLeft: node.scrollLeft,
      };
    },
  );
  expect(mobileTableScrollState.overflowX).toBe("auto");
  expect(mobileTableScrollState.canScrollX).toBe(true);
  expect(mobileTableScrollState.scrollLeft).toBeGreaterThan(0);

  await mobileTable.evaluate((node: HTMLElement) => {
    node.scrollIntoView({ block: "center", inline: "nearest" });
  });
  const mobileTableBox = await mobileTable.boundingBox();
  const viewportSize = page.viewportSize();
  if (!mobileTableBox || !viewportSize) {
    throw new Error("mobile identity fingerprint table must be visible");
  }
  const visibleLeft = Math.max(mobileTableBox.x, 16);
  const visibleRight = Math.min(
    mobileTableBox.x + mobileTableBox.width,
    viewportSize.width - 16,
  );
  const visibleTop = Math.max(mobileTableBox.y, 120);
  const visibleBottom = Math.min(
    mobileTableBox.y + mobileTableBox.height,
    viewportSize.height - 96,
  );
  expect(visibleRight).toBeGreaterThan(visibleLeft + 20);
  expect(visibleBottom).toBeGreaterThan(visibleTop + 20);
  await swipeVerticallyFromPoint(
    page,
    (visibleLeft + visibleRight) / 2,
    (visibleTop + visibleBottom) / 2,
    -260,
  );
  await expect
    .poll(async () =>
      detailScroller.evaluate((node: HTMLElement) => node.scrollTop),
    )
    .toBeGreaterThan(20);

  const documentOverflowX = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(documentOverflowX).toBeLessThanOrEqual(2);
});
