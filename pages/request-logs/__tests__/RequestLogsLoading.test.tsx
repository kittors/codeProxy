import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import { RequestLogsPage } from "../RequestLogsPage";

const mocks = vi.hoisted(() => ({
  getUsageLogs: vi.fn(),
  getRequestLogBodyStorage: vi.fn(async () => false),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    configApi: {
      ...actual.configApi,
      getRequestLogBodyStorage: mocks.getRequestLogBodyStorage,
    },
    usageApi: {
      ...actual.usageApi,
      getUsageLogs: mocks.getUsageLogs,
    },
  };
});

const logsResponse = {
  items: [
    {
      id: 1000841997,
      timestamp: "2026-09-03T08:56:21Z",
      time: "2026-09-03T08:56:21Z",
      channel_name: "relay-channel@example.com",
      failed: false,
      input_tokens: 1200,
      output_tokens: 68,
      cached_tokens: 0,
      total_tokens: 1268,
      cost: 0.0123,
      model: "gpt-5.1-codex",
      api_key: "sk-test1234567890",
      api_key_name: "QA",
      has_content: false,
    },
  ],
  total: 1,
  total_count: 1,
  stats: { total: 1, success_rate: 100, total_tokens: 1268, total_cost: 0.0123, cache_rate: 0 },
  filters: { api_keys: [], models: [], channels: [], statuses: ["success"] },
};

const renderPage = () =>
  render(
    <ThemeProvider>
      <ToastProvider>
        <RequestLogsPage />
      </ToastProvider>
    </ThemeProvider>,
  );

const blurOverlay = () => document.querySelector(".backdrop-blur-sm");
const loadingAnnouncements = () =>
  screen.queryAllByRole("status").filter((node) => /加载中/.test(node.textContent ?? ""));

describe("RequestLogsPage loading states", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage("zh-CN");
    mocks.getUsageLogs.mockReset();
  });

  test("first load: only the table's skeleton, and the stats bar and pager say — instead of 0", async () => {
    let resolveLogs: (value: typeof logsResponse) => void = () => {};
    mocks.getUsageLogs.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogs = resolve;
        }),
    );
    renderPage();

    await waitFor(() =>
      expect(document.querySelectorAll("tbody tr[aria-hidden='true']").length).toBeGreaterThan(0),
    );
    // No page overlay on top of the skeleton (it used to blur it), and "loading" is said once.
    expect(blurOverlay()).toBeNull();
    expect(loadingAnnouncements()).toHaveLength(1);
    // "0 条记录 / 成功率 0.0% / 第 0-0 条" looked like there was no data at all.
    expect(screen.getByText("— 条记录")).toBeInTheDocument();
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
    expect(screen.queryByText(/第 0-0 条/)).not.toBeInTheDocument();

    resolveLogs(logsResponse);
    expect(await screen.findByText("1 条记录")).toBeInTheDocument();
    expect(screen.getByText("100.0%")).toBeInTheDocument();
    expect(screen.getByText("第 1-1 条，共 1 条")).toBeInTheDocument();
  });

  test("refreshing with rows on screen covers them with the overlay and keeps the stats", async () => {
    const user = userEvent.setup();
    mocks.getUsageLogs.mockResolvedValueOnce(logsResponse);
    renderPage();
    expect(await screen.findByText("1 条记录")).toBeInTheDocument();
    expect(blurOverlay()).toBeNull();

    mocks.getUsageLogs.mockImplementation(() => new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: "刷新" }));

    await waitFor(() => expect(blurOverlay()).not.toBeNull());
    expect(screen.getByText("1 条记录")).toBeInTheDocument();
    expect(screen.getByText("100.0%")).toBeInTheDocument();
  });
});
