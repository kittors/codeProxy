import { expect, test, type Page } from "@playwright/test";

type RuntimeProvider = "codex" | "claude" | "gemini";
type ProviderConfig = Record<string, unknown>;
type RuntimeRecord = {
  provider: RuntimeProvider;
  account_key: string;
  [key: string]: unknown;
};
type CurrentIdentityPayload = {
  "identity-fingerprint": Record<RuntimeProvider, ProviderConfig>;
  defaults: Record<RuntimeProvider, ProviderConfig>;
  learned: Record<RuntimeProvider, RuntimeRecord[]>;
  effective: Record<RuntimeProvider, RuntimeRecord[]>;
  status: Record<RuntimeProvider, { enabled: boolean; learned_count: number }>;
};
type ManagementMockState = {
  identityPuts: Array<Record<RuntimeProvider, ProviderConfig>>;
  learnedDeletes: Array<{ provider: RuntimeProvider; accountKey: string; deleted: number }>;
  configYamlSaves: string[];
  getIdentityPayload: () => CurrentIdentityPayload;
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
  });
};

const identityPayload: CurrentIdentityPayload = {
  "identity-fingerprint": {
    codex: {
      enabled: false,
      "user-agent": "codex_cli_rs/0.125.0 (Mac OS 26.0; arm64)",
      version: "0.125.0",
      originator: "codex_cli_rs",
      "websocket-beta": "responses_websockets=old",
      "x-codex-beta-features": "",
      "session-mode": "per-request",
      "custom-headers": {
        "X-Old-Fingerprint": "stale",
      },
    },
    claude: {},
    gemini: {
      enabled: true,
      "user-agent": "",
      "x-goog-api-client": "",
      "client-metadata": "",
      "custom-headers": {},
    },
  },
  defaults: {
    codex: {
      enabled: false,
      "user-agent": "codex_cli_rs/default",
      version: "0.125.0",
      originator: "codex_cli_rs",
      "websocket-beta": "responses_websockets=default",
      "x-codex-beta-features": "",
      "session-mode": "per-request",
      "custom-headers": {},
    },
    claude: {},
    gemini: {
      enabled: false,
      "user-agent": "google-api-nodejs-client/9.15.1",
      "x-goog-api-client": "gl-node/22.17.0",
      "client-metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
      "custom-headers": {},
    },
  },
  learned: {
    codex: [
      {
        provider: "codex",
        account_key: "codex-e2e-account",
        auth_subject_id: "codex-e2e-subject",
        client_product: "codex_cli_rs",
        client_variant: "codex_cli_rs",
        version: "0.130.0",
        fields: {
          "user-agent": "codex_cli_rs/0.130.0 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9",
          version: "0.130.0",
          originator: "codex_cli_rs",
          "x-codex-beta-features": "compact_mode",
        },
        observed_headers: {
          "User-Agent": "codex_cli_rs/0.130.0 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9",
          Version: "0.130.0",
          Originator: "codex_cli_rs",
          "X-Codex-Beta-Features": "compact_mode",
        },
        created_at: "2026-06-23T08:00:00Z",
        updated_at: "2026-06-23T08:05:00Z",
        last_seen_at: "2026-06-23T08:05:00Z",
      },
    ],
    claude: [
      {
        provider: "claude",
        account_key: "claude-e2e-account",
        auth_subject_id: "claude-e2e-subject",
        client_product: "claude-cli",
        client_variant: "cli",
        version: "2.1.200",
        fields: {
          "user-agent": "claude-cli/2.1.200 (external, cli)",
          "cli-version": "2.1.200",
          entrypoint: "cli",
          "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
        },
        observed_headers: {
          "User-Agent": "claude-cli/2.1.200 (external, cli)",
          "X-App": "cli",
        },
        created_at: "2026-06-23T08:00:00Z",
        updated_at: "2026-06-23T08:05:00Z",
        last_seen_at: "2026-06-23T08:05:00Z",
      },
    ],
    gemini: [
      {
        provider: "gemini",
        account_key: "gemini-e2e-account",
        auth_subject_id: "gemini-e2e-subject",
        client_product: "google-api-nodejs-client",
        client_variant: "cli",
        version: "9.16.0",
        fields: {
          "user-agent": "google-api-nodejs-client/9.16.0",
          "x-goog-api-client": "gl-node/24.1.0",
          "client-metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
        },
        observed_headers: {
          "User-Agent": "google-api-nodejs-client/9.16.0",
          "X-Goog-Api-Client": "gl-node/24.1.0",
          "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
        },
        created_at: "2026-06-23T08:00:00Z",
        updated_at: "2026-06-23T08:05:00Z",
        last_seen_at: "2026-06-23T08:05:00Z",
      },
    ],
  },
  effective: {
    codex: [
      {
        provider: "codex",
        account_key: "codex-e2e-account",
        auth_subject_id: "codex-e2e-subject",
        enabled: false,
        client_product: "codex_cli_rs",
        version: "0.130.0",
        fields: {
          "user-agent": {
            value: "codex_cli_rs/0.130.0 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9",
            source: "learned",
          },
          version: { value: "0.130.0", source: "learned" },
          originator: { value: "codex_cli_rs", source: "learned" },
          "websocket-beta": { value: "responses_websockets=default", source: "default" },
          "x-codex-beta-features": { value: "compact_mode", source: "learned" },
        },
      },
    ],
    claude: [
      {
        provider: "claude",
        account_key: "claude-e2e-account",
        auth_subject_id: "claude-e2e-subject",
        enabled: false,
        client_product: "claude-cli",
        version: "2.1.200",
        fields: {
          "user-agent": { value: "claude-cli/2.1.200 (external, cli)", source: "learned" },
          "cli-version": { value: "2.1.200", source: "learned" },
          entrypoint: { value: "cli", source: "learned" },
        },
      },
    ],
    gemini: [
      {
        provider: "gemini",
        account_key: "gemini-e2e-account",
        auth_subject_id: "gemini-e2e-subject",
        enabled: true,
        client_product: "google-api-nodejs-client",
        version: "9.16.0",
        fields: {
          "user-agent": { value: "google-api-nodejs-client/9.16.0", source: "learned" },
          "x-goog-api-client": { value: "gl-node/24.1.0", source: "learned" },
          "client-metadata": {
            value: "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
            source: "learned",
          },
        },
      },
    ],
  },
  status: {
    codex: { enabled: false, learned_count: 1 },
    claude: { enabled: false, learned_count: 1 },
    gemini: { enabled: true, learned_count: 1 },
  },
};

