import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ApiKeyLookupPage } from "@/modules/apikey-lookup/ApiKeyLookupPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  fetchPublicLogs: vi.fn(async () => ({
    items: [],
    total: 0,
    page: 1,
    size: 50,
    stats: { total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 },
    filters: { models: [] },
  })),
  fetchPublicChartData: vi.fn(async () => ({
    daily_series: [],
    model_distribution: [],
    stats: { total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 },
  })),
  fetchAvailableModels: vi.fn(async () => [] as string[]),
}));

vi.mock("@/modules/apikey-lookup/api", () => ({
  fetchPublicLogs: mocks.fetchPublicLogs,
  fetchPublicChartData: mocks.fetchPublicChartData,
  fetchAvailableModels: mocks.fetchAvailableModels,
}));

vi.mock("@/modules/apikey-lookup/components/UsageTabSection", () => ({
  UsageTabSection: () => <div data-testid="usage-tab" />,
}));

vi.mock("@/modules/monitor/LogContentModal", () => ({
  LogContentModal: () => null,
}));

describe("ApiKeyLookupPage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/manage/apikey-lookup");
    vi.clearAllMocks();
  });

  test("restores the last looked up API key after page refresh and queries immediately", async () => {
    window.sessionStorage.setItem("apiKeyLookup.lastApiKey.v1", "sk-restored-key");

    render(
      <ThemeProvider>
        <ToastProvider>
          <ApiKeyLookupPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(screen.getByLabelText(/api key/i)).toHaveValue("sk-restored-key");
    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-restored-key" }),
      );
      expect(mocks.fetchPublicChartData).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-restored-key" }),
      );
    });
  });
});
