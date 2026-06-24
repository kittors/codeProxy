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

const baseCodexOAuthAdmissionEditor: DetailModalProps["codexOAuthAdmissionEditor"] = {
  fileName: "codex.json",
  supported: true,
  enabled: true,
  allowedClients: ["claude_code"],
  availableAllowedClients: [
    {
      id: "claude_code",
      label: "Claude Code",
      description: "Allow the Claude Code Codex plugin when Originator and User-Agent both match.",
    },
  ],
  saving: false,
  error: null,
};

const codexIdentityFingerprintDetail: NonNullable<DetailModalProps["identityFingerprintDetail"]> = {
  summary: {
    provider: "codex",
    account_key: "codex-account-1",
    auth_subject_id: "auth-subject-1",
    enabled: true,
    primary_source: "learned",
    learned: true,
    learned_fields: 3,
    effective_fields: 5,
    source_counts: {
      learned: 3,
      preset: 1,
      builtin_default: 1,
    },
    client_product: "codex-tui",
    client_variant: "terminal",
    version: "0.125.0",
    updated_at: "2026-06-23T10:15:00Z",
    last_seen_at: "2026-06-23T10:16:00Z",
  },
  effective: {
    provider: "codex",
    account_key: "codex-account-1",
    auth_subject_id: "auth-subject-1",
    enabled: true,
    client_product: "codex-tui",
    version: "0.125.0",
    fields: {
      "user-agent": { value: "codex-cli/0.125.0", source: "learned" },
      originator: { value: "codex_cli_rs", source: "learned" },
      "x-codex-beta-features": { value: "responses=v1", source: "learned" },
      "session-mode": { value: "server-stable", source: "preset" },
      "websocket-beta": { value: "realtime=v1", source: "builtin_default" },
    },
  },
  learned: {
    provider: "codex",
    account_key: "codex-account-1",
    auth_subject_id: "auth-subject-1",
    client_product: "codex-tui",
    client_variant: "terminal",
    version: "0.125.0",
    fields: {
      "user-agent": "codex-cli/0.125.0",
      originator: "codex_cli_rs",
      "x-codex-beta-features": "responses=v1",
    },
    observed_headers: {
      "user-agent": "codex-cli/0.125.0",
      originator: "codex_cli_rs",
    },
    created_at: "2026-06-22T08:00:00Z",
    updated_at: "2026-06-23T10:15:00Z",
    last_seen_at: "2026-06-23T10:16:00Z",
  },
  preset: {},
  builtin_default: {},
};

const expectSummaryCard = (label: string, value: string) => {
  const labelNode = screen.getByText(label);
  const card = labelNode.closest("div");
  if (!(card instanceof HTMLElement)) {
    throw new Error(`Missing summary card for ${label}`);
  }
  expect(within(card).getByText(value)).toBeInTheDocument();
};

