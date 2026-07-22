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
    "api_keys_page.reset_today_spending": "Reset today spending",
    "api_keys_page.view_reset_history": "View reset history",
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
        onResetDailySpending: vi.fn(),
        onViewResetHistory: vi.fn(),
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
