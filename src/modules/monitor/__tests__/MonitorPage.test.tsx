import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { MonitorDistributionSections } from "@/modules/monitor/MonitorDashboardSections";

vi.mock("@/modules/ui/charts/EChart", () => ({
  EChart: ({ className }: { className?: string }) => <div className={className}>chart</div>,
}));

describe("MonitorPage distribution legends", () => {
  test("renders model distribution legend rows as toggle buttons", async () => {
    const user = userEvent.setup();
    const toggleModelDistributionLegend = vi.fn();

    render(
      <MonitorDistributionSections
        t={(key) => {
          if (key === "monitor.model_distribution") return "Model distribution";
          if (key === "monitor.last_days_desc") return "Last 7 days";
          if (key === "monitor.requests") return "Requests";
          if (key === "monitor.token") return "Tokens";
          if (key === "monitor.daily_usage_trend") return "Daily usage";
          if (key === "monitor.daily_desc") return "Daily trend";
          if (key === "monitor.input_token") return "Input";
          if (key === "monitor.output_token_legend") return "Output";
          if (key === "monitor.request_count_legend") return "Requests";
          if (key === "monitor.apikey_distribution") return "API key distribution";
          return key;
        }}
        timeRange={7}
        modelMetric="requests"
        setModelMetric={() => undefined}
        modelDistributionOption={{}}
        modelDistributionLegend={[
          {
            name: "gpt-4.1",
            valueLabel: "10",
            percentLabel: "71.4%",
            colorClass: "bg-sky-500",
            enabled: true,
          },
        ]}
        toggleModelDistributionLegend={toggleModelDistributionLegend}
        dailyTrendOption={{}}
        dailyLegendAvailability={{ hasInput: true, hasOutput: true, hasRequests: true }}
        dailyLegendSelected={{ daily_input: true, daily_output: true, daily_requests: true }}
        toggleDailyLegend={() => undefined}
        apikeyDistributionData={[]}
        apikeyMetric="requests"
        setApikeyMetric={() => undefined}
        apikeyDistributionOption={{}}
        apikeyDistributionLegend={[]}
        toggleApikeyDistributionLegend={() => undefined}
        isRefreshing={false}
      />,
    );

    const legendButton = await screen.findByRole("button", { name: /gpt-4\.1/i });
    expect(legendButton).toHaveAttribute("aria-pressed", "true");

    await user.click(legendButton);

    await waitFor(() => {
      expect(toggleModelDistributionLegend).toHaveBeenCalledWith("gpt-4.1");
    });
  });
});
