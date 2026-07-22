import type { ComponentProps, ReactNode } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { UsageTabSection } from "../UsageTabSection";

vi.mock("@code-proxy/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/ui")>();
  return {
    ...actual,
    AnimatedNumber: ({ value, format }: { value: number; format: (value: number) => string }) => (
      <>{format(value)}</>
    ),
    EChart: ({ className }: { className?: string }) => (
      <div data-testid="api-key-distribution-chart" className={className} />
    ),
    Reveal: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

const labels: Record<string, string> = {
  "apikey_lookup.api_key_distribution": "API Key Usage Share",
  "apikey_lookup.api_key_distribution_desc": "Last 7 days · by Requests · Top10",
  "apikey_lookup.model_distribution": "Model Distribution",
  "apikey_lookup.daily_usage": "Daily Usage",
  "apikey_lookup.requests": "Requests",
  "apikey_lookup.token": "Token",
  "apikey_lookup.no_data": "No data",
};

const t = (key: string) => labels[key] ?? key;

const baseProps: ComponentProps<typeof UsageTabSection> = {
  t,
  timeRange: 7,
  chartStats: {
    total: 4,
    success_rate: 100,
    total_tokens: 40,
    total_sessions: 1,
    total_cost: 0,
  },
  chartLoading: false,
  quotaLimits: null,
  quotaScopes: null,
  showApiKeyDistribution: true,
  apiKeyMetric: "requests",
  setApiKeyMetric: vi.fn(),
  apiKeyDistributionData: [{ name: "Laptop", value: 4 }],
  apiKeyDistributionOption: {},
  apiKeyDistributionLegend: [
    {
      name: "Laptop",
      valueLabel: "4",
      percentLabel: "100.0%",
      colorClass: "bg-sky-500",
    },
  ],
  modelMetric: "requests",
  setModelMetric: vi.fn(),
  heatmapSeries: [],
  modelDistributionData: [],
  modelDistributionOption: {},
  modelDistributionLegend: [],
  dailySeries: [],
  dailyTrendOption: {},
  dailyLegendAvailability: { hasInput: false, hasOutput: false, hasRequests: false },
  dailyLegendSelected: {},
  toggleDailyLegend: vi.fn(),
};

describe("UsageTabSection API key distribution", () => {
  test("renders the portal-only card with a single 100% slice", () => {
    render(<UsageTabSection {...baseProps} />);

    const title = screen.getByText("API Key Usage Share");
    const card = title.closest("section");
    if (!card) throw new Error("API key distribution card not found");
    expect(within(card).getByTestId("api-key-distribution-chart")).toBeInTheDocument();
    expect(within(card).getByText("Laptop")).toBeInTheDocument();
    expect(within(card).getByText("100.0%")).toBeInTheDocument();
  });

  test("keeps the portal card visible with an empty state when usage is zero", () => {
    render(
      <UsageTabSection {...baseProps} apiKeyDistributionData={[]} apiKeyDistributionLegend={[]} />,
    );

    expect(screen.getByText("API Key Usage Share")).toBeInTheDocument();
    expect(screen.getAllByText("No data").length).toBeGreaterThan(0);
  });

  test("does not render the card for legacy non-portal lookups", () => {
    render(<UsageTabSection {...baseProps} showApiKeyDistribution={false} />);

    expect(screen.queryByText("API Key Usage Share")).not.toBeInTheDocument();
  });
});