const configYaml = `
gemini-api-key:
  - api-key: "gemini-key"
    headers:
      User-Agent: "gemini-cli/test"
kimi-header-defaults:
  user-agent: "KimiCLI/test"
  platform: "kimi_cli"
  version: "1.9.0"
`;

const desktopUserAgent =
  "Codex Desktop/0.140.0-alpha.2 (Windows 10.0.26200; x86_64) unknown (Codex Desktop; 26.609.41114)";

const recommendationsPayload = {
  items: [
    {
      id: "codex-cli",
      count: 84,
      first_seen_at: "2026-06-14T12:00:00Z",
      last_seen_at: "2026-06-14T12:30:00Z",
      headers: {
        "User-Agent": "codex-tui/0.125.0 (Mac OS 26.5; arm64)",
        Version: "0.125.0",
        Originator: "codex-tui",
        "X-Codex-Beta-Features": "exec_command_v2",
      },
      recommended: {
        enabled: true,
        "user-agent": "codex-tui/0.125.0 (Mac OS 26.5; arm64)",
        version: "0.125.0",
        originator: "codex-tui",
        "session-mode": "per-request",
        "custom-headers": {
          "X-Codex-Beta-Features": "exec_command_v2",
        },
      },
      ignored_headers: {
        Session_id: "sess...cli",
      },
      samples: [],
    },
    {
      id: "codex-desktop",
      count: 116,
      first_seen_at: "2026-06-14T13:01:00Z",
      last_seen_at: "2026-06-14T13:30:00Z",
      headers: {
        "User-Agent": desktopUserAgent,
        Originator: "Codex Desktop",
        "X-Codex-Beta-Features": "terminal_resize_reflow,memories,remote_compaction_v2",
        "X-Codex-Turn-Metadata": '{"sample":"metadata"}',
      },
      recommended: {
        enabled: true,
        "user-agent": desktopUserAgent,
        originator: "Codex Desktop",
        "session-mode": "per-request",
        "custom-headers": {
          "X-Codex-Beta-Features": "terminal_resize_reflow,memories,remote_compaction_v2",
        },
      },
      ignored_headers: {
        Session_id: "sess...desktop",
        "X-Codex-Turn-Metadata": '{"sample":"metadata"}',
      },
      samples: [
        {
          log_id: 203,
          timestamp: "2026-06-14T13:30:00Z",
          model: "gpt-5",
          source: "codex",
          channel_name: "Codex",
          auth_index: "auth-1",
          failed: false,
          method: "POST",
          path: "/v1/responses",
        },
      ],
    },
  ],
  days: 7,
  limit: 200,
  inspected: 200,
  matched: 200,
};

const isRuntimeProvider = (value: string | null): value is RuntimeProvider =>
  value === "codex" || value === "claude" || value === "gemini";

const parseRequestObject = (raw: string | null): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(raw || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed));
};

