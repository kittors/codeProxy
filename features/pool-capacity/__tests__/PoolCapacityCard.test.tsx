import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { PoolCapacityEntry, PoolCapacityResponse } from "@code-proxy/api-client";
import { PoolCapacityCard } from "../PoolCapacityCard";

const mocks = vi.hoisted(() => ({
  get: vi.fn<(options?: { signal?: AbortSignal }) => Promise<PoolCapacityResponse>>(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return { ...actual, poolCapacityApi: { get: mocks.get } };
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 10, 1, 9, 30).getTime();
const iso = (ms: number) => new Date(ms).toISOString();

function pool(overrides: Partial<PoolCapacityEntry> = {}): PoolCapacityEntry {
  return {
    provider: "codex",
    window_key: "code_week",
    window_label: "Weekly",
    window_seconds: 7 * 24 * 3600,
    accounts: 4,
    accounts_with_data: 4,
    remaining_percent: 38.2,
    earliest_reset_at: iso(NOW + 2 * DAY),
    observed_at: iso(NOW - 10 * 60_000),
    ...overrides,
  };
}

const respond = (pools: PoolCapacityEntry[]) =>
  mocks.get.mockResolvedValue({ generated_at: iso(NOW), pools });

describe("PoolCapacityCard", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    // The card measures "now" from the moment the data arrived; pin only the clock's date.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("says in one sentence how much is left, when it resets and when it runs out", async () => {
    // 38.6 rounds up: the sentence and the bar's label say 39, not 38.
    respond([
      pool({
        remaining_percent: 38.6,
        burn_percent_per_hour: 0.9,
        projected_exhaustion_at: iso(NOW + 30 * HOUR),
      }),
    ]);
    render(<PoolCapacityCard />);

    const row = await screen.findByTestId("pool-capacity-row");
    expect(
      within(row).getByText("Codex pool has 39% left this week, earliest reset in 2 days"),
    ).toBeInTheDocument();
    expect(
      within(row).getByText(/^At the pace of the last 6 hours, it runs out (today|tomorrow) /),
    ).toBeInTheDocument();
    expect(row).toHaveAttribute("data-tone", "warning");
    // The bar is decoration: the sentence carries the information.
    expect(within(row).getByText("39%")).toBeInTheDocument();
  });

  test("does not promise anything when no pace could be estimated", async () => {
    respond([pool({ burn_percent_per_hour: undefined })]);
    render(<PoolCapacityCard />);
    const row = await screen.findByTestId("pool-capacity-row");
    expect(within(row).queryByText(/At the pace|At the recent pace/)).not.toBeInTheDocument();
  });

  test("a pace that lasts until the reset is said as much", async () => {
    respond([pool({ burn_percent_per_hour: 0.2 })]);
    render(<PoolCapacityCard />);
    expect(
      await screen.findByText("At the recent pace it won't run out before the reset"),
    ).toBeInTheDocument();
  });

  test("a pool of accounts that report no data says so instead of showing 0%", async () => {
    respond([
      pool({
        provider: "kiro",
        window_key: "monthly_credits",
        accounts_with_data: 0,
        remaining_percent: 0,
      }),
    ]);
    render(<PoolCapacityCard />);
    const row = await screen.findByTestId("pool-capacity-row");
    expect(
      within(row).getByText("No quota data yet for the Kiro pool in monthly credits"),
    ).toBeInTheDocument();
    expect(within(row).getByText("--")).toBeInTheDocument();
    expect(row).toHaveAttribute("data-tone", "unknown");
  });

  test("tells when only some accounts report data and when the data is old", async () => {
    respond([
      pool({
        accounts: 5,
        accounts_with_data: 4,
        observed_at: iso(NOW - 8 * HOUR),
      }),
    ]);
    render(<PoolCapacityCard />);
    const row = await screen.findByTestId("pool-capacity-row");
    expect(
      within(row).getByText("Average of the 4 of 5 accounts that report data"),
    ).toBeInTheDocument();
    expect(within(row).getByText("Oldest data is from 8 hours ago")).toBeInTheDocument();
  });

  test("names a window it does not know by the upstream's own label", async () => {
    respond([pool({ window_key: "daily_image_quota", window_label: "Daily Image Quota" })]);
    render(<PoolCapacityCard />);
    expect(await screen.findByText(/in Daily Image Quota, earliest reset/)).toBeInTheDocument();
  });

  test("shows the three tightest pools and the rest on request", async () => {
    respond(
      [50, 10, 40, 30, 20].map((remaining, index) =>
        pool({
          provider: "codex",
          window_key: `window_${index}`,
          window_label: `W${index}`,
          remaining_percent: remaining,
        }),
      ),
    );
    const user = userEvent.setup();
    render(<PoolCapacityCard />);

    await screen.findAllByTestId("pool-capacity-row");
    expect(screen.getAllByTestId("pool-capacity-row")).toHaveLength(3);
    expect(screen.getAllByTestId("pool-capacity-row").map((row) => row.textContent)).toEqual([
      expect.stringContaining("10% left"),
      expect.stringContaining("20% left"),
      expect.stringContaining("30% left"),
    ]);

    await user.click(screen.getByRole("button", { name: "Show all 5" }));
    expect(screen.getAllByTestId("pool-capacity-row")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(screen.getAllByTestId("pool-capacity-row")).toHaveLength(3);
  });

  test("takes no space at all when there is nothing to add up", async () => {
    respond([]);
    const { container } = render(<PoolCapacityCard />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByLabelText("Pool capacity")).not.toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
  });

  test("a first failure can be retried; a later failure keeps the numbers that are there", async () => {
    mocks.get.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    render(<PoolCapacityCard />);

    expect(await screen.findByText("Couldn't load pool capacity: boom")).toBeInTheDocument();

    respond([pool()]);
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByTestId("pool-capacity-row")).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't load/)).not.toBeInTheDocument();

    mocks.get.mockRejectedValueOnce(new Error("blip"));
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("Couldn't load pool capacity: blip")).toBeInTheDocument();
    expect(screen.getByTestId("pool-capacity-row")).toBeInTheDocument();
  });

  test("renders in Chinese the way the page words it", async () => {
    await i18n.changeLanguage("zh-CN");
    respond([pool({ provider: "claude", window_key: "seven_day", remaining_percent: 12.4 })]);
    render(<PoolCapacityCard />);
    const row = await screen.findByTestId("pool-capacity-row");
    expect(within(row).getByText("Claude 池本周剩 12%，最早 2 天后重置")).toBeInTheDocument();
  });
});
