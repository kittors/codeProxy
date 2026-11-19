import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import {
  deferred,
  findLogGrid,
  logItem,
  logsAnswer,
  renderRequestLogsPage,
  summaryValue,
} from "./requestLogsTestKit";

// Loading on the request log page: the first load is the table's own skeleton and the summary and
// pager say "—" instead of 0; a refresh with rows on screen is a thin progress bar over the same
// frame; a failed load is the table's error state with a retry, not a toast.

const mocks = vi.hoisted(() => ({
  getUsageLogs: vi.fn(),
  getRequestLogBodyStorage: vi.fn(async () => false),
  getConfig: vi.fn(async () => ({})),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    configApi: {
      ...actual.configApi,
      getRequestLogBodyStorage: mocks.getRequestLogBodyStorage,
      getConfig: mocks.getConfig,
    },
    usageApi: { ...actual.usageApi, getUsageLogs: mocks.getUsageLogs },
  };
});

const oneRow = () =>
  logsAnswer(
    [
      logItem({
        id: 1000841997,
        timestamp: "2026-09-03T08:56:21Z",
        channel_name: "relay-channel@example.com",
        input_tokens: 1200,
        output_tokens: 68,
        total_tokens: 1268,
        model: "gpt-5.1-codex",
        api_key_name: "QA",
      }),
    ],
    {
      stats: { total: 1, success_rate: 100, total_tokens: 1268, total_cost: 0.0123, cache_rate: 0 },
    },
  );

const blurOverlay = () => document.querySelector(".backdrop-blur-sm");
const skeletonRows = () => document.querySelectorAll("tbody[aria-hidden='true'] tr");
const pager = () => within(screen.getByRole("navigation", { name: "Pagination" }));

describe("RequestLogsPage loading states", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    window.localStorage.clear();
    mocks.getUsageLogs.mockReset();
  });

  test("first load: only the table's skeleton, and the summary and pager say — instead of 0", async () => {
    const first = deferred<ReturnType<typeof oneRow>>();
    mocks.getUsageLogs.mockReturnValue(first.promise);
    renderRequestLogsPage();

    await waitFor(() => expect(skeletonRows().length).toBeGreaterThan(0));
    // No page overlay on top of the skeleton (it used to blur it), and the grid says it is busy.
    expect(blurOverlay()).toBeNull();
    expect(screen.getByRole("grid")).toHaveAttribute("aria-busy", "true");
    // "0 requests / 0.0% / 0–0 of 0" looked like there was no data at all.
    expect(summaryValue("Requests")).toBe("—");
    expect(summaryValue("Success Rate")).toBe("—");
    expect(pager().getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("No records")).toBeNull();

    first.resolve(oneRow());
    const grid = await findLogGrid();
    expect(await within(grid).findByText("gpt-5.1-codex")).toBeInTheDocument();
    expect(summaryValue("Requests")).toBe("1");
    expect(summaryValue("Success Rate")).toBe("100.0%");
    expect(pager().getByText("1–1 of 1")).toBeInTheDocument();
    expect(grid).not.toHaveAttribute("aria-busy");
  });

  test("refreshing with rows on screen shows a progress bar in the same frame and keeps the stats", async () => {
    const user = userEvent.setup();
    mocks.getUsageLogs.mockResolvedValueOnce(oneRow());
    renderRequestLogsPage();
    const grid = await findLogGrid();
    expect(await within(grid).findByText("gpt-5.1-codex")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();

    mocks.getUsageLogs.mockImplementation(() => new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByRole("progressbar", { name: "Loading" })).toBeInTheDocument();
    // The rows stay (dimmed), there is no blurred overlay, and the summary keeps its numbers.
    expect(within(grid).getByText("gpt-5.1-codex")).toBeInTheDocument();
    expect(blurOverlay()).toBeNull();
    expect(summaryValue("Requests")).toBe("1");
    expect(summaryValue("Success Rate")).toBe("100.0%");
  });

  test("a failed load is the table's error state with a retry, not a toast", async () => {
    const user = userEvent.setup();
    mocks.getUsageLogs.mockRejectedValueOnce(new Error("upstream timed out"));
    renderRequestLogsPage();

    const alert = await within(await findLogGrid()).findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the data");
    expect(alert).toHaveTextContent("upstream timed out");
    // The message lives in the table only, not also in a toast that disappears.
    expect(screen.getAllByText(/upstream timed out/)).toHaveLength(1);

    mocks.getUsageLogs.mockResolvedValueOnce(oneRow());
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mocks.getUsageLogs).toHaveBeenCalledTimes(2));
    expect(await within(await findLogGrid()).findByText("gpt-5.1-codex")).toBeInTheDocument();
    expect(within(await findLogGrid()).queryByRole("alert")).toBeNull();
  });
});
