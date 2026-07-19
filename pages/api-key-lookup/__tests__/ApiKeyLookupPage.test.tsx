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
    async (_params?: { apiKey: string; days?: number; signal?: AbortSignal }) => ({
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
  fetchAvailableModels: vi.fn(async (): Promise<string[]> => []),
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
      loadSession: () => null,
      clearSession: () => undefined,
      login: vi.fn(),
      logout: vi.fn(async () => undefined),
      me: vi.fn(),
      listKeys: vi.fn(async () => ({ items: [] })),
      keySecret: vi.fn(),
      createKey: vi.fn(),
      updateKey: vi.fn(),
      rotateKey: vi.fn(),
      deleteKey: vi.fn(),
      changePassword: vi.fn(),
    },
  };
});

describe("ApiKeyLookupPage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/manage/apikey-lookup");
    vi.clearAllMocks();
  });

  test("opens the account login modal when no session is stored", async () => {
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

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/enter username|请输入账号/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/enter api key|输入 API 密钥/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/enter username|请输入账号/i), "alice");
    await userEvent.type(screen.getByPlaceholderText(/enter password|请输入密码/i), "password123");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^(login|sign in|登录)$/i }),
    );

    await waitFor(() => {
      expect(portalApi.login).toHaveBeenCalledWith("alice", "password123", true);
    });
  });

  test("restores the last looked up API key after page refresh and shows its name", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");

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
    expect(await screen.findByRole("combobox", { name: /primary key/i })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("loads public logs only after switching to the request logs tab", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");
    const logItem: PublicLogItem = {
      id: 1,
      timestamp: new Date("2026-07-05T03:01:18Z").toISOString(),
      channel_name: "Codex 主渠道",
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
    expect(await screen.findByText("Codex 主渠道")).toBeInTheDocument();
    // Multi-key accounts need a Key name column to tell request sources apart.
    expect(screen.getByRole("columnheader", { name: /key name|账户名称|account name/i })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /^duration$/i })).not.toBeInTheDocument();
  });

  test("uses the shared linked request-log filters on the public logs tab", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");
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

    expect(await screen.findByRole("combobox", { name: /filter by model/i })).toHaveTextContent(
      /all models/i,
    );
    const channelFilter = screen.getByRole("combobox", {
      name: /filter by channel/i,
    });
    expect(channelFilter).toHaveTextContent(/all channels/i);
    expect(screen.getByRole("combobox", { name: /filter by status/i })).toHaveTextContent(
      /all status/i,
    );

    await userEvent.click(channelFilter);
    await userEvent.click(await screen.findByRole("option", { name: "OpenCode" }));
    await userEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({
          apiKey: "sk-restored-key",
          channels: ["Codex 主渠道"],
          channelsEmpty: false,
        }),
      );
    });
  });

  test("keeps cached models visible while refreshing the available models tab", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");
    let resolveModelsRefresh: (value: string[]) => void = () => {};
    mocks.fetchAvailableModels
      .mockResolvedValueOnce(["gpt-5.3-codex", "claude-sonnet-4-5"])
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

    resolveModelsRefresh(["gpt-5.3-codex", "claude-sonnet-4-5", "deepseek-v4"]);
    expect(await screen.findByText("deepseek-v4")).toBeInTheDocument();
  });

  test("does not duplicate the current key in the header menu", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await userEvent.click(await screen.findByRole("combobox", { name: /primary key/i }));

    expect(screen.queryByRole("option", { name: /primary key/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /logout/i })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  test("logs out from the header menu and asks for the API key again", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await userEvent.click(await screen.findByRole("combobox", { name: /primary key/i }));
    await userEvent.click(screen.getByRole("option", { name: /logout/i }));

    expect(window.sessionStorage.getItem("apiKeyLookup.lastApiKey.v1")).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("shows cached usage data while refreshing chart data", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");
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

  test("ignores stale chart responses after rapid time range changes", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");
    const pending: Array<{
      days: number;
      signal?: AbortSignal;
      resolve: (value: ChartResponse) => void;
    }> = [];
    mocks.fetchPublicChartData.mockImplementation(
      (params?: { apiKey: string; days?: number; signal?: AbortSignal }) =>
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

    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");

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
