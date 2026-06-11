import type { ComponentProps } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AuthFileDetailModal } from "@pages/auth-files/components/AuthFileDetailModal";
import i18n from "@code-proxy/i18n";

type DetailModalProps = ComponentProps<typeof AuthFileDetailModal>;

const chartOptions = vi.hoisted(() => [] as any[]);
const chartEvents = vi.hoisted(() => [] as any[]);
const chartProps = vi.hoisted(() => [] as any[]);

vi.mock("@code-proxy/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/ui")>()),
  EChart: ({
    option,
    className,
    onEvents,
    initialAnimationGuardMs,
  }: {
    option: any;
    className?: string;
    onEvents?: Record<string, () => void>;
    initialAnimationGuardMs?: number;
  }) => {
    chartOptions.push(option);
    chartEvents.push(onEvents);
    chartProps.push({ initialAnimationGuardMs, onEvents, option });
    return (
      <div
        className={className}
        data-testid="auth-file-trend-chart"
        data-x-axis={JSON.stringify(option?.xAxis?.data ?? [])}
        data-series={JSON.stringify(option?.series ?? [])}
      >
        chart
      </div>
    );
  },
}));

const basePrefixProxyEditor: DetailModalProps["prefixProxyEditor"] = {
  open: true,
  fileName: "codex.json",
  loading: false,
  saving: false,
  error: null,
  json: { prefix: "team-a", proxy_id: "primary", proxy_url: "http://127.0.0.1:7890" },
  prefix: "team-a",
  proxyUrl: "http://127.0.0.1:7890",
  proxyId: "primary",
  subscriptionStartedAt: "2026-04-01T08:30",
  subscriptionPeriod: "monthly",
};

const renderDetailModal = (overrides: Partial<DetailModalProps> = {}) => {
  const props: DetailModalProps = {
    open: true,
    detailFile: {
      name: "codex.json",
      label: "Codex Primary",
      type: "codex",
      size: 256,
      account_type: "oauth",
    },
    detailLoading: false,
    detailText: '{"token":"abc","nested":{"enabled":true}}',
    detailTab: "usage",
    setDetailOpen: vi.fn(),
    setDetailTab: vi.fn(),
    detailTrendWindow: "5h",
    setDetailTrendWindow: vi.fn(),
    detailTrendLoading: false,
    detailTrendError: null,
    detailTrend: {
      auth_index: "auth-1",
      days: 7,
      hours: 5,
      request_total: 3,
      cycle_request_total: 2,
      cycle_cost_total: 1.2345,
      weekly_quota_used_percent: 8,
      cycle_start: "2026-04-27T16:01:21Z",
      daily_usage: [
        { date: "2026-04-24", requests: 0, cost: 0 },
        { date: "2026-04-25", requests: 0, cost: 0 },
        { date: "2026-04-26", requests: 0, cost: 0 },
        { date: "2026-04-27", requests: 1, cost: 0.01 },
        { date: "2026-04-28", requests: 0, cost: 0 },
        { date: "2026-04-29", requests: 0, cost: 0 },
        { date: "2026-04-30", requests: 2, cost: 0.02 },
      ],
      hourly_usage: [{ hour: "2026-04-30 16:00", requests: 1, cost: 0.004 }],
      quota_series: [
        {
          quota_key: "code_5h",
          quota_label: "m_quota.code_5h",
          window_seconds: 18000,
          points: [{ timestamp: "2026-04-30T16:01:47Z", percent: 92 }],
        },
      ],
    },
    refreshDetailTrend: vi.fn(async () => undefined),
    loadModelsForDetail: vi.fn(async () => undefined),
    loadModelOwnerGroups: vi.fn(async () => undefined),
    modelsLoading: false,
    modelsError: null,
    modelsList: [
      { id: "gpt-5.1", display_name: "GPT 5.1", owned_by: "openai" },
      { id: "gpt-5.1-mini", owned_by: "openai" },
    ],
    modelsFileType: "codex",
    modelOwnerGroupsLoading: false,
    mappedModelOwnerGroup: null,
    mappedModelOwnerValue: "",
    excluded: {},
    prefixProxyEditor: basePrefixProxyEditor,
    setPrefixProxyEditor: vi.fn(),
    prefixProxyDirty: true,
    savePrefixProxy: vi.fn(async () => undefined),
    proxyPoolEntries: [
      {
        id: "primary",
        name: "Primary egress",
        url: "http://127.0.0.1:7890",
        enabled: true,
      },
    ],
    channelEditor: {
      open: true,
      fileName: "codex.json",
      label: "Codex Primary",
      saving: false,
      error: null,
    },
    setChannelEditor: vi.fn(),
    saveChannelEditor: vi.fn(async () => true),
    ...overrides,
  };

  render(<AuthFileDetailModal {...props} />);
  return props;
};

