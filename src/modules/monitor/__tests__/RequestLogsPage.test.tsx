import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { RequestLogsPage } from "@/modules/monitor/RequestLogsPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  getUsageLogs: vi.fn(),
  getLogContent: vi.fn(),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    usageApi: {
      ...mod.usageApi,
      getUsageLogs: mocks.getUsageLogs,
      getLogContent: mocks.getLogContent,
    },
  };
});

describe("RequestLogsPage", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
    mocks.getUsageLogs.mockReset();
    mocks.getLogContent.mockReset();
  });

  test("renders the first token latency column from backend data", async () => {
    await i18n.changeLanguage("en");

    mocks.getUsageLogs.mockResolvedValue({
      items: [
        {
          id: 1,
          timestamp: "2026-04-08T12:00:00Z",
          api_key: "sk-test-123456",
          api_key_name: "Primary",
          model: "gpt-5.4",
          source: "codex",
          channel_name: "Codex",
          auth_index: "auth-1",
          failed: false,
          latency_ms: 1200,
          first_token_ms: 183,
          input_tokens: 10,
          output_tokens: 20,
          reasoning_tokens: 0,
          cached_tokens: 0,
          total_tokens: 30,
          cost: 0.0123,
          has_content: false,
        },
      ],
      total: 1,
      page: 1,
      size: 50,
      filters: {
        api_keys: [],
        api_key_names: {},
        models: [],
        channels: [],
      },
      stats: {
        total: 1,
        success_rate: 100,
        total_tokens: 30,
      },
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText("First Token")).toBeInTheDocument();
    expect(await screen.findByText("183ms")).toBeInTheDocument();
  });

  test("does not crash when backend returns null filter arrays", async () => {
    await i18n.changeLanguage("en");

    mocks.getUsageLogs.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 50,
      filters: {
        api_keys: null,
        api_key_names: null,
        models: null,
        channels: null,
      },
      stats: {
        total: 0,
        success_rate: 0,
        total_tokens: 0,
      },
    });

    render(
      <ThemeProvider>
        <ToastProvider>
          <RequestLogsPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText("No Data")).toBeInTheDocument();
  });
});