const asProviderConfig = (value: unknown): ProviderConfig => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value));
};

const routeManagementMocks = async (page: Page): Promise<ManagementMockState> => {
  let currentIdentityPayload = structuredClone(identityPayload);
  const mockState: ManagementMockState = {
    identityPuts: [],
    learnedDeletes: [],
    configYamlSaves: [],
    getIdentityPayload: () => currentIdentityPayload,
  };

  await page.route("**/v0/management/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path.endsWith("/v0/management/config.yaml")) {
      if (route.request().method() === "PUT") {
        mockState.configYamlSaves.push(route.request().postData() || "");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "ok" }),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: "text/yaml", body: configYaml });
      return;
    }

    if (path.endsWith("/v0/management/identity-fingerprint/codex/recommendations")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(recommendationsPayload),
      });
      return;
    }

    if (path.endsWith("/v0/management/identity-fingerprint/learned")) {
      if (route.request().method() === "DELETE") {
        const provider = url.searchParams.get("provider");
        const accountKey = url.searchParams.get("account_key") || "";
        let deleted = 0;
        if (isRuntimeProvider(provider)) {
          const previousLearned = currentIdentityPayload.learned[provider];
          const nextLearned = previousLearned.filter((record) => record.account_key !== accountKey);
          deleted = previousLearned.length - nextLearned.length;
          currentIdentityPayload = {
            ...currentIdentityPayload,
            learned: {
              ...currentIdentityPayload.learned,
              [provider]: nextLearned,
            },
            effective: {
              ...currentIdentityPayload.effective,
              [provider]: currentIdentityPayload.effective[provider].filter(
                (record) => record.account_key !== accountKey,
              ),
            },
            status: {
              ...currentIdentityPayload.status,
              [provider]: {
                ...currentIdentityPayload.status[provider],
                learned_count: nextLearned.length,
              },
            },
          };
          mockState.learnedDeletes.push({ provider, accountKey, deleted });
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ deleted }),
        });
        return;
      }

      await route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ error: "method not allowed" }),
      });
      return;
    }

    if (path.endsWith("/v0/management/identity-fingerprint")) {
      if (route.request().method() === "PUT") {
        const body = parseRequestObject(route.request().postData());
        const nextConfig = {
          codex: asProviderConfig(body.codex),
          claude: asProviderConfig(body.claude),
          gemini: asProviderConfig(body.gemini),
        };
        mockState.identityPuts.push(nextConfig);
        currentIdentityPayload = {
          ...currentIdentityPayload,
          "identity-fingerprint": {
            ...currentIdentityPayload["identity-fingerprint"],
            ...nextConfig,
          },
          defaults: identityPayload.defaults,
        };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "ok" }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentIdentityPayload),
      });
      return;
    }

    if (path.endsWith("/v0/management/config")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  return mockState;
};

const hasFormValue = (page: Page, value: string) =>
  page.evaluate((expected) => {
    return Array.from(document.querySelectorAll("input, textarea")).some((element) => {
      return (element as HTMLInputElement | HTMLTextAreaElement).value === expected;
    });
  }, value);

