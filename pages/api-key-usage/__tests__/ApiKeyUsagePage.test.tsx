import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";
import { ApiKeyUsagePage } from "../ApiKeyUsagePage";

const mocks = vi.hoisted(() => ({
  fetchPublicLogs: vi.fn(),
}));

vi.mock("../../api-key-lookup/api", () => ({
  fetchPublicLogs: mocks.fetchPublicLogs,
}));

vi.mock("../../api-key-lookup/components/QuickImportTabContent", () => ({
  QuickImportTabContent: ({ apiKey }: { apiKey: string }) => (
    <div data-testid="quick-import-stub">quick-import:{apiKey}</div>
  ),
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ApiKeyUsagePage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("ApiKeyUsagePage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    window.history.replaceState({}, "", "/manage/apikey-usage");
    window.localStorage.clear();
    mocks.fetchPublicLogs.mockReset();
    mocks.fetchPublicLogs.mockResolvedValue({
      items: [
        {
          id: 1,
          timestamp: "2026-07-22T01:00:00Z",
          model: "gpt-test",
          failed: false,
          latency_ms: 100,
          input_tokens: 1,
          output_tokens: 2,
          cached_tokens: 0,
          total_tokens: 3,
          cost: 0,
          has_content: false,
        },
      ],
      total: 1,
      page: 1,
      size: 50,
      api_key_name: "张军宝",
      stats: { total: 1, success_rate: 100, total_tokens: 3, total_cost: 0 },
      filters: {
        api_key_ids: [],
        api_key_id_names: {},
        api_key_id_counts: {},
        models: ["gpt-test"],
        channels: [],
        statuses: ["success", "failed"],
      },
    });
  });

  test("opens a key modal, stores the key in localStorage, and supports logout", async () => {
    renderPage();

    expect(screen.getByTestId("apikey-usage-header")).toHaveTextContent("API 密钥用量查询");
    expect(screen.getByTestId("apikey-usage-empty")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/输入 API 密钥|Enter API Key/i)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/输入 API 密钥|Enter API Key/i), "sk-demo");
    await userEvent.click(screen.getByTestId("apikey-usage-submit"));

    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenCalled();
    });
    expect(mocks.fetchPublicLogs.mock.calls[0][0]).toMatchObject({
      apiKey: "sk-demo",
      page: 1,
    });
    expect(await screen.findByText("请求日志")).toBeInTheDocument();
    expect(screen.getByText("快捷导入")).toBeInTheDocument();
    expect(screen.getByText("张军宝")).toBeInTheDocument();
    expect(screen.queryByText("使用统计")).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("apiKeyUsage.lastApiKey.v1") || "{}")).toEqual({
      apiKey: "sk-demo",
      name: "张军宝",
    });

    await userEvent.click(screen.getByTestId("apikey-usage-key-menu"));
    await userEvent.click(await screen.findByTestId("apikey-usage-logout"));

    expect(window.localStorage.getItem("apiKeyUsage.lastApiKey.v1")).toBeNull();
    expect(await screen.findByTestId("apikey-usage-empty")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/输入 API 密钥|Enter API Key/i)).toBeInTheDocument();
  });

  test("restores the last API key from localStorage", async () => {
    window.localStorage.setItem(
      "apiKeyUsage.lastApiKey.v1",
      JSON.stringify({ apiKey: "sk-restored", name: "restored-name" }),
    );

    renderPage();

    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenCalled();
    });
    expect(mocks.fetchPublicLogs.mock.calls[0][0]).toMatchObject({
      apiKey: "sk-restored",
      page: 1,
    });
    expect(await screen.findByText("张军宝")).toBeInTheDocument();
    expect(screen.queryByTestId("apikey-usage-empty")).not.toBeInTheDocument();
  });
});
