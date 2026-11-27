import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { emptyQuotaMatrix, type EndUserAPIKey } from "@code-proxy/api-client";
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
    "api_keys_page.view_usage": "View usage",
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
  test("shows a skeleton instead of empty while first fetch is in flight", () => {
    render(<OwnedApiKeysTable t={t} keys={[]} loading actions={{}} />);
    // 首次加载是表格自己的骨架：同一个框，数据回来不跳
    expect(screen.getByRole("table", { name: "Owned keys" })).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("No API keys")).not.toBeInTheDocument();
  });

  test("shows empty state only after loading finishes with no keys", () => {
    render(<OwnedApiKeysTable t={t} keys={[]} loading={false} actions={{}} />);
    expect(screen.getByText("No API keys")).toBeInTheDocument();
    expect(screen.getByText("Create the first key.")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Owned keys" })).not.toHaveAttribute("aria-busy");
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
            "quota-limits": emptyQuotaMatrix(),
            "model-rules": [],
          },
        ]}
        actions={{}}
        fill
      />,
    );

    const wrap = container.querySelector(".sn-tbl-wrap");
    expect(wrap).toHaveAttribute("data-fill", "true");
    // 嵌在卡片和弹窗里：不再套一层外框（Satin 无外框态 .sn-plain）
    expect(wrap).toHaveClass("sn-plain");
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
      "quota-limits": emptyQuotaMatrix(),
      "model-rules": [],
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

    const resetCountColumn = columns.find((column) => column.id === "resetCount");
    expect(resetCountColumn).toBeDefined();

    const actionsColumn = columns.find((column) => column.id === "actions");
    render(
      <div>
        {resetCountColumn?.cell(row, { rowIndex: 0, selected: false, expanded: false })}
        {actionsColumn?.cell(row, { rowIndex: 0, selected: false, expanded: false })}
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
    expect(columns.find((column) => column.id === "key")?.overflowTooltip).toBe(false);
    expect(columns.find((column) => column.id === "actions")?.overflowTooltip).toBe(false);
    const actionsColumn = columns.find((column) => column.id === "actions");
    // 固定 160 设计像素、冻结在右侧、不能拖宽：四个图标按钮的位置
    expect(actionsColumn?.width).toBe(160);
    expect(actionsColumn?.minWidth).toBe(160);
    expect(actionsColumn?.maxWidth).toBe(160);
    expect(actionsColumn?.pin).toBe("end");
    expect(actionsColumn?.resizable).toBe(false);
  });

  test("keeps edit and two more actions inline and moves the rest, rotation included, into the more menu", async () => {
    const onEdit = vi.fn();
    const onRotate = vi.fn();
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
        onRotate,
        onEdit,
        onDelete: vi.fn(),
      },
    });
    const actionsColumn = columns.find((column) => column.id === "actions");

    render(<div>{actionsColumn?.cell(row, { rowIndex: 0, selected: false, expanded: false })}</div>);

    expect(screen.getAllByRole("button")).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Edit quota" }));
    expect(onEdit).toHaveBeenCalledWith(row);
    expect(screen.queryByRole("button", { name: "Rotate key" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Rotate key" }));
    expect(onRotate).toHaveBeenCalledWith(row);
  });
});

describe("injected columns for the access-policy view", () => {
  const row = {
    id: "key-2",
    tenant_id: "tenant-1",
    end_user_id: "user-1",
    key_masked: "sk-****abcd",
    name: "Policy key",
    disabled: false,
    is_default: false,
    "quota-limits": emptyQuotaMatrix(),
    "model-rules": [],
  } satisfies EndUserAPIKey;

  test("uses the page's quota renderer, extra columns and reset predicate", async () => {
    const onResetPeriodSpending = vi.fn();
    const onViewUsage = vi.fn();
    const onCopy = vi.fn();
    const columns = createOwnedApiKeyColumns({
      t,
      actions: { onViewUsage, onCopy, onResetPeriodSpending },
      renderQuota: () => <span>matrix-cell</span>,
      extraColumns: [{ id: "rules", header: "Rules", cell: () => "2 rules" }],
      copyOnDemand: true,
      canResetQuota: () => true,
    });
    expect(columns.map((column) => column.id)).toContain("rules");
    const quotaColumn = columns.find((column) => column.id === "quota");
    const actionsColumn = columns.find((column) => column.id === "actions");
    render(
      <div>
        {quotaColumn?.cell(row, { rowIndex: 0, selected: false, expanded: false })}
        {actionsColumn?.cell(row, { rowIndex: 0, selected: false, expanded: false })}
      </div>,
    );
    expect(screen.getByText("matrix-cell")).toBeInTheDocument();

    // 列表里没有明文时，按需取明文的复制也不能被禁用。
    const copy = screen.getByRole("button", { name: "Copy key" });
    expect(copy).toBeEnabled();
    await userEvent.click(copy);
    expect(onCopy).toHaveBeenCalledWith(row);

    await userEvent.click(screen.getByRole("button", { name: "View usage" }));
    expect(onViewUsage).toHaveBeenCalledWith(row);

    // 三个操作都放得下，重置也在行内；由页面判定可重置（不只看美元四周期）。
    const reset = screen.getByRole("button", { name: "Reset this Key quota" });
    expect(reset).toBeEnabled();
    await userEvent.click(reset);
    expect(onResetPeriodSpending).toHaveBeenCalledWith(row);
  });

  test("compact layout folds key and status into the name cell and drops the secondary columns", () => {
    const columns = createOwnedApiKeyColumns({
      t,
      actions: { onCopy: vi.fn() },
      renderQuota: () => <span>matrix-cell</span>,
      extraColumns: [{ id: "rules", header: "Rules", cell: () => "2 rules" }],
      quotaLabel: "Quota usage",
      compact: true,
    });
    // 弹窗里放得下：密钥、状态、当日、重置次数、创建时间不单列。
    expect(columns.map((column) => column.id)).toEqual(["name", "quota", "rules", "lifetimeSpending", "actions"]);
    expect(columns.find((column) => column.id === "quota")?.header).toBe("Quota usage");

    const nameColumn = columns.find((column) => column.id === "name");
    render(<div>{nameColumn?.cell({ ...row, disabled: true }, { rowIndex: 0, selected: false, expanded: false })}</div>);
    expect(screen.getByText("Policy key")).toBeInTheDocument();
    expect(screen.getByText("sk-****abcd")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  test("full layout keeps the key and status columns and the default quota header", () => {
    const columns = createOwnedApiKeyColumns({ t, actions: {} });
    expect(columns.map((column) => column.id)).toEqual([
      "name",
      "key",
      "status",
      "quota",
      "dailySpending",
      "lifetimeSpending",
      "resetCount",
      "created",
      "actions",
    ]);
    expect(columns.find((column) => column.id === "quota")?.header).toBe("Quota");
  });
});
