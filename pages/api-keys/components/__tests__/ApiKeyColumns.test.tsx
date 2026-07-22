import type { TFunction } from "i18next";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import { createApiKeyColumns } from "../ApiKeyColumns";
import { GlobalIconButtonTooltip } from "@code-proxy/ui";

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
    "api_keys_page.reset_today_spending": "Reset today spending",
    "api_keys_page.reset_today_spending_disabled": "Set a daily spending limit before resetting",
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
    selectedKeys: new Set(),
    allRowsSelected: false,
    someRowsSelected: false,
    onSelectAll: vi.fn(),
    onSelectRow: vi.fn(),
    onCopy: vi.fn(),
    onRotate: vi.fn(),
    onDelete: vi.fn(),
    onEdit: vi.fn(),
    onImportToCcSwitch: vi.fn(),
    onToggleDisable: vi.fn(),
    onViewUsage: vi.fn(),
    onResetDailySpending: vi.fn(),
    onViewResetHistory: vi.fn(),
    ...overrides,
  });

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
    const actionsColumn = columns.find((column) => column.key === "actions");

    render(
      <>
        <GlobalIconButtonTooltip />
        <div>{actionsColumn?.render(row, 0)}</div>
      </>,
    );

    await userEvent.hover(screen.getByRole("button", { name: "View usage" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("View usage");
    expect(screen.getByRole("tooltip")).toHaveStyle({ left: "76px", top: "140px" });
  });

  test("keeps the API key column at the wider fixed width", () => {
    const columns = createColumns();
    const keyColumn = columns.find((column) => column.key === "key");

    expect(keyColumn?.width).toBe("w-[320px] min-w-[320px]");
  });

  test("truncates API key text inside an intact rounded badge", () => {
    const row: ApiKeyEntry = {
      key: "sk-abcdefghijklmnopqrstuvwxyz0123456789",
      name: "Test key",
      "created-at": "2026-04-28T00:00:00Z",
    };
    const columns = createColumns();
    const keyColumn = columns.find((column) => column.key === "key");
    const maskedKey = `sk-ab${"•".repeat(20)}789`;

    render(<div>{keyColumn?.render(row, 0)}</div>);

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
    const modelColumn = columns.find((column) => column.key === "allowedModels");

    render(<div>{modelColumn?.render(row, 0)}</div>);

    const modelText = screen.getByText("deepseek-v4-flash-ultra-long-model-name");
    const pill = modelText.parentElement;
    const tooltipTrigger = pill?.parentElement;

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(pill).not.toBeNull();
    expect(tooltipTrigger).not.toBeNull();
    if (!pill || !tooltipTrigger) return;

    expect(modelText).toHaveClass("min-w-0", "truncate");
    expect(pill).toHaveClass("flex", "min-w-0", "max-w-full", "rounded-full", "border");
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
    const spendingColumn = columns.find((column) => column.key === "spendingLimit");

    expect(spendingColumn?.label).toBe("Spending limit");

    render(
      <>
        <div>{spendingColumn?.headerRender?.()}</div>
        <div>{spendingColumn?.render(row, 0)}</div>
      </>,
    );

    expect(screen.getByText("$12.50")).toBeInTheDocument();

    await userEvent.hover(screen.getByText("Spending limit"));

    expect(screen.getByRole("tooltip")).toHaveTextContent("Maximum cumulative API key cost");
  });

  test("keeps selection, name, and actions as responsive fixed columns", () => {
    const columns = createColumns();
    const selectColumn = columns.find((column) => column.key === "select");
    const nameColumn = columns.find((column) => column.key === "name");
    const actionsColumn = columns.find((column) => column.key === "actions");

    expect(selectColumn?.lockOrder).toBe("start");
    expect(nameColumn?.lockOrder).toBe("start");
    expect(actionsColumn?.lockOrder).toBe("end");
    expect(selectColumn?.headerClassName).toContain("md:sticky");
    expect(selectColumn?.cellClassName).toContain("md:sticky");
    expect(nameColumn?.headerClassName).toContain("md:sticky");
    expect(nameColumn?.cellClassName).toContain("md:sticky");
    expect(actionsColumn?.headerClassName).toContain("md:sticky");
    expect(actionsColumn?.cellClassName).toContain("md:sticky");
    expect(actionsColumn?.width).toBe("w-40 min-w-40 max-w-40");
    expect(actionsColumn?.minWidthPx).toBe(160);
    expect(actionsColumn?.maxWidthPx).toBe(160);
    expect(actionsColumn?.resizable).toBe(false);
    expect(`${selectColumn?.headerClassName} ${selectColumn?.cellClassName}`).not.toMatch(
      /\bmd:(?:left|right)-/,
    );
    expect(`${nameColumn?.headerClassName} ${nameColumn?.cellClassName}`).not.toMatch(
      /\bmd:(?:left|right)-/,
    );
    expect(`${actionsColumn?.headerClassName} ${actionsColumn?.cellClassName}`).not.toMatch(
      /\bmd:(?:left|right)-/,
    );
    const fixedColumnClassNames = [
      selectColumn?.headerClassName,
      selectColumn?.cellClassName,
      nameColumn?.headerClassName,
      nameColumn?.cellClassName,
      actionsColumn?.headerClassName,
      actionsColumn?.cellClassName,
    ].join(" ");
    expect(fixedColumnClassNames).not.toMatch(/\bmd:border-[lr]\b/);
    expect(fixedColumnClassNames).not.toContain("md:border-slate-200");
    expect(fixedColumnClassNames).not.toContain("md:dark:border-neutral-800");
    expect(selectColumn?.headerClassName).not.toMatch(/(^|\s)sticky(\s|$)/);
    expect(nameColumn?.cellClassName).not.toMatch(/(^|\s)sticky(\s|$)/);
    expect(actionsColumn?.cellClassName).not.toMatch(/(^|\s)sticky(\s|$)/);
  });

  test("renders the status toggle inside the actions column", () => {
    const row: ApiKeyEntry = {
      key: "sk-test",
      name: "Test key",
      disabled: true,
      "created-at": "2026-04-28T00:00:00Z",
    };
    const columns = createColumns();
    const statusColumn = columns.find((column) => column.key === "status");
    const actionsColumn = columns.find((column) => column.key === "actions");

    expect(statusColumn).toBeUndefined();

    render(<div>{actionsColumn?.render(row, 0)}</div>);

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
    const keys = columns.map((column) => column.key);
    const actionsColumn = columns.find((column) => column.key === "actions");

    expect(keys).toEqual([
      "select",
      "name",
      "quota",
      "dailySpending",
      "lifetimeSpending",
      "dailySpendingResetCount",
      "key",
      "createdAt",
      "actions",
    ]);
    expect(actionsColumn?.width).toBe("w-40 min-w-40 max-w-40");

    render(<div>{actionsColumn?.render(row, 0)}</div>);

    expect(screen.queryByRole("button", { name: "View usage" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy key" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Reset today spending" }),
    ).toBeInTheDocument();
  });

  test("places quota and spending fact columns immediately after name", () => {
    const columns = createColumns();
    const keys = columns.map((column) => column.key);
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
    const quotaColumn = columns.find((column) => column.key === "quota");
    const dailyColumn = columns.find((column) => column.key === "dailySpending");
    const lifetimeColumn = columns.find((column) => column.key === "lifetimeSpending");
    const { container } = render(
      <div>
        <div>{quotaColumn?.render(limited, 0)}</div>
        <div>{dailyColumn?.render(limited, 0)}</div>
        <div>{lifetimeColumn?.render(limited, 0)}</div>
      </div>,
    );
    expect(container.textContent).toContain("$20 / $100");
    expect(container.textContent).toContain("$20.00");
    expect(container.textContent).toContain("$300.12");
  });

  test("disables reset today spending without a daily limit and calls handler when enabled", async () => {
    const onResetDailySpending = vi.fn();
    const limited: ApiKeyEntry = {
      key: "sk-limited",
      name: "Limited",
      "daily-spending-limit": 100,
      "daily-spending-used": 20,
    };
    const unlimited: ApiKeyEntry = {
      key: "sk-free",
      name: "Free",
    };
    const columns = createColumns({ onResetDailySpending });
    const actionsColumn = columns.find((column) => column.key === "actions");

    const { rerender } = render(<div>{actionsColumn?.render(unlimited, 0)}</div>);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Set a daily spending limit before resetting" }),
    ).toHaveAttribute("data-disabled");
    await userEvent.keyboard("{Escape}");

    rerender(<div>{actionsColumn?.render(limited, 1)}</div>);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const enabled = await screen.findByRole("menuitem", { name: "Reset today spending" });
    expect(enabled).not.toHaveAttribute("data-disabled");
    await userEvent.click(enabled);
    expect(onResetDailySpending).toHaveBeenCalledWith(1);
  });

  test("shows clickable reset count and opens history", async () => {
    const onViewResetHistory = vi.fn();
    const row: ApiKeyEntry = {
      key: "sk-hist",
      name: "Hist",
      "daily-spending-reset-count": 3,
    };
    const columns = createColumns({ onViewResetHistory });
    const countColumn = columns.find((column) => column.key === "dailySpendingResetCount");
    render(<div>{countColumn?.render(row, 0)}</div>);
    const button = screen.getByRole("button", { name: "View reset history" });
    expect(button).toHaveTextContent("3");
    await userEvent.click(button);
    expect(onViewResetHistory).toHaveBeenCalledWith(row);
  });
});
