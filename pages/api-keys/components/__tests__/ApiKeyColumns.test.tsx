import type { TFunction } from "i18next";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import { createApiKeyColumns } from "../ApiKeyColumns";
import { GlobalIconButtonTooltip } from "@code-proxy/ui";

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

  test("renders key and unrestricted permission cells with bounded truncation", () => {
    const row: ApiKeyEntry = {
      key: "sk-team-a-abcdefghijklmnopqrstuvwxyz1234567890",
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
    const keyColumn = columns.find((column) => column.key === "key");
    const modelsColumn = columns.find((column) => column.key === "allowedModels");

    const { container } = render(
      <div>
        <div data-testid="key-cell">{keyColumn?.render(row, 0)}</div>
        <div data-testid="models-cell">{modelsColumn?.render(row, 0)}</div>
      </div>,
    );

    const code = container.querySelector("code");
    expect(code).toHaveClass("max-w-full");
    expect(code).toHaveClass("truncate");
    expect(screen.getByText("api_keys_page.all_models")).toHaveClass("truncate");
  });

  test("keeps restricted permission summaries bounded inside the cell", () => {
    const row: ApiKeyEntry = {
      key: "sk-team-a-abcdefghijklmnopqrstuvwxyz1234567890",
      name: "Test key",
      "created-at": "2026-04-28T00:00:00Z",
      "allowed-models": ["deepseek-r1-ultra-long-name", "gpt-5.3-codex"],
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
    const modelsColumn = columns.find((column) => column.key === "allowedModels");

    const { container } = render(<div>{modelsColumn?.render(row, 0)}</div>);
    const trigger = container.querySelector("[data-tooltip-managed='true']");
    const summary = container.querySelector("span.flex.max-w-full.overflow-hidden");

    expect(trigger).toHaveClass("!flex");
    expect(trigger).toHaveClass("max-w-full");
    expect(trigger).toHaveClass("overflow-hidden");
    expect(summary).toHaveClass("flex");
    expect(summary).toHaveClass("min-w-0");
    expect(screen.getByText("deepseek-r1-ultra-long-name")).toHaveClass("truncate");
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