test("Codex fingerprint recommendations modal stays contained and requires confirmation", async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  const mockState = await routeManagementMocks(page);
  await page.goto("/manage/#/identity-fingerprint");

  await page.getByRole("button", { name: /Generate from recent requests|从近期请求生成/i }).click();
  const modal = page.getByRole("dialog", { name: /Codex Fingerprint Recommendations|Codex 推荐指纹/i });
  await expect(modal).toBeVisible();
  await expect(modal.getByText(/Checked 200 requests|已检查 200 条请求/i)).toBeVisible();
  await expect(modal.getByText(/^Actions$|^操作$/)).toHaveCount(0);

  const desktopRow = modal.locator("tbody tr", { hasText: "Codex Desktop" });
  await expect(desktopRow).toHaveCount(1);
  await desktopRow.click();
  await expect(desktopRow).toHaveAttribute("aria-selected", "true");
  await expect(modal.getByText(desktopUserAgent)).toHaveCount(2);

  const overflow = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      dialogClientWidth: dialog?.clientWidth ?? 0,
      dialogScrollWidth: dialog?.scrollWidth ?? 0,
    };
  });
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  expect(overflow.dialogScrollWidth).toBeLessThanOrEqual(overflow.dialogClientWidth + 1);

  await modal.getByRole("button", { name: /Apply and save|应用并保存/i }).click();
  await expect.poll(() => hasFormValue(page, desktopUserAgent)).toBe(false);

  const confirm = page.getByRole("dialog", {
    name: /Apply this recommended fingerprint|应用这条推荐指纹/i,
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: /Apply and save|应用并保存/i }).click();

  await expect.poll(() => hasFormValue(page, desktopUserAgent)).toBe(true);
  await page.reload();
  await expect.poll(() => hasFormValue(page, desktopUserAgent)).toBe(true);
  expect(mockState.identityPuts).toHaveLength(1);
  expect(mockState.identityPuts[0]?.codex).toEqual(
    expect.objectContaining({
      enabled: true,
      "user-agent": desktopUserAgent,
      originator: "Codex Desktop",
      "x-codex-beta-features": "terminal_resize_reflow,memories,remote_compaction_v2",
      "custom-headers": {},
    }),
  );
  expect(mockState.identityPuts[0]?.gemini).toEqual(
    expect.objectContaining({
      enabled: true,
    }),
  );
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("learned runtime state is visible per provider and can be cleared by account", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  const mockState = await routeManagementMocks(page);
  await page.goto("/manage/#/identity-fingerprint");

  await expect(page.getByText("codex-e2e-account").first()).toBeVisible();
  await expect(page.getByText("compact_mode").first()).toBeVisible();
  await expect(page.getByText(/^learned$/i).first()).toBeVisible();

  await page.getByRole("tab", { name: "Claude" }).click();
  await expect(page.getByText("claude-e2e-account").first()).toBeVisible();
  await expect(page.getByText("claude-cli/2.1.200 (external, cli)").first()).toBeVisible();

  await page.getByRole("tab", { name: "Gemini" }).click();
  await expect(page.getByText("gemini-e2e-account").first()).toBeVisible();
  await expect(page.getByText("gl-node/24.1.0").first()).toBeVisible();

  await page.getByRole("tab", { name: "Codex" }).click();
  const deleteRequest = page.waitForRequest(
    (request) =>
      request.method() === "DELETE" &&
      request.url().includes("/v0/management/identity-fingerprint/learned"),
  );
  await page.getByRole("button", { name: /Clear learned|清除学习/i }).click();
  const request = await deleteRequest;
  const deleteUrl = new URL(request.url());

  expect(deleteUrl.searchParams.get("provider")).toBe("codex");
  expect(deleteUrl.searchParams.get("account_key")).toBe("codex-e2e-account");
  await expect(page.getByText("codex-e2e-account")).toHaveCount(0);
  expect(mockState.learnedDeletes).toEqual([
    { provider: "codex", accountKey: "codex-e2e-account", deleted: 1 },
  ]);
  expect(mockState.identityPuts).toHaveLength(0);
});

test("Gemini OAuth CLI fingerprint saves through identity API without touching API-key headers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setAuthed(page);
  const mockState = await routeManagementMocks(page);
  await page.goto("/manage/#/identity-fingerprint");

  await page.getByRole("tab", { name: "Gemini" }).click();
  const oauthPanel = page.locator("section", {
    has: page.getByRole("heading", {
      name: /Gemini OAuth\/CLI Fingerprint|Gemini OAuth\/CLI 指纹/i,
    }),
  }).last();
  await expect(oauthPanel).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Gemini API Key Headers|Gemini API Key 请求头/i }),
  ).toBeVisible();

  const autoLearnInputs = oauthPanel.locator("input");
  await expect(autoLearnInputs).toHaveCount(3);
  await autoLearnInputs.nth(0).fill("google-api-nodejs-client/9.17.0");
  await autoLearnInputs.nth(1).fill("gl-node/24.5.0");
  await autoLearnInputs
    .nth(2)
    .fill("ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI");

  const putRequest = page.waitForRequest(
    (request) =>
      request.method() === "PUT" &&
      new URL(request.url()).pathname.endsWith("/v0/management/identity-fingerprint"),
  );
  await page.getByRole("button", { name: /Save Gemini Fingerprint|保存 Gemini 指纹/i }).click();
  await putRequest;

  await expect.poll(() => mockState.identityPuts.length).toBe(1);
  expect(mockState.identityPuts[0]?.gemini).toEqual(
    expect.objectContaining({
      enabled: true,
      "user-agent": "google-api-nodejs-client/9.17.0",
      "x-goog-api-client": "gl-node/24.5.0",
      "client-metadata":
        "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
    }),
  );
  expect(mockState.identityPuts[0]?.codex).toEqual(
    expect.objectContaining({
      "user-agent": "codex_cli_rs/0.125.0 (Mac OS 26.0; arm64)",
    }),
  );
  expect(mockState.configYamlSaves).toEqual([]);
  await expect.poll(() => hasFormValue(page, "google-api-nodejs-client/9.17.0")).toBe(true);
  expect(mockState.getIdentityPayload()["identity-fingerprint"].gemini).toEqual(
    expect.objectContaining({
      "x-goog-api-client": "gl-node/24.5.0",
    }),
  );
});
