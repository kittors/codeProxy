import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EndUserAPIKey } from "@code-proxy/api-client";
import { describe, expect, test, vi } from "vitest";
import { createOwnedApiKeyColumns, OwnedApiKeysTable } from "../OwnedApiKeyTable";

const t = (key: string) => {
  const labels: Record<string, string> = {
    "api_keys_page.col_name": "Name",
    "api_keys_page.col_key": "Key",
    "api_keys_page.col_status": "Status",
    "api_keys_page.col_created": "Created",
    "api_keys_page.col_actions": "Actions",
    "api_keys_page.no_keys": "No API keys",
    "api_keys_page.no_keys_desc": "Create the first key.",
    "api_keys_page.no_api_keys": "No keys",
    "api_keys_page.table_caption": "Owned keys",
    "api_keys_page.unnamed": "Unnamed",
    "api_keys_page.click_disable": "Disable key",
    "api_keys_page.copy_key": "Copy key",
    "api_keys_page.edit_key_quota": "Edit quota",
    "api_keys_page.reset_period_spending": "Reset this Key quota",
    "api_keys_page.reset_period_spending_disabled": "No resettable period quota; edit Key quota",
    "api_keys_page.view_reset_history": "View this key reset history",
    "end_users.rotate_key": "Rotate key",
    "common.delete": "Delete",
    "common.enabled": "Enabled",
    "common.disabled": "Disabled",
    "common.loading_ellipsis": "Loading…",
    "common.more_actions": "More actions",
    "quota.period_spending_column": "Quota",
    "quota.daily_spending_column": "Today",
    "quota.lifetime_spending_column": "Lifetime",
    "quota.total_resets": "Resets",
    "quota.unlimited": "Unlimited",
  };
  return labels[key] ?? key;
};

describe("OwnedApiKeysTable", () => {
  test("shows loading state instead of empty while first fetch is in flight", () => {
    render(<OwnedApiKeysTable t={t} keys={[]} loading actions={{}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.queryByText("No API keys")).not.toBeInTheDocument();
  });

  test("shows empty state only after loading finishes with no keys", () => {
    render(<OwnedApiKeysTable t={t} keys={[]} loading={false} actions={{}} />);
    expect(screen.getByText("No API keys")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("allows a parent viewport to make the table fill its available height", () => {
    const { container } = render(
      <OwnedApiKeysTable
        t={t}
        keys={[
          {
            id: "key-1",
            tenant_id: "tenant-1",
            end_user_id: "user-1",
            name: "Primary",
            key_masked: "sk-****",
            disabled: false,
            is_default: true,
          },
        ]}
        actions={{}}
        height="h-full"
        minHeight="min-h-full"
      />,
    );

    expect(container.firstElementChild).toHaveClass("h-full", "min-h-full");
  });
  test("exposes period reset and reset history for an owned week-only key", async () => {
    const row = {
      id: "key-week-only",
      tenant_id: "tenant-1",
      end_user_id: "user-1",
      key: "sk-owned",
      name: "Week-only key",
      disabled: false,
      is_default: false,
      "period-spending-limits": { "5h": 0, day: 0, week: 300, month: 0 },
      "daily-spending-reset-count": 2,
    } satisfies EndUserAPIKey;
    const onResetPeriodSpending = vi.fn();
    const onViewResetHistory = vi.fn();
    const columns = createOwnedApiKeyColumns({
      t,
      actions: {
        onToggleDisabled: vi.fn(),
        onCopy: vi.fn(),
        onRotate: vi.fn(),
        onEdit: vi.fn(),
        onResetPeriodSpending,
        onViewResetHistory,
        onDelete: vi.fn(),
      },
    });

    const resetCountColumn = columns.find((column) => column.key === "resetCount");
    expect(resetCountColumn).toBeDefined();

    const actionsColumn = columns.find((column) => column.key === "actions");
    render(
      <div>
        {resetCountColumn?.render(row, 0)}
        {actionsColumn?.render(row, 0)}
      </div>,
    );

    await userEvent.click(screen.getByRole("button", { name: "View this key reset history" }));
    expect(onViewResetHistory).toHaveBeenCalledWith(row);

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const resetAction = screen.getByRole("menuitem", { name: "Reset this Key quota" });
    expect(resetAction).not.toHaveAttribute("data-disabled");
    await userEvent.click(resetAction);
    expect(onResetPeriodSpending).toHaveBeenCalledWith(row);
  });
});

describe("createOwnedApiKeyColumns", () => {
  test("disables overflow tooltip on secret and actions columns", () => {
    const columns = createOwnedApiKeyColumns({ t, actions: {} });
    expect(columns.find((column) => column.key === "key")?.overflowTooltip).toBe(false);
    expect(columns.find((column) => column.key === "actions")?.overflowTooltip).toBe(false);
    expect(columns.find((column) => column.key === "actions")?.width).toBe(
      "w-40 min-w-40 max-w-40",
    );
    expect(columns.find((column) => column.key === "actions")?.minWidthPx).toBe(160);
    expect(columns.find((column) => column.key === "actions")?.maxWidthPx).toBe(160);
  });

  test("keeps three actions inline and moves the remaining actions into the more menu", async () => {
    const onEdit = vi.fn();
    const row = {
      id: "key-1",
      key: "sk-owned",
      name: "Owned key",
      disabled: false,
    } as EndUserAPIKey;
    const columns = createOwnedApiKeyColumns({
      t,
      actions: {
        onToggleDisabled: vi.fn(),
        onCopy: vi.fn(),
        onRotate: vi.fn(),
        onEdit,
        onDelete: vi.fn(),
      },
    });
    const actionsColumn = columns.find((column) => column.key === "actions");

    render(<div>{actionsColumn?.render(row, 0)}</div>);

    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Edit quota" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit quota" }));
    expect(onEdit).toHaveBeenCalledWith(row);
  });
});
