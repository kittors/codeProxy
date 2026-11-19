import type { TFunction } from "i18next";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import { createApiKeyColumns } from "../ApiKeyColumns";
import { GlobalIconButtonTooltip, type DataGridColumn } from "@code-proxy/ui";

const t = ((key: string, options?: Record<string, string>) => {
  const labels: Record<string, string> = {
    "api_keys_page.col_actions": "Actions",
    "api_keys_page.col_spending_limit": "Spending limit",
    "api_keys_page.spending_limit_help":
      "Maximum cumulative API key cost in USD. Empty means unlimited.",
    "api_keys_page.col_daily_spending": "Daily spending",
    "api_keys_page.daily_spending_help": "Used / limit",
    "api_keys_page.col_reset_count": "Reset count",
    "api_keys_page.reset_count_help": "Click to open history",
    "api_keys_page.view_reset_history": "View reset history",
    "api_keys_page.reset_period_spending": "Reset this Key quota",
    "api_keys_page.reset_period_spending_disabled": "No resettable period quota; edit Key quota",
    "api_keys_page.unlimited": "Unlimited",
    "api_keys_page.view_usage": "View usage",
    "api_keys_page.copy_key": "Copy key",
    "api_keys_page.click_enable": "Click to enable",
    "api_keys_page.click_disable": "Click to disable",
    "api_keys_page.select_all_keys": "Select all API keys",
    "api_keys_page.select_key": `Select ${options?.name ?? ""}`.trim(),
    "ccswitch.import_to_ccswitch": "Import to CC Switch",
    "common.edit": "Edit",
    "common.delete": "Delete",
    "common.more_actions": "More actions",
  };
  return labels[key] ?? key;
}) as TFunction;

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
};

const setTooltipSize = (width: number, height: number) => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: width });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: height,
  });
};

const createColumns = (overrides: Partial<Parameters<typeof createApiKeyColumns>[0]> = {}) =>
  createApiKeyColumns({
    t,
    onCopy: vi.fn(),
    onRotate: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    onImportToCcSwitch: vi.fn(),
    onToggleDisable: vi.fn(),
    onViewUsage: vi.fn(),
    onResetPeriodSpending: vi.fn(),
    onViewResetHistory: vi.fn(),
    ...overrides,
  });

const cellOf = (
  column: DataGridColumn<ApiKeyEntry> | undefined,
  row: ApiKeyEntry,
  rowIndex = 0,
) => column?.cell(row, { rowIndex, selected: false, expanded: false });

