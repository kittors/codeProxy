import type { TFunction } from "i18next";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ApiKeyEntry } from "@/lib/http/apis/api-keys";
import { createApiKeyColumns } from "@/modules/api-keys/components/ApiKeyColumns";
import { GlobalIconButtonTooltip } from "@/modules/ui/Tooltip";

const t = ((key: string) => {
  const labels: Record<string, string> = {
    "api_keys_page.col_actions": "Actions",
    "api_keys_page.col_spending_limit": "Spending limit",
    "api_keys_page.spending_limit_help":
      "Maximum cumulative API key cost in USD. Empty means unlimited.",
    "api_keys_page.unlimited": "Unlimited",
    "api_keys_page.view_usage": "View usage",
    "api_keys_page.copy_key": "Copy key",
    "ccswitch.import_to_ccswitch": "Import to CC Switch",
    "common.edit": "Edit",
    "common.delete": "Delete",
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
    const columns = createApiKeyColumns({
      t,
      onCopy: vi.fn(),
      onDelete: vi.fn(),
      onEdit: vi.fn(),
      onImportToCcSwitch: vi.fn(),
      onToggleDisable: vi.fn(),
      onViewUsage: vi.fn(),
    });
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
    const columns = createApiKeyColumns({
      t,
      onCopy: vi.fn(),
      onDelete: vi.fn(),
      onEdit: vi.fn(),
      onImportToCcSwitch: vi.fn(),
      onToggleDisable: vi.fn(),
      onViewUsage: vi.fn(),
    });
    const keyColumn = columns.find((column) => column.key === "key");

    expect(keyColumn?.width).toBe("w-[320px] min-w-[320px]");
  });

  test("shows API key spending limits as a dedicated cost column", async () => {
    const row: ApiKeyEntry = {
      key: "sk-test",
      name: "Test key",
      "spending-limit": 12.5,
      "created-at": "2026-04-28T00:00:00Z",
    };
    const columns = createApiKeyColumns({
      t,
      onCopy: vi.fn(),
      onDelete: vi.fn(),
      onEdit: vi.fn(),
      onImportToCcSwitch: vi.fn(),
      onToggleDisable: vi.fn(),
      onViewUsage: vi.fn(),
    });
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
});
