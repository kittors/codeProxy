import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import {
  ApiClientError,
  normalizeMonitorOverview,
  normalizeMonitorRealtime,
  type ChartDataResponse,
  type MonitorQuery,
} from "@code-proxy/api-client";
import { MonitorPage } from "../MonitorPage";
import { resetMonitorBackendProbe } from "../hooks/useMonitorOverview";

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getRealtime: vi.fn(),
  getChartData: vi.fn(),
  getLogContent: vi.fn(),
  can: vi.fn((_permission: string) => true),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    usageMonitorApi: { getOverview: mocks.getOverview, getRealtime: mocks.getRealtime },
    usageApi: {
      ...actual.usageApi,
      getChartData: mocks.getChartData,
      getLogContent: mocks.getLogContent,
    },
  };
});

vi.mock("@app/providers/AuthProvider", () => ({
  useAuth: () => ({ can: mocks.can, state: { principal: null }, actions: {} }),
}));

vi.mock("@code-proxy/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/ui")>();
  return {
    ...actual,
    // Canvas charts are covered by their option builders; here they are boxes.
    EChart: ({ className }: { className?: string }) => (
      <div data-testid="echart" className={className} />
    ),
    useTheme: () => ({ state: { mode: "light", preference: "light" }, actions: {} }),
    // Render the final value synchronously instead of animating towards it.
    AnimatedNumber: ({ value, format }: { value: number; format: (value: number) => string }) => (
      <span>{format(value)}</span>
    ),
  };
});

const BOUNDS = [
  100, 150, 200, 300, 400, 500, 700, 1000, 1500, 2000, 3000, 4000, 5000, 7000, 10000, 15000, 20000,
  25000, 30000, 40000, 50000, 60000, 90000, 120000, 180000, 300000, 600000,
];

function overviewFixture() {
  const histogram = Array.from({ length: BOUNDS.length + 1 }, (_, index) =>
    index === 9 ? 80 : index === 12 ? 20 : 0,
  );
  return normalizeMonitorOverview({
    generated_at: "2026-10-07T13:47:00+08:00",
    range: {
      key: "24h",
      start: "2026-10-06T14:00:00+08:00",
      end: "2026-10-07T14:00:00+08:00",
      previous_start: "2026-10-05T14:00:00+08:00",
      previous_end: "2026-10-06T14:00:00+08:00",
      step_seconds: 3600,
      timezone: "Asia/Shanghai",
    },
    summary: {
      current: {
        requests: 1200,
        success: 1188,
        failed: 12,
        streaming: 900,
        success_rate: 99,
        total_tokens: 50000,
        cost: 12.5,
        latency_avg_ms: 2000,
        first_token_avg_ms: 600,
      },
      previous: {
        requests: 1000,
        success: 995,
        failed: 5,
        success_rate: 99.5,
        total_tokens: 40000,
        cost: 10,
        latency_avg_ms: 2100,
        first_token_avg_ms: 650,
      },
    },
    series: [
      {
        start: "2026-10-07T12:00:00+08:00",
        requests: 600,
        success: 594,
        failed: 6,
        success_rate: 99,
        latency_avg_ms: 2000,
      },
      {
        start: "2026-10-07T13:00:00+08:00",
        requests: 600,
        success: 594,
        failed: 6,
        success_rate: 99,
        latency_avg_ms: 2000,
      },
    ],
    latency: {
      coverage_start: "2026-10-06T14:00:05+08:00",
      bounds_ms: BOUNDS,
      total: {
        samples: 100,
        avg_ms: 2200,
        max_ms: 6000,
        p50_ms: 1700,
        p90_ms: 4200,
        p95_ms: 4800,
        p99_ms: 5900,
        histogram,
      },
      first_token: {
        samples: 80,
        avg_ms: 600,
        max_ms: 900,
        p50_ms: 580,
        p90_ms: 800,
        p95_ms: 850,
        p99_ms: 890,
        histogram,
      },
    },
    models: {
      rows: [
        {
          key: "gpt-test",
          label: "gpt-test",
          requests: 900,
          success: 896,
          failed: 4,
          success_rate: 99.56,
          trend: [450, 450],
          trend_failed: [2, 2],
        },
        {
          key: "claude-test",
          label: "claude-test",
          requests: 300,
          success: 292,
          failed: 8,
          success_rate: 97.33,
          trend: [150, 150],
          trend_failed: [4, 4],
        },
      ],
      total: 2,
    },
    channels: {
      rows: [
        {
          key: "codex-a",
          label: "Codex-A",
          provider: "codex",
          auth_type: "oauth",
          requests: 900,
          failed: 4,
          success_rate: 99.56,
        },
        {
          key: "claude-b",
          label: "Claude-B",
          provider: "claude",
          auth_type: "oauth",
          requests: 300,
          failed: 8,
          success_rate: 97.33,
        },
      ],
      total: 2,
    },
    consumers: {
      rows: [
        { key: "eu:alice", label: "Alice", kind: "end_user", requests: 1200, success_rate: 99 },
      ],
      total: 1,
    },
    heatmap: {
      start: "2026-10-01T00:00:00+08:00",
      days: 7,
      cells: [{ weekday: 3, hour: 12, requests: 600, failed: 6 }],
    },
    flows: {
      nodes: [
        { id: "consumer:eu:alice", label: "Alice", layer: "consumer" },
        { id: "model:gpt-test", label: "gpt-test", layer: "model" },
        { id: "channel:codex-a", label: "Codex-A", layer: "channel" },
      ],
      links: [
        { source: "consumer:eu:alice", target: "model:gpt-test", requests: 900, tokens: 100 },
        { source: "model:gpt-test", target: "channel:codex-a", requests: 900, tokens: 100 },
      ],
    },
    recent_failures: [
      {
        id: 42,
        timestamp: "2026-10-07T04:20:00Z",
        model: "claude-test",
        channel: "Claude-B",
        consumer: "Alice",
        latency_ms: 1200,
        streaming: true,
      },
    ],
    filters: {
      models: [
        { value: "gpt-test", label: "gpt-test", requests: 900 },
        { value: "claude-test", label: "claude-test", requests: 300 },
      ],
      channels: [{ value: "codex-a", label: "Codex-A", requests: 900, provider: "codex" }],
      consumers: [{ value: "eu:alice", label: "Alice", requests: 1200, kind: "end_user" }],
    },
  });
}