describe("ApiKeyColumns", () => {
  beforeEach(() => {
    setViewport(800, 600);
    setTooltipSize(80, 24);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 132,
      height: 32,
      left: 100,
      right: 132,
      top: 100,
      width: 32,
      x: 100,
      y: 100,
      toJSON: () => undefined,
    } as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shows action icon tooltips below each button", async () => {
    const row: ApiKeyEntry = {
      key: "sk-test",
      name: "Test key",
      "created-at": "2026-04-28T00:00:00Z",
    };
    const columns = createColumns();
    const actionsColumn = columns.find((column) => column.id === "actions");

    render(
      <>
        <GlobalIconButtonTooltip />
        <div>{cellOf(actionsColumn, row)}</div>
      </>,
    );

    await userEvent.hover(screen.getByRole("button", { name: "View usage" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("View usage");
    expect(screen.getByRole("tooltip")).toHaveStyle({ left: "76px", top: "140px" });
  });

  test("keeps the API key column at the wider fixed width", () => {
    const columns = createColumns();
    const keyColumn = columns.find((column) => column.id === "key");

    // 设计像素：掩码后的 Key 放得下，再长的在徽标里截断、悬停看全文。
    expect(keyColumn?.width).toBe(256);
  });

  test("truncates API key text inside an intact rounded badge", () => {
    const row: ApiKeyEntry = {
      key: "sk-abcdefghijklmnopqrstuvwxyz0123456789",
      name: "Test key",
      "created-at": "2026-04-28T00:00:00Z",
    };
    const columns = createColumns();
    const keyColumn = columns.find((column) => column.id === "key");
    const maskedKey = `sk-ab${"•".repeat(20)}789`;

    render(<div>{cellOf(keyColumn, row)}</div>);

    const text = screen.getByText(maskedKey);
    const badge = text.closest("code");
    const tooltipTrigger = badge?.parentElement;

    expect(badge).not.toBeNull();
    expect(tooltipTrigger).not.toBeNull();
    if (!badge || !tooltipTrigger) return;

    expect(text).toHaveClass("truncate");
    expect(badge).toHaveClass("inline-flex", "max-w-full", "rounded-md");
    expect(tooltipTrigger).toHaveAttribute("data-tooltip-managed", "true");
    expect(tooltipTrigger).toHaveClass("block", "max-w-full");
  });

  test("truncates limited model summaries inside an intact rounded pill", () => {
    const row: ApiKeyEntry = {
      key: "sk-test",
      name: "Test key",
      "allowed-models": [
        "deepseek-v4-flash-ultra-long-model-name",
        "deepseek-v4-pro",
        "kimi-k2.5",
        "kimi-k2.6",
      ],
      "created-at": "2026-04-28T00:00:00Z",
    };
    const columns = createColumns();
    const modelColumn = columns.find((column) => column.id === "allowedModels");

    render(<div>{cellOf(modelColumn, row)}</div>);

    const modelText = screen.getByText("deepseek-v4-flash-ultra-long-model-name");
    const pill = modelText.parentElement;
    const tooltipTrigger = pill?.parentElement;

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(pill).not.toBeNull();
    expect(tooltipTrigger).not.toBeNull();
    if (!pill || !tooltipTrigger) return;

    expect(modelText).toHaveClass("min-w-0", "truncate");
    // 胶囊仍是完整的圆角胶囊（截断发生在里面的文字上），但它是中性淡底标签，不再描边。
    expect(pill).toHaveClass("flex", "min-w-0", "max-w-full", "rounded-full");
    expect(pill?.className).not.toMatch(/(^|\s)border(-|\s|$)/);
    expect(tooltipTrigger).toHaveAttribute("data-tooltip-managed", "true");
    expect(tooltipTrigger).toHaveClass("!flex", "min-w-0", "max-w-full");
  });

  test("shows API key spending limits as a dedicated cost column", async () => {
    const row: ApiKeyEntry = {
      key: "sk-test",
      name: "Test key",
      "spending-limit": 12.5,
      "created-at": "2026-04-28T00:00:00Z",
    };
    const columns = createColumns();
    const spendingColumn = columns.find((column) => column.id === "spendingLimit");

    expect(spendingColumn?.header).toBe("Spending limit");
    // 口径说明挂在表头文字上（点状下划线，悬停显示），不再单独放 ⓘ 图标。
    expect(spendingColumn?.headerHint).toBe(
      "Maximum cumulative API key cost in USD. Empty means unlimited.",
    );

    render(<div>{cellOf(spendingColumn, row)}</div>);

    expect(screen.getByText("$12.50")).toBeInTheDocument();
  });

  test("pins the name to the start and the actions to the end; selection is the grid's own", () => {
    const columns = createColumns();
    const nameColumn = columns.find((column) => column.id === "name");
    const actionsColumn = columns.find((column) => column.id === "actions");

    // 勾选列由 DataGrid 的 selectable 画，不在列定义里。
    expect(columns.find((column) => column.id === "select")).toBeUndefined();
    expect(nameColumn?.pin).toBe("start");
    expect(actionsColumn?.pin).toBe("end");
    expect(actionsColumn?.width).toBe(160);
    expect(actionsColumn?.minWidth).toBe(160);
    expect(actionsColumn?.maxWidth).toBe(160);
    expect(actionsColumn?.resizable).toBe(false);
    expect(actionsColumn?.hideable).toBe(false);
  });

  test("renders the status toggle inside the actions column", () => {
    const row: ApiKeyEntry = {
      key: "sk-test",
      name: "Test key",
      disabled: true,
      "created-at": "2026-04-28T00:00:00Z",
    };
    const columns = createColumns();
    const statusColumn = columns.find((column) => column.id === "status");
    const actionsColumn = columns.find((column) => column.id === "actions");

    expect(statusColumn).toBeUndefined();

    render(<div>{cellOf(actionsColumn, row)}</div>);

    expect(screen.getByRole("button", { name: "Click to enable" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("account-scoped columns keep key quota and spending facts", async () => {
    const row: ApiKeyEntry = {
      key: "sk-owned",
      name: "Owned",
      "daily-spending-limit": 10,
      "created-at": "2026-04-28T00:00:00Z",
    };
    const columns = createColumns({ accountScoped: true });
    const keys = columns.map((column) => column.id);
    const actionsColumn = columns.find((column) => column.id === "actions");

    expect(keys).toEqual([
      "name",
      "quota",
      "dailySpending",
      "lifetimeSpending",
      "dailySpendingResetCount",
      "key",
      "createdAt",
      "actions",
    ]);
    expect(actionsColumn?.width).toBe(160);

    render(<div>{cellOf(actionsColumn, row)}</div>);

    expect(screen.queryByRole("button", { name: "View usage" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy key" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Reset this Key quota" }),
    ).toBeInTheDocument();
  });

  test("places quota and spending fact columns immediately after name", () => {
    const columns = createColumns();
    const keys = columns.map((column) => column.id);
    const nameIndex = keys.indexOf("name");
    expect(keys[nameIndex + 1]).toBe("quota");
    expect(keys[nameIndex + 2]).toBe("dailySpending");
    expect(keys[nameIndex + 3]).toBe("lifetimeSpending");
    expect(keys[nameIndex + 4]).toBe("dailySpendingResetCount");
  });

  test("renders quota separately from daily spending facts", () => {
    const limited: ApiKeyEntry = {
      key: "sk-limited",
      name: "Limited",
      "daily-spending-limit": 100,
      "period-spending-limits": { "5h": 0, day: 100, week: 0, month: 0 },
      "period-spending": [{ period: "day", limit: 100, used: 20, remaining: 80 }],
      "daily-spending-used": 20,
      "lifetime-spending-used": 300.12,
    };
    const columns = createColumns();
    const quotaColumn = columns.find((column) => column.id === "quota");
    const dailyColumn = columns.find((column) => column.id === "dailySpending");
    const lifetimeColumn = columns.find((column) => column.id === "lifetimeSpending");
    const { container } = render(
      <div>
        <div>{cellOf(quotaColumn, limited)}</div>
        <div>{cellOf(dailyColumn, limited)}</div>
        <div>{cellOf(lifetimeColumn, limited)}</div>
      </div>,
    );
    expect(container.textContent).toContain("$20 / $100");
    expect(container.textContent).toContain("$20.00");
    expect(container.textContent).toContain("$300.12");
  });

  test("enables reset for any configured period and disables it when all periods are unlimited", async () => {
    const onResetPeriodSpending = vi.fn();
    const limited: ApiKeyEntry = {
      key: "sk-limited",
      name: "Limited",
      "period-spending-limits": { "5h": 0, day: 0, week: 300, month: 0 },
    };
    const unlimited: ApiKeyEntry = {
      key: "sk-free",
      name: "Free",
    };
    const columns = createColumns({ onResetPeriodSpending });
    const actionsColumn = columns.find((column) => column.id === "actions");

    const { rerender } = render(<div>{cellOf(actionsColumn, unlimited)}</div>);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      screen.getByRole("menuitem", { name: "No resettable period quota; edit Key quota" }),
    ).toHaveAttribute("data-disabled");
    await userEvent.keyboard("{Escape}");

    rerender(<div>{cellOf(actionsColumn, limited, 1)}</div>);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const enabled = await screen.findByRole("menuitem", { name: "Reset this Key quota" });
    expect(enabled).not.toHaveAttribute("data-disabled");
    await userEvent.click(enabled);
    expect(onResetPeriodSpending).toHaveBeenCalledWith(1);
  });

  test("shows clickable reset count and opens history", async () => {
    const onViewResetHistory = vi.fn();
    const row: ApiKeyEntry = {
      key: "sk-hist",
      name: "Hist",
      "daily-spending-reset-count": 3,
    };
    const columns = createColumns({ onViewResetHistory });
    const countColumn = columns.find((column) => column.id === "dailySpendingResetCount");
    render(<div>{cellOf(countColumn, row)}</div>);
    const button = screen.getByRole("button", { name: "View reset history" });
    expect(button).toHaveTextContent("3");
    await userEvent.click(button);
    expect(onViewResetHistory).toHaveBeenCalledWith(row);
  });
});
