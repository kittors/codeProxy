import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiKeyLookupPage } from "../ApiKeyLookupPage";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";
import type { PublicLogItem, PublicLogsResponse } from "../types";

const mocks = vi.hoisted(() => ({
  fetchPublicLogs: vi.fn(
    async (): Promise<PublicLogsResponse> => ({
      items: [],
      total: 0,
      page: 1,
      size: 50,
      api_key_name: "Primary key",
      stats: {
        total: 0,
        success_rate: 0,
        total_tokens: 0,
        total_sessions: 0,
        total_cost: 0,
      },
      filters: { models: [], channels: [], statuses: ["success", "failed"] },
    }),
  ),
  fetchPublicChartData: vi.fn(
    async (_params?: {
      apiKey: string;
      portalAccount?: boolean;
      days?: number;
      signal?: AbortSignal;
    }) => ({
      daily_series: [],
      heatmap_series: [],
      model_distribution: [],
      api_key_name: "Primary key",
      stats: {
        total: 0,
        success_rate: 0,
        total_tokens: 0,
        total_sessions: 0,
        total_cost: 0,
      },
    }),
  ),
  fetchAvailableModels: vi.fn(
    async (): Promise<
      Array<{
        id: string;
        description: string;
        ownedBy: string;
        pricing: {
          mode: "token" | "call";
          inputPricePerMillion: number;
          outputPricePerMillion: number;
          cachedPricePerMillion: number;
          cacheReadPricePerMillion: number;
          cacheWritePricePerMillion: number;
          pricePerCall: number;
        };
        inputModalities: string[];
        outputModalities: string[];
        supportsVision: boolean;
      }>
    > => [],
  ),
  fetchPublicUsageSummary: vi.fn(async () => ({
    found: true,
    range: "today",
    stats: { total_calls: 0, quota_cost: 0 },
    limits: null,
  })),
}));

type ChartResponse = Awaited<ReturnType<typeof mocks.fetchPublicChartData>>;

const chartResponse = (total: number, apiKeyName = "Primary key"): ChartResponse => ({
  daily_series: [],
  heatmap_series: [],
  model_distribution: [],
  api_key_name: apiKeyName,
  stats: {
    total,
    success_rate: 100,
    total_tokens: total * 10,
    total_sessions: 1,
    total_cost: 0,
  },
});

vi.mock("../api", () => ({
  fetchPublicLogs: mocks.fetchPublicLogs,
  fetchPublicChartData: mocks.fetchPublicChartData,
  fetchAvailableModels: mocks.fetchAvailableModels,
  fetchPublicUsageSummary: mocks.fetchPublicUsageSummary,
}));

vi.mock("../components/UsageTabSection", () => ({
  UsageTabSection: ({
    chartLoading,
    chartStats,
  }: {
    chartLoading: boolean;
    chartStats?: { total: number };
  }) => (
    <div data-testid="usage-tab" data-loading={String(chartLoading)}>
      {chartStats?.total ?? "no-stats"}
    </div>
  ),
}));

vi.mock("@features/log-content-viewer", () => ({
  LogContentModal: () => null,
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    portalApi: {
      loadSession: vi.fn(() => null),
      clearSession: () => undefined,
      listSavedAccounts: vi.fn(() => []),
      removeSavedAccount: vi.fn(),
      beginAddAccount: vi.fn(),
      switchAccount: vi.fn(() => null),
      client: { setSession: vi.fn() },
      login: vi.fn(),
      logout: vi.fn(async () => undefined),
      me: vi.fn(),
      listKeys: vi.fn(async () => ({ items: [] })),
      keySecret: vi.fn(),
      createKey: vi.fn(),
      updateKey: vi.fn(),
      resetKeyDailySpending: vi.fn(),
      listKeyDailySpendingResetHistory: vi.fn(),
      rotateKey: vi.fn(),
      deleteKey: vi.fn(),
      changePassword: vi.fn(),
    },
  };
});