describe("AuthFileDetailModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    chartOptions.length = 0;
    chartEvents.length = 0;
    chartProps.length = 0;
  });

  test("uses usage trend as the primary view for Codex files", () => {
    renderDetailModal();

    expect(screen.queryByTestId("auth-file-json-reader")).not.toBeInTheDocument();
    expect(screen.queryByText(/"token"/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Content" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Info" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Channel" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Fields" })).toBeInTheDocument();
    expect(screen.getByText("Last 7 days requests")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Current weekly cycle")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Current cycle cost")).toBeInTheDocument();
    expect(screen.getByText("$1.2345")).toBeInTheDocument();
    expect(screen.getByText("Weekly quota used")).toBeInTheDocument();
    expect(screen.getByText("8%")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Codex Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    expect(chartOptions.at(-1)?.animation).toBe(true);
    expect(chartProps.at(-1)?.initialAnimationGuardMs).toBe(800);
    expect(chartOptions.at(-1)?.grid?.top).toBeGreaterThanOrEqual(70);
    expect(chartOptions.at(-1)?.yAxis?.every((item: any) => !item.name)).toBe(true);
    expect(chartOptions.at(-1)?.series?.every((item: any) => item.animation === true)).toBe(true);
  });

  test("disables trend chart animation after the first render completes", () => {
    renderDetailModal();

    expect(chartOptions.at(-1)?.animation).toBe(true);
    act(() => {
      chartEvents.at(-1)?.finished?.();
    });

    expect(chartOptions.at(-1)?.animation).toBe(false);
    expect(chartProps.at(-1)?.initialAnimationGuardMs).toBe(0);
    expect(chartOptions.at(-1)?.series?.every((item: any) => item.animation === false)).toBe(true);
  });

  test("keeps the usage cost card visible for codex files inferred from dotted email file names", () => {
    renderDetailModal({
      detailFile: {
        name: "codex-pcamtu927@gmail.com-plus.json",
        size: 256,
      },
    });

    expect(screen.getByRole("tab", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "pcamtu927@gmail.com" })).toBeInTheDocument();
    expect(screen.getByText("Plus")).toBeInTheDocument();
    expect(screen.getByText("Current cycle cost")).toBeInTheDocument();
    expect(screen.getByText("$1.2345")).toBeInTheDocument();
  });

  test("keeps the rendered trend visible while a background refresh is running", () => {
    renderDetailModal({ detailTrendLoading: true });

    expect(screen.getByText("Quota and request trends")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days requests")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  test("keeps first trend loading quiet before the first payload arrives", () => {
    renderDetailModal({ detailTrend: null, detailTrendLoading: true });

    const loading = screen.getByTestId("auth-file-trend-loading");
    expect(loading.querySelectorAll(".animate-pulse")).toHaveLength(8);
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    expect(screen.queryByTestId("auth-file-trend-chart")).not.toBeInTheDocument();
    expect(chartOptions).toHaveLength(0);
  });

  test("does not render quota sample summary cards below the trend chart", () => {
    renderDetailModal();

    expect(screen.queryByTestId("auth-file-quota-series-list")).not.toBeInTheDocument();
    expect(screen.queryByText(/samples/)).not.toBeInTheDocument();
    expect(screen.queryByText(/resets/)).not.toBeInTheDocument();
  });

  test("five-hour trend uses only the latest five hourly buckets and maps quota timestamps to local hours", () => {
    const localQuotaAt15 = new Date(2026, 4, 1, 15, 9, 0).toISOString();
    const oldQuotaAt22 = new Date(2026, 3, 30, 22, 15, 0).toISOString();

    renderDetailModal({
      detailTrend: {
        auth_index: "auth-1",
        days: 7,
        hours: 5,
        request_total: 12,
        cycle_request_total: 12,
        cycle_cost_total: 0.008,
        weekly_quota_used_percent: 6,
        cycle_start: "2026-04-28T05:34:34Z",
        daily_usage: [],
        hourly_usage: [
          { hour: "2026-05-01 11:00", requests: 0, cost: 0 },
          { hour: "2026-05-01 12:00", requests: 2, cost: 0.002 },
          { hour: "2026-05-01 13:00", requests: 1, cost: 0.001 },
          { hour: "2026-05-01 14:00", requests: 1, cost: 0.001 },
          { hour: "2026-05-01 15:00", requests: 10, cost: 0.01 },
        ],
        quota_series: [
          {
            quota_key: "code_5h",
            quota_label: "GPT-5.3-Codex-Spark: 五小时",
            window_seconds: 18000,
            points: [
              { timestamp: oldQuotaAt22, percent: 100 },
              { timestamp: localQuotaAt15, percent: 94 },
            ],
          },
        ],
      },
    });

    const chart = screen.getByTestId("auth-file-trend-chart");
    expect(JSON.parse(chart.dataset.xAxis ?? "[]")).toEqual([
      "05-01 11:00",
      "05-01 12:00",
      "05-01 13:00",
      "05-01 14:00",
      "05-01 15:00",
    ]);

    const series = JSON.parse(chart.dataset.series ?? "[]");
    expect(series[0].data).toEqual([0, 2, 1, 1, 10]);
    expect(series[1].data).toEqual([0, 0.002, 0.001, 0.001, 0.01]);
    expect(series[2].name).toBe("五小时 used");
    expect(series[2].data).toEqual([null, null, null, null, 6]);
  });

  test("renders models as a compact list without raw field labels", () => {
    renderDetailModal({ detailTab: "models" });

    const list = screen.getByTestId("auth-file-models-list");
    expect(within(list).getByText("gpt-5.1")).toBeInTheDocument();
    expect(within(list).getByText("GPT 5.1")).toBeInTheDocument();
    expect(within(list).getAllByText("openai")).toHaveLength(2);
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.queryByText(/display_name:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/owned_by:/)).not.toBeInTheDocument();
  });

  test("keeps field editing controls without showing JSON in the modal", () => {
    renderDetailModal({ detailTab: "fields" });

    const body = screen.getByTestId("auth-file-detail-body");
    const scroller = screen.getByTestId("auth-file-detail-scroll");
    const grid = screen.getByTestId("auth-file-fields-grid");
    expect(body.className).toContain("!overflow-hidden");
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller).not.toContainElement(screen.getByRole("tablist"));
    expect(grid.className).not.toMatch(/\bborder\b/);
    expect(grid.className).not.toContain("divide-y");
    expect(within(grid).getByPlaceholderText("e.g. team-a")).toHaveValue("team-a");
    expect(within(grid).getByLabelText("proxy_id (proxy pool)")).toBeInTheDocument();
    expect(within(grid).getByPlaceholderText("e.g. http://127.0.0.1:7890")).toHaveValue(
      "http://127.0.0.1:7890",
    );
    expect(within(grid).getByLabelText(/Subscription start/)).toBeInTheDocument();
    expect(screen.queryByTestId("auth-file-fields-preview")).not.toBeInTheDocument();
    expect(screen.queryByText(/"prefix"/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  test("keeps the OAuth channel rename action available in fields", () => {
    const saveChannelEditor = vi.fn(async () => true);
    const props = renderDetailModal({
      detailTab: "fields",
      channelEditor: {
        open: true,
        fileName: "codex.json",
        label: "Codex Team A",
        saving: false,
        error: null,
      },
      saveChannelEditor,
    });

    fireEvent.change(screen.getByPlaceholderText("e.g. Gemini Primary"), {
      target: { value: "Codex Team B" },
    });
    expect(props.setChannelEditor).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saveChannelEditor).toHaveBeenCalled();
  });

  test("shows the channel alias editor for Kimi auth files without account_type metadata", () => {
    renderDetailModal({
      detailTab: "fields",
      detailFile: {
        name: "kimi-1770000000000.json",
        label: "Kimi Team A",
        type: "kimi",
        provider: "kimi",
        size: 256,
      },
      prefixProxyEditor: {
        ...basePrefixProxyEditor,
        fileName: "kimi-1770000000000.json",
        json: { type: "kimi", refresh_token: "kimi-refresh-token" },
        prefix: "",
        proxyUrl: "",
        proxyId: "",
      },
      channelEditor: {
        open: true,
        fileName: "kimi-1770000000000.json",
        label: "Kimi Team A",
        saving: false,
        error: null,
      },
    });

    expect(screen.getByText("Channel name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Gemini Primary")).toHaveValue("Kimi Team A");
  });
});
