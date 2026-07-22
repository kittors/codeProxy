import { render, screen, waitFor } from "@testing-library/react";
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
      api_key_name: "demo-key",
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

  test("queries logs with the entered API key and only shows logs + quick import tabs", async () => {
    renderPage();

    expect(screen.getByTestId("apikey-usage-header")).toHaveTextContent("API 密钥用量查询");
    expect(screen.queryByText("使用统计")).not.toBeInTheDocument();
    expect(screen.queryByText("模型广场")).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/输入 API 密钥|Enter API Key/i), "sk-demo");
    await userEvent.click(screen.getByRole("button", { name: /查询|Query/i }));

    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenCalled();
    });
    expect(mocks.fetchPublicLogs.mock.calls[0][0]).toMatchObject({
      apiKey: "sk-demo",
      page: 1,
    });
    expect(await screen.findByText("请求日志")).toBeInTheDocument();
    expect(screen.getByText("快捷导入")).toBeInTheDocument();
    expect(screen.getByText("demo-key")).toBeInTheDocument();
  });
});