const mockMediaQueryMatches = (matches: boolean) => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
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
    identityFingerprintDetail: null,
    identityFingerprintLoading: false,
    identityFingerprintError: null,
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
    codexOAuthAdmissionEditor: baseCodexOAuthAdmissionEditor,
    setCodexOAuthAdmissionEditor: vi.fn(),
    codexOAuthAdmissionDirty: false,
    saveCodexOAuthAdmission: vi.fn(async () => true),
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
    expect(screen.queryByText("Last 7 days requests")).not.toBeInTheDocument();
    expectSummaryCard("Current weekly cycle", "2");
    expectSummaryCard("Current cycle cost", "$1.2345");
    expectSummaryCard("Predicted 5-hour window quota", "$0.0500");
    expectSummaryCard("Predicted weekly window quota", "$15.4312");
    expectSummaryCard("Weekly quota used", "8%");
    expect(screen.getByRole("dialog", { name: "Codex Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
    expect(chartOptions.at(-1)?.animation).toBe(true);
    expect(chartProps.at(-1)?.initialAnimationGuardMs).toBe(800);
    expect(chartOptions.at(-1)?.grid?.top).toBeGreaterThanOrEqual(70);
    expect(chartOptions.at(-1)?.yAxis?.every((item: any) => !item.name)).toBe(true);
    expect(chartOptions.at(-1)?.series?.every((item: any) => item.animation === true)).toBe(true);
  });

  test("renders zero predicted quota values when Codex trend data is incomplete", () => {
    renderDetailModal({
      detailTrend: {
        auth_index: "auth-1",
        days: 7,
        hours: 5,
        request_total: 3,
        cycle_request_total: 2,
        cycle_cost_total: 0,
        weekly_quota_used_percent: null,
        cycle_start: "",
        daily_usage: [],
        hourly_usage: [{ hour: "2026-04-30 16:00", requests: 1 }],
        quota_series: [],
      },
    });

    expectSummaryCard("Predicted 5-hour window quota", "$0.0000");
    expectSummaryCard("Predicted weekly window quota", "$0.0000");
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

  test("keeps the usage cost card visible for codex files inferred from dotted email file names", () => {
    renderDetailModal({
      detailFile: {
        name: "codex-pcamtu927@gmail.com-plus.json",
        size: 256,
      },
    });

    expect(screen.getByRole("tab", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByText("Current cycle cost")).toBeInTheDocument();
    expect(screen.getByText("$1.2345")).toBeInTheDocument();
  });

  test("keeps the rendered trend visible while a background refresh is running", () => {
    renderDetailModal({ detailTrendLoading: true });

    expect(screen.getByText("Quota and request trends")).toBeInTheDocument();
    expect(screen.getByText("Predicted 5-hour window quota")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  test("keeps first trend loading quiet before the first payload arrives", () => {
    renderDetailModal({ detailTrend: null, detailTrendLoading: true });

    const loading = screen.getByTestId("auth-file-trend-loading");
    expect(loading.querySelectorAll(".animate-pulse")).toHaveLength(9);
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

  test("renders account identity fingerprint sources and learned request headers in mobile flow", () => {
    renderDetailModal({
      detailTab: "identity",
      detailFile: {
        name: "codex.json",
        label: "Codex Primary",
        type: "codex",
        size: 256,
        account_type: "oauth",
        identity_fingerprint_summary: codexIdentityFingerprintDetail.summary,
      },
      identityFingerprintDetail: codexIdentityFingerprintDetail,
    });

    const panel = screen.getByTestId("auth-file-identity-fingerprint");
    const summary = within(panel).getByTestId("auth-file-identity-summary");
    const fields = within(panel).getByTestId("auth-file-identity-fields");
    const scroller = screen.getByTestId("auth-file-detail-scroll");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Usage",
      "Identity",
      "Fields",
      "Models",
    ]);
    expect(screen.getByRole("tab", { name: "Identity" })).toBeInTheDocument();
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.className).toContain("lg:overflow-hidden");
    expect(panel.className).toContain("lg:h-full");
    expect(fields.className).toContain("flex");
    expect(summary).toHaveTextContent("codex-account-1");
    expect(within(summary).getByText("auth-subject-1")).toBeInTheDocument();
    expect(within(summary).getByText("codex-tui / terminal")).toBeInTheDocument();
    expect(within(summary).getByText("0.125.0")).toBeInTheDocument();
    expect(within(panel).getAllByText("Learned").length).toBeGreaterThanOrEqual(2);
    expect(within(panel).getAllByText("Account preset").length).toBeGreaterThanOrEqual(1);
    expect(within(panel).getAllByText("System default").length).toBeGreaterThanOrEqual(1);
    expect(within(fields).getByText("Section")).toBeInTheDocument();
    expect(within(fields).getByText("Field")).toBeInTheDocument();
    expect(within(fields).getByText("Value")).toBeInTheDocument();
    expect(within(fields).getByText("Source")).toBeInTheDocument();
    expect(within(fields).getAllByText("Effective Fields").length).toBeGreaterThanOrEqual(1);
    expect(within(fields).getAllByText("Learned Fields").length).toBeGreaterThanOrEqual(1);
    expect(within(fields).getAllByText("Observed Headers").length).toBeGreaterThanOrEqual(1);
    expect(within(fields).getAllByText("user-agent").length).toBeGreaterThanOrEqual(2);
    expect(within(fields).getAllByText("codex-cli/0.125.0").length).toBeGreaterThanOrEqual(2);
    expect(within(fields).getByText("session-mode")).toBeInTheDocument();
    expect(within(fields).getByText("server-stable")).toBeInTheDocument();
    expect(within(fields).getByText("websocket-beta")).toBeInTheDocument();
    expect(within(fields).getByText("realtime=v1")).toBeInTheDocument();
    expect(within(panel).queryByText("Custom")).not.toBeInTheDocument();
    const mobileTable = within(fields).getByTestId("auth-file-identity-table-mobile");
    expect(mobileTable.className).toContain("overflow-x-auto");
    expect(
      within(fields).queryByTestId("auth-file-identity-table-desktop"),
    ).not.toBeInTheDocument();
    expect(fields.querySelector("[data-vt-natural-flow]")).toBeInTheDocument();
    expect(fields.querySelector('[data-scrollbar-visibility="hover"]')).toBeNull();
  });

  test("keeps identity fingerprint table scroll owned by the table on desktop", () => {
    mockMediaQueryMatches(true);

    renderDetailModal({
      detailTab: "identity",
      detailFile: {
        name: "codex.json",
        label: "Codex Primary",
        type: "codex",
        size: 256,
        account_type: "oauth",
        identity_fingerprint_summary: codexIdentityFingerprintDetail.summary,
      },
      identityFingerprintDetail: codexIdentityFingerprintDetail,
    });

    const fields = screen.getByTestId("auth-file-identity-fields");
    const desktopTable = within(fields).getByTestId("auth-file-identity-table-desktop");
    expect(desktopTable.className).toContain("overflow-hidden");
    expect(within(fields).queryByTestId("auth-file-identity-table-mobile")).not.toBeInTheDocument();
    const tableViewport = fields.querySelector('[data-scrollbar-visibility="hover"]');
    if (!(tableViewport instanceof HTMLElement)) {
      throw new Error("identity fingerprint fields table must own its scroll viewport");
    }
    expect(tableViewport.className).toContain("overflow-auto");
    expect(tableViewport.className).toContain("overscroll-y-none");
    expect(fields.querySelector("[data-vt-natural-flow]")).toBeNull();
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
    expect(grid.className).toContain("lg:grid-cols-2");
    expect(grid.className).not.toContain("max-w-3xl");
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

  test("renders Codex OAuth admission controls and saves the dirty state", () => {
    const saveCodexOAuthAdmission = vi.fn(async () => true);
    const props = renderDetailModal({
      detailTab: "fields",
      prefixProxyDirty: false,
      codexOAuthAdmissionDirty: true,
      saveCodexOAuthAdmission,
    });

    const panel = screen.getByTestId("codex-oauth-admission-panel");
    expect(within(panel).getByText("Official Codex client admission")).toBeInTheDocument();
    expect(
      within(panel).getByRole("switch", { name: "Only allow official Codex clients" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("codex-oauth-admission-preset-claude_code")).toBeChecked();
    expect(panel).toHaveTextContent("Claude Code");
    expect(panel).toHaveTextContent("Originator and User-Agent");
    expect(panel).toHaveTextContent("leave fingerprint fields empty");

    fireEvent.click(screen.getByTestId("codex-oauth-admission-preset-claude_code"));
    expect(props.setCodexOAuthAdmissionEditor).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(saveCodexOAuthAdmission).toHaveBeenCalled();
  });

  test("hides Codex OAuth admission controls when the server does not expose metadata", () => {
    renderDetailModal({
      detailTab: "fields",
      codexOAuthAdmissionEditor: {
        fileName: "codex-api-key.json",
        supported: false,
        enabled: false,
        allowedClients: [],
        availableAllowedClients: [],
        saving: false,
        error: null,
      },
    });

    expect(screen.queryByTestId("codex-oauth-admission-panel")).not.toBeInTheDocument();
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
