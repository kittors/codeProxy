import { render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { DashboardPage } from "../DashboardPage";

const mocks = vi.hoisted(() => ({
  getDashboardSummary: vi.fn(),
  notify: vi.fn(),
  useSystemStats: vi.fn(),
  intervalCallback: null as null | (() => void),
}));

vi.mock("@code-proxy/api-client/endpoints/usage", () => ({
  usageApi: {
    getDashboardSummary: mocks.getDashboardSummary,
  },
}));

vi.mock("../useSystemStats", () => ({
  useSystemStats: mocks.useSystemStats,
}));

vi.mock("../SystemMonitorSection", () => ({
  SystemMonitorSection: () => <div data-testid="system-monitor-section" />,
}));

vi.mock("@code-proxy/ui", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    AnimatedNumber: ({
      value,
      format,
    }: {
      value: number;
      format?: (value: number) => string;
    }) => <span>{format ? format(value) : value}</span>,
    Button: ({ children, type = "button", ...props }: any) => (
      <button type={type} {...props}>
        {children}
      </button>
    ),
    Card: ({
      title,
      description,
      actions,
      children,
    }: any) => (
      <section>
        {title ? <h3>{title}</h3> : null}
        {description ? <p>{description}</p> : null}
        {actions}
        {children}
      </section>
    ),
    EmptyState: ({ title, description, action }: any) => (
      <div data-testid="empty-state">
        <h3>{title}</h3>
        <p>{description}</p>
        {action}
      </div>
    ),
    Tabs: ({ children }: any) => <div>{children}</div>,
    TabsList: ({ children }: any) => <div>{children}</div>,
    TabsTrigger: ({ children, value }: any) => <button data-value={value}>{children}</button>,
    EChart: () => <div data-testid="chart" />,
    ChartLegend: () => <div data-testid="legend" />,
    useToast: () => ({ notify: mocks.notify }),
    useInterval: (callback: () => void) => {
      mocks.intervalCallback = callback;
      React.useEffect(() => {
        mocks.intervalCallback = callback;
      }, [callback]);
    },
  };
});

const summary = {
  kpi: {
    total_requests: 1234,
    success_requests: 1200,
    failed_requests: 34,
    success_rate: 97.24,
    input_tokens: 1000,
    output_tokens: 2000,
    reasoning_tokens: 0,
    cached_tokens: 300,
    total_tokens: 3300,
    total_cost: 1.23,
    cache_rate: 30,
  },
  trends: {
    request_volume: [{ label: "Mon", value: 100 }],
    success_rate: [{ label: "Mon", value: 97.24 }],
    total_tokens: [{ label: "Mon", value: 3300 }],
    total_cost: [{ label: "Mon", value: 1.23 }],
    failed_requests: [{ label: "Mon", value: 34 }],
    throughput_series: [{ label: "10:00", rpm: 12, tpm: 345 }],
  },
  meta: {
    generated_at: "2026-06-10T00:00:00Z",
  },
  counts: {
    api_keys: 2,
    providers_total: 1,
    gemini_keys: 0,
    claude_keys: 0,
    codex_keys: 0,
    vertex_keys: 0,
    openai_providers: 1,
    auth_files: 0,
  },
  days: 7,
} as const;

describe("DashboardPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.notify.mockReset();
    mocks.getDashboardSummary.mockReset();
    mocks.intervalCallback = null;
    mocks.useSystemStats.mockReturnValue({
      stats: {
        total_rpm: 12,
        total_tpm: 345,
      },
      connected: true,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("keeps the last dashboard snapshot and skips error toasts when silent refresh fails", async () => {
    mocks.getDashboardSummary
      .mockResolvedValueOnce(summary)
      .mockRejectedValueOnce(
        new Error(
          "Management API temporarily returned an HTML error page (502 Bad Gateway).",
        ),
      );

    render(<DashboardPage />);

    await waitFor(() => {
      expect(mocks.getDashboardSummary).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.queryByTestId("empty-state")).toBeNull();

    await act(async () => {
      mocks.intervalCallback?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mocks.getDashboardSummary).toHaveBeenCalledTimes(2);
    });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.queryByTestId("empty-state")).toBeNull();
  });
});