describe("ApiKeyLookupPage", () => {
  beforeEach(async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/manage/apikey-lookup");
    vi.clearAllMocks();
    const { portalApi } = await import("@code-proxy/api-client");
    vi.mocked(portalApi.loadSession).mockReturnValue(null);
  });

  test("shows landing first, then opens login modal from CTA", async () => {
    const { portalApi } = await import("@code-proxy/api-client");
    vi.mocked(portalApi.login).mockResolvedValue({
      user: {
        id: "u1",
        tenant_id: "t1",
        username: "alice",
        display_name: "Alice",
        status: "active",
        must_change_password: false,
        failed_login_count: 0,
        lock_stage: 0,
        created_at: "",
        updated_at: "",
        version: 1,
      },
      access_token: "cpt_test",
      refresh_token: "cpr_test",
      must_change_password: false,
    } as never);
    vi.mocked(portalApi.listKeys).mockResolvedValue({
      items: [
        {
          id: "k1",
          tenant_id: "t1",
          end_user_id: "u1",
          name: "default",
          key_masked: "sk-****",
          disabled: false,
          is_default: true,
          created_at: "",
          updated_at: "",
        },
      ],
    } as never);
    vi.mocked(portalApi.keySecret).mockResolvedValue({ id: "k1", key: "sk-new-key" });

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const landing = screen.getByTestId("apikey-lookup-landing");
    expect(landing).toBeInTheDocument();
    expect(landing.closest(".bg-zinc-50")).not.toBeNull();
    expect(
      within(screen.getByTestId("apikey-lookup-header")).getByText("Code Proxy"),
    ).toBeInTheDocument();
    expect(
      within(landing).getByRole("heading", {
        level: 1,
        name: /one entry point|一个入口/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(within(landing).getByRole("button", { name: /^(login|sign in|登录)$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter username|请输入账号/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter api key|输入 API 密钥/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/enter username|请输入账号/i), "alice");
    await userEvent.type(screen.getByPlaceholderText(/enter password|请输入密码/i), "password123");
    await userEvent.click(within(dialog).getByRole("button", { name: /^(login|sign in|登录)$/i }));

    await waitFor(() => {
      expect(portalApi.login).toHaveBeenCalledWith("alice", "password123", true);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("apikey-lookup-landing")).not.toBeInTheDocument();
    });
    expect(await screen.findByTestId("usage-tab")).toBeInTheDocument();
  });

  test("allows dismissing the login modal from the landing page", async () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const landing = screen.getByTestId("apikey-lookup-landing");
    await userEvent.click(within(landing).getByRole("button", { name: /^(login|sign in|登录)$/i }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.click(within(dialog).getByRole("button", { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("apikey-lookup-landing")).toBeInTheDocument();
  });

  test("localizes invalid credentials on portal login failure", async () => {
    const { portalApi, ApiClientError } = await import("@code-proxy/api-client");
    vi.mocked(portalApi.login).mockRejectedValue(
      new ApiClientError({
        message: "invalid credentials",
        status: 401,
        data: { error: { code: "invalid_credentials", message: "invalid credentials" } },
      }),
    );

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const landing = screen.getByTestId("apikey-lookup-landing");
    await userEvent.click(within(landing).getByRole("button", { name: /^(login|sign in|登录)$/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(screen.getByPlaceholderText(/enter username|请输入账号/i), "alice");
    await userEvent.type(screen.getByPlaceholderText(/enter password|请输入密码/i), "bad-pass");
    await userEvent.click(within(dialog).getByRole("button", { name: /^(login|sign in|登录)$/i }));

    await waitFor(() => {
      expect(
        within(dialog).getByText(/incorrect username or password|用户名或密码错误/i),
      ).toBeInTheDocument();
    });
    expect(within(dialog).queryByText(/invalid credentials/i)).not.toBeInTheDocument();
  });

  test("loads an explicit legacy API key from the URL without persisting the secret", async () => {
    window.history.replaceState({}, "", "/manage/apikey-lookup?api_key=sk-restored-key");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(mocks.fetchPublicChartData).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-restored-key" }),
      );
    });
    expect(mocks.fetchPublicLogs).not.toHaveBeenCalled();
    expect(await screen.findByTestId("apikey-lookup-account-menu")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("apiKeyLookup.lastApiKey.v1")).toBeNull();
    expect(window.location.search).toBe("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("portal account usage ignores a stale stored secret and does not expose set-default", async () => {
    const { portalApi } = await import("@code-proxy/api-client");
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-stale-empty-key");
    vi.mocked(portalApi.loadSession).mockReturnValue({
      apiBase: "http://relay.test",
      accessToken: "cpt_account",
      refreshToken: "cpr_account",
      remember: false,
      expiresAt: Date.now() + 60_000,
    });
    vi.mocked(portalApi.me).mockResolvedValue({
      user: {
        id: "u-account",
        tenant_id: "t-account",
        username: "alice",
        display_name: "Alice",
        status: "active",
        must_change_password: false,
        created_at: "",
        updated_at: "",
        version: 1,
      },
    } as never);
    vi.mocked(portalApi.listKeys).mockResolvedValue({
      items: [
        {
          id: "k-empty",
          tenant_id: "t-account",
          end_user_id: "u-account",
          name: "New empty key",
          key_masked: "sk-****",
          disabled: false,
          is_default: false,
        },
      ],
    } as never);
    vi.mocked(portalApi.keySecret).mockResolvedValue({ id: "k-empty", key: "sk-empty" });
    mocks.fetchPublicChartData.mockResolvedValueOnce(chartResponse(37, "Alice"));

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    // Stored portal session must not flash the public landing before /me resolves.
    expect(screen.queryByTestId("apikey-lookup-landing")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.fetchPublicChartData).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "", portalAccount: true }),
      );
    });
    expect(await screen.findByTestId("usage-tab")).toHaveTextContent("37");
    expect(window.sessionStorage.getItem("apiKeyLookup.lastApiKey.v1")).toBeNull();

    await userEvent.click(
      await screen.findByRole("tab", { name: /manage api keys|管理 api key/i }),
    );
    expect(
      screen.queryByRole("button", { name: /set as default|设默认/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^default$|^默认$/i)).not.toBeInTheDocument();
  });

  test("hides channel controls and keeps input/output cells non-interactive on public logs", async () => {
    window.history.replaceState({}, "", "/manage/apikey-lookup?api_key=sk-restored-key");
    mocks.fetchPublicLogs.mockResolvedValueOnce({
      items: [
        {
          id: 1,
          timestamp: new Date("2026-07-05T03:01:18Z").toISOString(),
          channel_name: "owner@example.com",
          provider: "codex",
          auth_type: "oauth",
          model: "gpt-5.5",
          failed: false,
          streaming: true,
          latency_ms: 1000,
          first_token_ms: 100,
          input_tokens: 12_345,
          cached_tokens: 0,
          output_tokens: 6_789,
          total_tokens: 19_134,
          cost: 0,
          has_content: true,
        },
      ],
      total: 1,
      page: 1,
      size: 50,
      api_key_name: "Primary key",
      stats: {
        total: 1,
        success_rate: 100,
        total_tokens: 19_134,
        total_sessions: 1,
        total_cost: 0,
      },
      filters: {
        models: ["gpt-5.5"],
        channels: ["owner@example.com"],
        channel_options: [
          {
            value: "authsub_codex_owner",
            label: "owner@example.com",
            provider: "codex",
            auth_type: "oauth",
          },
        ],
        statuses: ["success", "failed"],
      },
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await userEvent.click(await screen.findByRole("tab", { name: /request logs/i }));
    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenCalled();
    });

    expect(screen.queryByRole("columnheader", { name: /channel|渠道/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /filter by channel/i })).not.toBeInTheDocument();
    expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "12,345" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "6,789" })).not.toBeInTheDocument();
    expect(screen.getByText("12,345")).toBeInTheDocument();
    expect(screen.getByText("6,789")).toBeInTheDocument();
  });

  test("loads public logs only after switching to the request logs tab", async () => {
    window.history.replaceState({}, "", "/manage/apikey-lookup?api_key=sk-restored-key");
    const logItem: PublicLogItem = {
      id: 1,
      timestamp: new Date("2026-07-05T03:01:18Z").toISOString(),
      channel_name: "Codex 主渠道",
      api_key_name: "Alice",
      end_user_display_name: "Alice",
      api_key_own_name: "Laptop",
      model: "gpt-5.5",
      failed: false,
      streaming: true,
      latency_ms: 15100,
      first_token_ms: 1650,
      input_tokens: 54908,
      cached_tokens: 50048,
      output_tokens: 649,
      total_tokens: 55557,
      cost: 0.0688,
      has_content: false,
    };
    mocks.fetchPublicLogs.mockResolvedValueOnce({
      items: [logItem],
      total: 1,
      page: 1,
      size: 50,
      api_key_name: "Primary key",
      stats: {
        total: 1,
        success_rate: 100,
        total_tokens: 55557,
        total_sessions: 1,
        total_cost: 0.0688,
      },
      filters: {
        models: ["gpt-5.5"],
        channels: ["Codex 主渠道"],
        channel_options: [
          {
            value: "authsub_codex_main",
            label: "Codex 主渠道",
            provider: "codex",
            auth_type: "oauth",
          },
        ],
        statuses: ["success", "failed"],
      },
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(mocks.fetchPublicChartData).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-restored-key" }),
      );
    });
    expect(mocks.fetchPublicLogs).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("tab", { name: /request logs/i }));

    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-restored-key", page: 1 }),
      );
    });
    expect(screen.getAllByText(/response metrics/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("Codex 主渠道")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /key name|Key 名称/i })).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /^duration$/i })).not.toBeInTheDocument();
  });

  test("uses the shared linked request-log filters on the public logs tab", async () => {
    window.history.replaceState({}, "", "/manage/apikey-lookup?api_key=sk-restored-key");
    mocks.fetchPublicLogs
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        size: 50,
        api_key_name: "Primary key",
        stats: {
          total: 0,
          success_rate: 0,
          total_tokens: 0,
          total_sessions: 0,
          total_cost: 0,
        },
        filters: {
          api_key_ids: ["key-laptop", "key-auto"],
          api_key_id_names: { "key-laptop": "Laptop", "key-auto": "Automation" },
          api_key_id_counts: { "key-laptop": 12, "key-auto": 37 },
          models: ["gpt-5.5"],
          channels: ["Codex 主渠道", "OpenCode"],
          statuses: ["success", "failed"],
        },
      })
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        size: 50,
        api_key_name: "Primary key",
        stats: {
          total: 0,
          success_rate: 0,
          total_tokens: 0,
          total_sessions: 0,
          total_cost: 0,
        },
        filters: {
          api_key_ids: ["key-laptop", "key-auto"],
          api_key_id_names: { "key-laptop": "Laptop", "key-auto": "Automation" },
          api_key_id_counts: { "key-laptop": 12, "key-auto": 37 },
          models: ["gpt-5.5"],
          channels: ["Codex 主渠道"],
          statuses: ["success"],
        },
      });

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await userEvent.click(await screen.findByRole("tab", { name: /request logs/i }));

    expect(await screen.findByRole("combobox", { name: /filter by key/i })).toHaveTextContent(
      /all keys/i,
    );
    expect(await screen.findByRole("combobox", { name: /filter by model/i })).toHaveTextContent(
      /all models/i,
    );
    expect(screen.queryByRole("combobox", { name: /filter by channel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /filter by status/i })).toHaveTextContent(
      /all status/i,
    );

    await userEvent.click(screen.getByRole("combobox", { name: /filter by key/i }));
    const keyOptions = await screen.findAllByRole("option");
    expect(keyOptions[0]).toHaveAccessibleName(/Automation,?\s*37 calls/i);
    expect(keyOptions[1]).toHaveAccessibleName(/Laptop,?\s*12 calls/i);
    expect(keyOptions[0]).toHaveAttribute("aria-selected", "false");
    expect(keyOptions[1]).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("listbox", { name: /filter by key/i })).not.toHaveTextContent(
      "sk-restored-key",
    );

    await userEvent.click(screen.getByRole("option", { name: /Laptop/i }));
    await userEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({
          apiKey: "sk-restored-key",
          apiKeyIds: ["key-laptop"],
          apiKeyIdsEmpty: false,
        }),
      );
    });
  });

  test("keeps cached models visible while refreshing the available models tab", async () => {
    window.history.replaceState({}, "", "/manage/apikey-lookup?api_key=sk-restored-key");
    const asModel = (id: string) => ({
      id,
      description: "",
      ownedBy: "",
      pricing: {
        mode: "token" as const,
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        cachedPricePerMillion: 0,
        cacheReadPricePerMillion: 0,
        cacheWritePricePerMillion: 0,
        pricePerCall: 0,
      },
      inputModalities: ["text"],
      outputModalities: ["text"],
      supportsVision: false,
    });
    let resolveModelsRefresh: (value: ReturnType<typeof asModel>[]) => void = () => {};
    mocks.fetchAvailableModels
      .mockResolvedValueOnce([asModel("gpt-5.3-codex"), asModel("claude-sonnet-4-5")])
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveModelsRefresh = resolve;
        }),
      );

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await screen.findByTestId("usage-tab");
    await userEvent.click(screen.getByRole("tab", { name: /model plaza/i }));

    expect(await screen.findByText("gpt-5.3-codex")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /usage/i }));
    await userEvent.click(screen.getByRole("tab", { name: /model plaza/i }));

    expect(screen.getByText("gpt-5.3-codex")).toBeInTheDocument();
    expect(mocks.fetchAvailableModels).toHaveBeenCalledTimes(2);

    resolveModelsRefresh([
      asModel("gpt-5.3-codex"),
      asModel("claude-sonnet-4-5"),
      asModel("deepseek-v4"),
    ]);
    expect(await screen.findByText("deepseek-v4")).toBeInTheDocument();
  });

  test("does not duplicate the current key in the header menu", async () => {
    window.history.replaceState({}, "", "/manage/apikey-lookup?api_key=sk-restored-key");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await userEvent.click(await screen.findByTestId("apikey-lookup-account-menu"));
    const menu = await screen.findByTestId("apikey-lookup-account-menu-content");
    expect(within(menu).queryByText(/primary key/i)).not.toBeInTheDocument();
    expect(within(menu).getByText(/logout|退出登录|登出/i)).toBeInTheDocument();
  });

  test("refreshes the managed key and active secret when opening the key tab", async () => {
    const { portalApi } = await import("@code-proxy/api-client");
    const user = {
      id: "u1",
      tenant_id: "t1",
      username: "alice",
      display_name: "Alice",
      status: "active",
      must_change_password: false,
      failed_login_count: 0,
      lock_stage: 0,
      created_at: "",
      updated_at: "",
      version: 1,
    };
    const oldKey = {
      id: "k1",
      tenant_id: "t1",
      end_user_id: "u1",
      name: "primary",
      key_masked: "sk-old****111",
      disabled: false,
      is_default: true,
      created_at: "",
      updated_at: "",
    };
    const rotatedKey = { ...oldKey, key_masked: "sk-new****999" };
    vi.mocked(portalApi.login).mockResolvedValue({
      user,
      access_token: "cpt_test",
      refresh_token: "cpr_test",
      must_change_password: false,
    } as never);
    vi.mocked(portalApi.listKeys)
      .mockResolvedValueOnce({ items: [oldKey] } as never)
      .mockResolvedValueOnce({ items: [rotatedKey] } as never);
    vi.mocked(portalApi.keySecret)
      .mockResolvedValueOnce({ id: "k1", key: "sk-old-secret" })
      .mockResolvedValueOnce({ id: "k1", key: "sk-new-secret" });

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const landing = screen.getByTestId("apikey-lookup-landing");
    await userEvent.click(within(landing).getByRole("button", { name: /^(login|sign in|登录)$/i }));
    const loginDialog = await screen.findByRole("dialog");
    await userEvent.type(screen.getByPlaceholderText(/enter username|请输入账号/i), "alice");
    await userEvent.type(screen.getByPlaceholderText(/enter password|请输入密码/i), "password123");
    await userEvent.click(
      within(loginDialog).getByRole("button", { name: /^(login|sign in|登录)$/i }),
    );

    await userEvent.click(
      await screen.findByRole("tab", { name: /manage api keys|管理 api key/i }),
    );

    expect(await screen.findByText("sk-new****999")).toBeInTheDocument();
    await waitFor(() => {
      expect(portalApi.listKeys).toHaveBeenCalledTimes(2);
      expect(portalApi.keySecret).toHaveBeenLastCalledWith("k1");
    });
  });

  test("edits, resets, and opens history from the shared managed-key table", async () => {
    const { portalApi } = await import("@code-proxy/api-client");
    const user = {
      id: "u1",
      tenant_id: "t1",
      username: "alice",
      display_name: "Alice",
      status: "active",
      must_change_password: false,
      failed_login_count: 0,
      lock_stage: 0,
      created_at: "",
      updated_at: "",
      version: 1,
      "daily-spending-limit": 300,
      "period-spending-limits": { "5h": 100, day: 300, week: 800, month: 4000 },
    };
    const key = {
      id: "k1",
      tenant_id: "t1",
      end_user_id: "u1",
      name: "primary",
      key_masked: "sk-****111",
      disabled: false,
      is_default: true,
      created_at: "2026-07-20T00:00:00Z",
      updated_at: "",
      "daily-spending-limit": 100,
      "period-spending-limits": { "5h": 50, day: 100, week: 300, month: 1000 },
      "period-spending": [{ period: "day" as const, limit: 100, used: 20, remaining: 80 }],
      "daily-spending-used": 20,
      "lifetime-spending-used": 300.12,
      "daily-spending-reset-count": 2,
    };
    vi.mocked(portalApi.login).mockResolvedValue({
      user,
      access_token: "cpt_test",
      refresh_token: "cpr_test",
      must_change_password: false,
    } as never);
    vi.mocked(portalApi.listKeys).mockResolvedValue({ items: [key] } as never);
    vi.mocked(portalApi.keySecret).mockResolvedValue({ id: "k1", key: "sk-primary" });
    vi.mocked(portalApi.updateKey).mockResolvedValue({ ...key, name: "renamed" } as never);
    vi.mocked(portalApi.resetKeyDailySpending).mockResolvedValue({ status: "ok" });
    vi.mocked(portalApi.listKeyDailySpendingResetHistory).mockResolvedValue({
      items: [
        {
          id: 7,
          reset_at: "2026-07-21T11:00:00Z",
          actor_username: "alice",
          effective_used_before: 20,
          raw_today_cost: 30,
        },
      ],
      total: 1,
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const landing = screen.getByTestId("apikey-lookup-landing");
    await userEvent.click(within(landing).getByRole("button", { name: /^(login|sign in|登录)$/i }));
    const loginDialog = await screen.findByRole("dialog");
    await userEvent.type(screen.getByPlaceholderText(/enter username|请输入账号/i), "alice");
    await userEvent.type(screen.getByPlaceholderText(/enter password|请输入密码/i), "password123");
    await userEvent.click(
      within(loginDialog).getByRole("button", { name: /^(login|sign in|登录)$/i }),
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: /manage api keys|管理 api key/i }),
    );

    expect(await screen.findByRole("columnheader", { name: "Quota" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Lifetime" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total resets" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit Key quota" }));
    const editDialog = await screen.findByRole("dialog", { name: "Edit Key quota" });
    const dayInput = within(editDialog).getByRole("spinbutton", { name: "Daily quota (USD)" });
    await userEvent.clear(dayInput);
    await userEvent.type(dayInput, "80");
    await userEvent.click(within(editDialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(portalApi.updateKey).toHaveBeenCalledWith("k1", {
        name: "primary",
        "daily-spending-limit": 80,
        "period-spending-limits": { "5h": 50, day: 80, week: 300, month: 1000 },
      });
    });

    await userEvent.click(screen.getByRole("button", { name: "Reset today spending" }));
    await waitFor(() => {
      expect(portalApi.resetKeyDailySpending).toHaveBeenCalledWith("k1");
    });

    await userEvent.click(screen.getAllByRole("button", { name: "View reset history" })[0]!);
    await waitFor(() => {
      expect(portalApi.listKeyDailySpendingResetHistory).toHaveBeenCalledWith("k1", 200);
    });
    expect(
      await screen.findByRole("dialog", { name: "Reset history · primary" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("$20.00").length).toBeGreaterThan(0);
  });

  test("confirms before deleting a managed API key", async () => {
    const { portalApi } = await import("@code-proxy/api-client");
    const keys = [
      {
        id: "k1",
        tenant_id: "t1",
        end_user_id: "u1",
        name: "primary",
        key_masked: "sk-****1",
        disabled: false,
        is_default: true,
        created_at: "",
        updated_at: "",
      },
      {
        id: "k2",
        tenant_id: "t1",
        end_user_id: "u1",
        name: "secondary",
        key_masked: "sk-****2",
        disabled: false,
        is_default: false,
        created_at: "",
        updated_at: "",
      },
    ];
    vi.mocked(portalApi.login).mockResolvedValue({
      user: {
        id: "u1",
        tenant_id: "t1",
        username: "alice",
        display_name: "Alice",
        status: "active",
        must_change_password: false,
        failed_login_count: 0,
        lock_stage: 0,
        created_at: "",
        updated_at: "",
        version: 1,
      },
      access_token: "cpt_test",
      refresh_token: "cpr_test",
      must_change_password: false,
    } as never);
    vi.mocked(portalApi.listKeys)
      .mockResolvedValueOnce({ items: keys } as never)
      .mockResolvedValueOnce({ items: keys } as never)
      .mockResolvedValue({ items: [keys[0]] } as never);
    vi.mocked(portalApi.keySecret).mockResolvedValue({ id: "k1", key: "sk-primary" });
    vi.mocked(portalApi.deleteKey).mockResolvedValue(undefined as never);

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const landing = screen.getByTestId("apikey-lookup-landing");
    await userEvent.click(within(landing).getByRole("button", { name: /^(login|sign in|登录)$/i }));
    const loginDialog = await screen.findByRole("dialog");
    await userEvent.type(screen.getByPlaceholderText(/enter username|请输入账号/i), "alice");
    await userEvent.type(screen.getByPlaceholderText(/enter password|请输入密码/i), "password123");
    await userEvent.click(
      within(loginDialog).getByRole("button", { name: /^(login|sign in|登录)$/i }),
    );
    await waitFor(() => {
      expect(screen.queryByTestId("apikey-lookup-landing")).not.toBeInTheDocument();
    });

    await userEvent.click(
      await screen.findByRole("tab", { name: /manage api keys|管理 api key/i }),
    );
    expect(await screen.findByText("secondary")).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole("button", { name: /^(delete|删除)$/i });
    expect(deleteButtons.length).toBeGreaterThanOrEqual(2);
    await userEvent.click(deleteButtons[1]);

    expect(portalApi.deleteKey).not.toHaveBeenCalled();
    const confirmDialog = await screen.findByRole("dialog");
    expect(confirmDialog).toHaveTextContent(/delete api key|删除 api key/i);
    expect(confirmDialog).toHaveTextContent("secondary");

    await userEvent.click(within(confirmDialog).getByRole("button", { name: /^(cancel|取消)$/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(portalApi.deleteKey).not.toHaveBeenCalled();

    await userEvent.click(screen.getAllByRole("button", { name: /^(delete|删除)$/i })[1]);
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /^(delete|删除)$/i,
      }),
    );

    await waitFor(() => {
      expect(portalApi.deleteKey).toHaveBeenCalledWith("k2");
    });
  });

  test("logs out from the header menu and returns to the landing page", async () => {
    window.history.replaceState({}, "", "/manage/apikey-lookup?api_key=sk-restored-key");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await userEvent.click(await screen.findByTestId("apikey-lookup-account-menu"));
    await userEvent.click(
      within(await screen.findByTestId("apikey-lookup-account-menu-content")).getByText(
        /logout|退出登录|登出/i,
      ),
    );

    expect(window.sessionStorage.getItem("apiKeyLookup.lastApiKey.v1")).toBeNull();
    expect(screen.getByTestId("apikey-lookup-landing")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("shows cached usage data while refreshing chart data", async () => {
    window.history.replaceState({}, "", "/manage/apikey-lookup?api_key=sk-restored-key");
    // Legacy v1 unscoped chart cache migrates into the default tenant bucket.
    window.sessionStorage.setItem(
      "apiKeyLookup.chartCache.v1",
      JSON.stringify({
        "sk-restored-key|7": {
          daily_series: [],
          heatmap_series: [],
          model_distribution: [],
          api_key_name: "Cached key",
          stats: {
            total: 12,
            success_rate: 50,
            total_tokens: 120,
            total_sessions: 2,
            total_cost: 1,
          },
        },
      }),
    );

    let resolveChart: (
      value: Awaited<ReturnType<typeof mocks.fetchPublicChartData>>,
    ) => void = () => {};
    mocks.fetchPublicChartData.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveChart = resolve;
      }),
    );

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    const usageTab = await screen.findByTestId("usage-tab");
    expect(usageTab).toHaveTextContent("12");
    expect(usageTab).toHaveAttribute("data-loading", "true");

    resolveChart({
      daily_series: [],
      heatmap_series: [],
      model_distribution: [],
      api_key_name: "Fresh key",
      stats: {
        total: 24,
        success_rate: 75,
        total_tokens: 240,
        total_sessions: 4,
        total_cost: 2,
      },
    });

    await waitFor(() => expect(screen.getByTestId("usage-tab")).toHaveTextContent("24"));
    // After refresh, data is written under the tenant-scoped v2 key.
    expect(window.sessionStorage.getItem("apiKeyLookup.chartCache.v2")).toContain('"total":24');
    expect(window.sessionStorage.getItem("apiKeyLookup.chartCache.v1")).toBeNull();
  });

  test("keeps warm account chart cache when switching portal accounts", async () => {
    const { portalApi } = await import("@code-proxy/api-client");
    const accountA = {
      accountKey: "http://relay.test\0u-a",
      apiBase: "http://relay.test",
      accessToken: "cpt_a",
      refreshToken: "cpr_a",
      remember: true,
      expiresAt: Date.now() + 60_000,
      lastUsedAt: Date.now(),
      user: { id: "u-a", username: "alice", display_name: "Alice" },
    };
    const accountB = {
      accountKey: "http://relay.test\0u-b",
      apiBase: "http://relay.test",
      accessToken: "cpt_b",
      refreshToken: "cpr_b",
      remember: true,
      expiresAt: Date.now() + 60_000,
      lastUsedAt: Date.now() - 1_000,
      user: { id: "u-b", username: "bob", display_name: "Bob" },
    };

    vi.mocked(portalApi.loadSession).mockReturnValue({
      apiBase: accountA.apiBase,
      accessToken: accountA.accessToken,
      refreshToken: accountA.refreshToken,
      remember: true,
      expiresAt: accountA.expiresAt,
      user: accountA.user,
    });
    vi.mocked(portalApi.listSavedAccounts).mockReturnValue([accountA, accountB] as never);
    vi.mocked(portalApi.switchAccount).mockImplementation((key: string) => {
      const target =
        key === accountB.accountKey ? accountB : key === accountA.accountKey ? accountA : null;
      if (!target) return null;
      vi.mocked(portalApi.loadSession).mockReturnValue({
        apiBase: target.apiBase,
        accessToken: target.accessToken,
        refreshToken: target.refreshToken,
        remember: true,
        expiresAt: target.expiresAt,
        user: target.user,
      });
      return target as never;
    });
    vi.mocked(portalApi.me).mockImplementation(async () => {
      const snap = portalApi.loadSession();
      const id = snap?.user?.id === "u-b" ? "u-b" : "u-a";
      return {
        user: {
          id,
          tenant_id: "t1",
          username: id === "u-b" ? "bob" : "alice",
          display_name: id === "u-b" ? "Bob" : "Alice",
          status: "active",
          must_change_password: false,
          created_at: "",
          updated_at: "",
          version: 1,
        },
      } as never;
    });
    vi.mocked(portalApi.listKeys).mockResolvedValue({
      items: [
        {
          id: "k1",
          tenant_id: "t1",
          end_user_id: "u-a",
          name: "default",
          key_masked: "sk-****",
          disabled: false,
          is_default: true,
        },
      ],
    } as never);
    vi.mocked(portalApi.keySecret).mockResolvedValue({ id: "k1", key: "sk-op" });

    window.sessionStorage.setItem(
      "apiKeyLookup.chartCache.v2",
      JSON.stringify({
        byTenant: {
          default: {
            "account:u-a|7": chartResponse(11, "Alice"),
            "account:u-b|7": chartResponse(77, "Bob"),
          },
        },
      }),
    );

    let resolveBChart: (value: ChartResponse) => void = () => {};
    mocks.fetchPublicChartData.mockImplementation(async (params?: { portalAccount?: boolean }) => {
      if (!params?.portalAccount) return chartResponse(0);
      const snap = portalApi.loadSession();
      if (snap?.user?.id === "u-b") {
        return new Promise<ChartResponse>((resolve) => {
          resolveBChart = resolve;
        });
      }
      return chartResponse(11, "Alice");
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("usage-tab")).toHaveTextContent("11"));

    const accountMenuTrigger = await screen.findByTestId("apikey-lookup-account-menu");
    await userEvent.click(accountMenuTrigger);
    await userEvent.click(await screen.findByTestId("apikey-lookup-switch-account-trigger"));
    await userEvent.click(await screen.findByTestId("apikey-lookup-switch-u-b"));

    await waitFor(() => expect(accountMenuTrigger).not.toHaveFocus());

    // Warm B: paint cached stats immediately (no skeleton / no-stats flash).
    await waitFor(() => expect(screen.getByTestId("usage-tab")).toHaveTextContent("77"));
    expect(screen.getByTestId("usage-tab")).not.toHaveTextContent("no-stats");
    // Multi-account chart cache must survive the switch wipe path.
    expect(window.sessionStorage.getItem("apiKeyLookup.chartCache.v2")).toContain("account:u-b|7");
    expect(window.sessionStorage.getItem("apiKeyLookup.chartCache.v2")).toContain('"total":77');

    resolveBChart(chartResponse(88, "Bob fresh"));
    await waitFor(() => expect(screen.getByTestId("usage-tab")).toHaveTextContent("88"));
  });

  test("ignores stale chart responses after rapid time range changes", async () => {
    window.history.replaceState({}, "", "/manage/apikey-lookup?api_key=sk-restored-key");
    const pending: Array<{
      days: number;
      signal?: AbortSignal;
      resolve: (value: ChartResponse) => void;
    }> = [];
    mocks.fetchPublicChartData.mockImplementation(
      (params?: { apiKey: string; portalAccount?: boolean; days?: number; signal?: AbortSignal }) =>
        new Promise<ChartResponse>((resolve) => {
          pending.push({
            days: params?.days ?? 7,
            signal: params?.signal,
            resolve,
          });
        }),
    );

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await screen.findByRole("tab", { name: /30/i });
    await userEvent.click(screen.getByRole("tab", { name: /30/i }));
    await userEvent.click(screen.getByRole("tab", { name: /today|今天/i }));
    await userEvent.click(screen.getByRole("tab", { name: /7\s*(days|天)/i }));

    await waitFor(() => expect(pending.at(-1)?.days).toBe(7));
    const latest = pending.at(-1);
    if (!latest) throw new Error("missing latest chart request");

    latest.resolve(chartResponse(7, "Range 7"));
    await waitFor(() => expect(screen.getByTestId("usage-tab")).toHaveTextContent("7"));

    for (const request of pending) {
      if (request !== latest) {
        request.resolve(chartResponse(request.days * 100, `Range ${request.days}`));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByTestId("usage-tab")).toHaveTextContent("7");
    expect(pending.some((request) => request.days === 30 && request.signal?.aborted)).toBe(true);
  });

  test("pins results toolbar with sticky top offset and collapses header on scroll", async () => {
    let toolbarTop = 120;
    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const el = this as HTMLElement;
      if (el.dataset?.testid === "apikey-lookup-toolbar-sticky") {
        return {
          x: 0,
          y: toolbarTop,
          top: toolbarTop,
          left: 0,
          right: 800,
          bottom: toolbarTop + 48,
          width: 800,
          height: 48,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return originalGetBoundingClientRect.call(this);
    };

    window.history.replaceState({}, "", "/manage/apikey-lookup?api_key=sk-restored-key");

    try {
      render(
        <ThemeProvider>
          <ToastProvider>
            <ApiKeyLookupPage />
          </ToastProvider>
        </ThemeProvider>,
      );

      const toolbar = await screen.findByTestId("apikey-lookup-toolbar-sticky");
      expect(toolbar.className).toMatch(/(?:^|\s)sticky(?:\s|$)/);
      expect(toolbar.className).toMatch(/(?:^|\s)top-3(?:\s|$)/);
      // sticky 必须是自身节点，不能再包一层短 relative 切断包含块。
      expect(toolbar.parentElement?.tagName.toLowerCase()).toBe("main");
      expect(toolbar).toHaveAttribute("data-stuck", "false");
      expect(toolbar.className).toMatch(/border-transparent/);

      const header = screen.getByTestId("apikey-lookup-header");
      expect(header).toHaveAttribute("data-collapsed", "false");

      Object.defineProperty(window, "scrollY", {
        configurable: true,
        value: 80,
      });
      toolbarTop = 12;
      window.dispatchEvent(new Event("scroll"));

      await waitFor(() => {
        expect(header).toHaveAttribute("data-collapsed", "true");
        expect(toolbar).toHaveAttribute("data-stuck", "true");
      });
      expect(header.className).toMatch(/-translate-y-full/);
      expect(header.className).toMatch(/opacity-0/);
      expect(toolbar.className).toMatch(/border-slate-200/);
      expect(toolbar.className).not.toMatch(/border-transparent/);

      Object.defineProperty(window, "scrollY", {
        configurable: true,
        value: 0,
      });
      toolbarTop = 120;
      window.dispatchEvent(new Event("scroll"));

      await waitFor(() => {
        expect(header).toHaveAttribute("data-collapsed", "false");
        expect(toolbar).toHaveAttribute("data-stuck", "false");
      });
      expect(toolbar.className).toMatch(/border-transparent/);
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });
});
