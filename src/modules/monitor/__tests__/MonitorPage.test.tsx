import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { usageApi } from "@/lib/http/apis";
import { MonitorPage } from "@/modules/monitor/MonitorPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";

vi.mock("@/modules/ui/charts/EChart", () => ({
  EChart: ({ className }: { className?: string }) => <div className={className}>chart</div>,
}));

describe("MonitorPage distribution legends", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
    vi.restoreAllMocks();
  });

  test("renders model distribution legend rows as toggle buttons", async () => {
    await i18n.changeLanguage("en");

    vi.spyOn(usageApi, "getChartData").mockResolvedValue({
      daily_series: [
        {
          date: "2026-04-01",
          requests: 10,
          failed_requests: 1,
          input_tokens: 100,
          output_tokens: 80,
        },
      ],
      model_distribution: [
        { model: "gpt-4.1", requests: 10, tokens: 500 },
        { model: "claude-sonnet", requests: 4, tokens: 200 },
      ],
      apikey_distribution: [{ api_key: "sk-test-1", name: "Alice", requests: 7, tokens: 300 }],
      hourly_tokens: [],
      hourly_models: [],
    });

    render(
      <ThemeProvider>
        <MonitorPage />
      </ThemeProvider>,
    );

    const legendButton = (await screen.findAllByRole("button", { name: /gpt-4\.1/i }))[0];
    expect(legendButton).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(legendButton);

    await waitFor(() => {
      expect(legendButton).toHaveAttribute("aria-pressed", "false");
    });
  });
});
