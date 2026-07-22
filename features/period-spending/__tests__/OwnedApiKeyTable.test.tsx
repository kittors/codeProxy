import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
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
    "common.enabled": "Enabled",
    "common.disabled": "Disabled",
    "common.loading_ellipsis": "Loading…",
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
    expect(columns.find((column) => column.key === "actions")?.minWidthPx).toBe(304);
  });
});
