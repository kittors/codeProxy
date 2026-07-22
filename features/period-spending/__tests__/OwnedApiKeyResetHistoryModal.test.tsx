import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { OwnedApiKeyResetHistoryModal } from "../OwnedApiKeyResetHistoryModal";

const t = (key: string, options?: Record<string, unknown>) => {
  const labels: Record<string, string> = {
    "api_keys_page.reset_history_title": `Reset history · ${String(options?.name ?? "")}`,
    "api_keys_page.reset_history_desc": `History for ${String(options?.key ?? "")}`,
    "api_keys_page.reset_history_col_time": "Reset time",
    "api_keys_page.reset_history_col_day": "Project day",
    "api_keys_page.reset_history_col_actor": "Operator",
    "api_keys_page.reset_history_col_cleared": "Cleared amount",
    "api_keys_page.reset_history_col_raw_today": "True day spend",
    "api_keys_page.reset_history_col_baseline": "Stored baseline",
    "api_keys_page.reset_history_actor_service": "Management key",
    "api_keys_page.reset_history_actor_unknown": "Unknown",
    "api_keys_page.reset_history_empty": "No reset history",
  };
  return labels[key] ?? key;
};

describe("OwnedApiKeyResetHistoryModal", () => {
  test("shows the project day and stored baseline required for reset evidence", () => {
    render(
      <OwnedApiKeyResetHistoryModal
        t={t}
        open
        onClose={vi.fn()}
        keyName="Primary"
        maskedKey="sk-***-1"
        loading={false}
        events={[
          {
            id: 7,
            day_key: "2026-07-21",
            reset_at: "2026-07-21T11:00:00Z",
            actor_username: "admin",
            cost_baseline: 148.25,
            effective_used_before: 28.25,
            raw_today_cost: 148.25,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Project day" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Stored baseline" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2026-07-21")).toBeInTheDocument();
    expect(screen.getAllByText("$148.25")).toHaveLength(2);
  });
});
