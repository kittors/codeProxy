import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { SpendingResetHistoryModal } from "../SpendingResetHistoryModal";

const events = [
  {
    id: 7,
    day_key: "2026-07-20",
    reset_at: "2026-07-20T11:00:00Z",
    actor_username: "admin",
    cost_baseline: 92.25,
    effective_used_before: 12.5,
    raw_today_cost: 92.25,
  },
  {
    id: 8,
    day_key: "2026-07-21",
    reset_at: "2026-07-21T11:00:00Z",
    actor_kind: "service_credential",
    effective_used_before: 28.25,
  },
];

describe("SpendingResetHistoryModal", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("lists key resets newest first and never invents a $0.00 snapshot", () => {
    render(
      <SpendingResetHistoryModal
        open
        onClose={vi.fn()}
        namespace="api_keys_page"
        title="Reset history · Primary"
        loading={false}
        events={events}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Reset history · Primary" });
    expect(within(dialog).getByRole("columnheader", { name: "Project day" })).toBeInTheDocument();
    expect(within(dialog).getByRole("columnheader", { name: "Stored baseline" })).toBeInTheDocument();
    // Key 版没有「重置 ID」列。
    expect(within(dialog).queryByRole("columnheader", { name: "Reset ID" })).toBeNull();

    const newer = within(dialog).getByText("2026-07-21");
    const older = within(dialog).getByText("2026-07-20");
    expect(newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 旧记录缺快照：显示「—」，不是 $0.00。
    expect(within(dialog).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(within(dialog).queryByText("$0.00")).toBeNull();
    expect(within(dialog).getAllByText("$92.25")).toHaveLength(2);
    expect(within(dialog).getByText("Management key")).toBeInTheDocument();
  });

  test("account history adds the reset id column and the summary block", () => {
    render(
      <SpendingResetHistoryModal
        open
        onClose={vi.fn()}
        namespace="end_users"
        title="Reset history · Bob"
        loading={false}
        events={events}
        showEventId
        summary={<div>summary-block</div>}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Reset history · Bob" });
    expect(within(dialog).getByRole("columnheader", { name: "Reset ID" })).toBeInTheDocument();
    expect(
      within(dialog).getByRole("columnheader", { name: "Usage before reset" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("summary-block")).toBeInTheDocument();
  });
});