const realtimeFixture = () =>
  normalizeMonitorRealtime({
    points: Array.from({ length: 60 }, (_, index) => ({
      start: `2026-10-07T13:${String(index % 60).padStart(2, "0")}:00+08:00`,
      requests: 3,
      success: 3,
    })),
    current_rpm: 3,
    peak_rpm: 5,
    current_tpm: 1200,
    last_5m: { requests: 15, success: 15, success_rate: 100, latency_avg_ms: 1800 },
  });

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage(entry = "/runtime/monitor") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/runtime/monitor"
          element={
            <>
              <MonitorPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const notFound = () => new ApiClientError({ message: "not found", status: 404 });

describe("MonitorPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    resetMonitorBackendProbe();
    localStorage.clear();
    mocks.getOverview.mockReset().mockResolvedValue(overviewFixture());
    mocks.getRealtime.mockReset().mockResolvedValue(realtimeFixture());
    mocks.getChartData.mockReset();
    mocks.getLogContent
      .mockReset()
      .mockResolvedValue({ output_content: '{"error":{"message":"upstream overloaded"}}' });
    mocks.can.mockReset().mockReturnValue(true);
  });

  test("renders every section from one overview request", async () => {
    renderPage();
    expect(await screen.findByText("Health score")).toBeInTheDocument();
    expect(mocks.getOverview).toHaveBeenCalledTimes(1);
    expect(mocks.getOverview.mock.calls[0][0]).toEqual({
      range: "24h",
      consumers: [],
      models: [],
      channels: [],
    });
    expect(mocks.getRealtime).toHaveBeenCalled();

    for (const title of [
      "Live traffic",
      "Traffic & reliability",
      "Latency distribution",
      "Failure analysis",
      "Model performance",
      "Channel health",
      "Portal users",
      "Traffic flow",
      "Active hours",
    ]) {
      // Card titles are headings; the same words also appear in legends and filters.
      expect(screen.getByRole("heading", { name: new RegExp(`^${title}`) })).toBeInTheDocument();
    }
    const requests = screen.getByRole("article", { name: "Requests" });
    expect(within(requests).getByText("1,200")).toBeInTheDocument();
    expect(within(requests).getByText("+20.0%")).toBeInTheDocument();
    // P95 comes from the request details, not the rollup average.
    expect(
      within(screen.getByRole("article", { name: "P95 latency" })).getByText("4.80s"),
    ).toBeInTheDocument();
  });

  test("clicking a ranking row filters the whole page and the address bar", async () => {
    renderPage();
    const table = (await screen.findByText("Model performance")).closest("section")!;
    fireEvent.click(within(table).getByRole("button", { name: /claude-test/ }));

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("?model=claude-test"),
    );
    await waitFor(() => {
      const last = mocks.getOverview.mock.calls.at(-1)?.[0] as MonitorQuery;
      expect(last.models).toEqual(["claude-test"]);
    });
    const chip = screen.getByRole("button", { name: "Remove filter: claude-test" });
    fireEvent.click(chip);
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(/^\/runtime\/monitor$/),
    );
  });

  test("reads the view from the address bar", async () => {
    renderPage("/runtime/monitor?range=7d&channel=codex-a&consumer=eu:alice");
    await screen.findByText("Health score");
    expect(mocks.getOverview.mock.calls[0][0]).toEqual({
      range: "7d",
      consumers: ["eu:alice"],
      models: [],
      channels: ["codex-a"],
    });
    expect(mocks.getRealtime.mock.calls[0][0]).toEqual({
      consumers: ["eu:alice"],
      models: [],
      channels: ["codex-a"],
    });
  });

  test("falls back to chart-data on a backend without the monitor endpoints", async () => {
    mocks.getOverview.mockRejectedValue(notFound());
    mocks.getRealtime.mockRejectedValue(notFound());
    const chart: ChartDataResponse = {
      daily_series: [
        {
          date: "2026-10-07",
          requests: 40,
          failed_requests: 1,
          input_tokens: 100,
          output_tokens: 20,
        },
      ],
      model_distribution: [{ model: "gpt-old", requests: 40, tokens: 120 }],
      hourly_tokens: [],
      hourly_models: [],
      apikey_distribution: [],
    };
    mocks.getChartData.mockResolvedValue(chart);

    renderPage();
    expect(await screen.findByText(/This backend is an older version/)).toBeInTheDocument();
    // Minute and hour ranges need the new endpoints: disabled, and the view moves to today.
    expect(screen.getByRole("tab", { name: "1 hour" })).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("?range=today"));
    await waitFor(() =>
      expect(mocks.getChartData).toHaveBeenLastCalledWith(1, "", expect.anything()),
    );
    expect(screen.getByText("gpt-old")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Models" })).toBeNull();
    expect(screen.getAllByText("Needs a newer backend").length).toBeGreaterThan(0);
    // The probe is remembered: no second 404 when the range changes.
    const overviewCalls = mocks.getOverview.mock.calls.length;
    fireEvent.click(screen.getByRole("tab", { name: "7 days" }));
    await waitFor(() =>
      expect(mocks.getChartData).toHaveBeenLastCalledWith(7, "", expect.anything()),
    );
    expect(mocks.getOverview.mock.calls.length).toBe(overviewCalls);
  });

  test("shows the error and retries when the first load fails", async () => {
    mocks.getOverview.mockRejectedValueOnce(new Error("boom"));
    renderPage();
    expect(await screen.findByText("Couldn't load monitor data")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Health score")).toBeInTheDocument();
  });

  test("opens the upstream error of a recent failure only with content permission", async () => {
    const { unmount } = renderPage();
    const failures = (await screen.findByText("Failure analysis")).closest("section")!;
    fireEvent.click(within(failures).getByRole("button", { name: "Details" }));
    await waitFor(() => expect(mocks.getLogContent).toHaveBeenCalledWith(42));
    unmount();

    mocks.can.mockImplementation(
      (permission: string) => permission !== "request_logs.content.read",
    );
    renderPage();
    const restricted = (await screen.findByText("Failure analysis")).closest("section")!;
    expect(within(restricted).queryByRole("button", { name: "Details" })).toBeNull();
  });
});
