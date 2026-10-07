import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { IpAccessRule } from "@code-proxy/api-client";
import { ConfirmHost } from "@code-proxy/ui";
import { AccessRulesTab } from "../AccessRulesTab";

const rules = vi.fn();
const createRule = vi.fn();
const deleteRule = vi.fn();
const bulkUpdateRules = vi.fn();

vi.mock("@code-proxy/api-client", () => ({
  ipAccessApi: {
    rules: (...args: unknown[]) => rules(...args),
    createRule: (...args: unknown[]) => createRule(...args),
    deleteRule: (...args: unknown[]) => deleteRule(...args),
    updateRule: vi.fn(),
    bulkUpdateRules: (...args: unknown[]) => bulkUpdateRules(...args),
  },
}));

vi.mock("@app/providers/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: "en" },
  }),
}));

const notify = vi.fn();
vi.mock("@code-proxy/ui", async () => {
  const actual = await vi.importActual<typeof import("@code-proxy/ui")>("@code-proxy/ui");
  return { ...actual, useToast: () => ({ notify }) };
});

function ruleFixture(overrides: Partial<IpAccessRule> = {}): IpAccessRule {
  return {
    id: "r1",
    cidr: "203.0.113.66/32",
    family: 4,
    effect: "deny",
    source: "auto",
    reason: "repeated failures",
    note: "",
    enabled: true,
    expires_at: null,
    created_at: "2026-08-11T00:00:00Z",
    updated_at: "2026-08-11T00:00:00Z",
    hit_count: 3,
    last_hit_at: null,
    ...overrides,
  };
}

function renderTab(props: Partial<React.ComponentProps<typeof AccessRulesTab>> = {}) {
  return render(
    <AccessRulesTab
      pendingRule={null}
      onPendingRuleHandled={vi.fn()}
      onRulesChanged={vi.fn()}
      refreshToken={0}
      protectedEntries={[]}
      {...props}
    />,
  );
}

describe("AccessRulesTab", () => {
  beforeEach(() => {
    rules.mockReset();
    createRule.mockReset();
    deleteRule.mockReset();
    bulkUpdateRules.mockReset();
    notify.mockReset();
    rules.mockResolvedValue({ items: [ruleFixture()], total: 1, page: 1, size: 50 });
  });

  test("unban-and-allow deletes the ban and creates an allow rule for the same range", async () => {
    // Releasing a ban usually means it was wrong, and the next thing wanted is
    // for it not to recur — so one action has to do both halves.
    deleteRule.mockResolvedValue(undefined);
    createRule.mockResolvedValue({ rule: ruleFixture({ effect: "allow" }) });
    renderTab();

    const button = await screen.findByRole("button", { name: /unban_and_allow/ });
    await userEvent.click(button);

    await waitFor(() => expect(deleteRule).toHaveBeenCalledWith("r1"));
    expect(createRule).toHaveBeenCalledWith(
      expect.objectContaining({ cidr: "203.0.113.66/32", effect: "allow" }),
    );
  });

  test("allow rules do not offer unban", async () => {
    rules.mockResolvedValue({
      items: [ruleFixture({ id: "r2", effect: "allow", source: "manual" })],
      total: 1,
      page: 1,
      size: 50,
    });
    renderTab();
    await screen.findByText("203.0.113.66/32");
    expect(screen.queryByRole("button", { name: /unban_and_allow/ })).toBeNull();
  });

  test("bulk actions appear only once rows are selected and report partial failure", async () => {
    bulkUpdateRules.mockResolvedValue({ applied: ["r1"], failed: { r9: "not found" } });
    renderTab();
    await screen.findByText("203.0.113.66/32");

    // Nothing selected: no bulk affordance.
    expect(screen.queryByRole("button", { name: "ip_access.bulk_disable" })).toBeNull();

    await userEvent.click(await screen.findByRole("checkbox", { name: /select_rule/ }));
    await userEvent.click(await screen.findByRole("button", { name: "ip_access.bulk_disable" }));

    await waitFor(() =>
      expect(bulkUpdateRules).toHaveBeenCalledWith({ ids: ["r1"], enabled: false }),
    );
    // A partially applied batch must not be reported as success.
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: "warning", message: expect.stringContaining("bulk_partial") }),
      ),
    );
  });

  test("select-all covers every visible row", async () => {
    rules.mockResolvedValue({
      items: [ruleFixture(), ruleFixture({ id: "r2", cidr: "45.83.0.0/16" })],
      total: 2,
      page: 1,
      size: 50,
    });
    bulkUpdateRules.mockResolvedValue({ applied: ["r1", "r2"], failed: {} });
    renderTab();
    await screen.findByText("45.83.0.0/16");

    await userEvent.click(await screen.findByRole("checkbox", { name: "ip_access.select_all" }));
    await userEvent.click(await screen.findByRole("button", { name: "ip_access.bulk_enable" }));

    await waitFor(() =>
      expect(bulkUpdateRules).toHaveBeenCalledWith({ ids: ["r1", "r2"], enabled: true }),
    );
  });

  test("bulk delete asks first, lists the addresses, and explains deny and allow separately", async () => {
    rules.mockResolvedValue({
      items: [
        ruleFixture(),
        ruleFixture({ id: "r2", cidr: "45.83.0.0/16" }),
        ruleFixture({ id: "r3", cidr: "10.0.0.0/8", effect: "allow", source: "manual" }),
      ],
      total: 3,
      page: 1,
      size: 50,
    });
    bulkUpdateRules.mockResolvedValue({ applied: ["r1", "r2", "r3"], failed: {} });
    render(<ConfirmHost />);
    renderTab();
    await screen.findByText("10.0.0.0/8");

    await userEvent.click(await screen.findByRole("checkbox", { name: "ip_access.select_all" }));
    await userEvent.click(await screen.findByRole("button", { name: "ip_access.bulk_delete" }));
    let dialog = await screen.findByRole("dialog", {
      name: 'ip_access.bulk_delete_title:{"count":3}',
    });
    // 选中了却还没删：先把要删的地址和后果摆出来。
    expect(bulkUpdateRules).not.toHaveBeenCalled();
    expect(within(dialog).getByText("45.83.0.0/16")).toBeInTheDocument();
    expect(within(dialog).getByText("10.0.0.0/8")).toBeInTheDocument();
    expect(
      within(dialog).getByText('ip_access.bulk_delete_consequence_deny:{"count":2}'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('ip_access.bulk_delete_consequence_allow:{"count":1}'),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "common.cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bulkUpdateRules).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "ip_access.bulk_delete" }));
    dialog = await screen.findByRole("dialog", { name: 'ip_access.bulk_delete_title:{"count":3}' });
    await userEvent.click(within(dialog).getByRole("button", { name: "ip_access.bulk_delete" }));
    await waitFor(() =>
      expect(bulkUpdateRules).toHaveBeenCalledWith({ ids: ["r1", "r2", "r3"], delete: true }),
    );
  });

  test("names the rule being deleted and what changes for that address", async () => {
    deleteRule.mockResolvedValue(undefined);
    renderTab();

    await userEvent.click(await screen.findByRole("button", { name: "ip_access.delete_rule" }));
    const dialog = await screen.findByRole("dialog", {
      name: 'ip_access.delete_rule_title:{"cidr":"203.0.113.66/32"}',
    });
    expect(within(dialog).getByText("203.0.113.66/32")).toBeInTheDocument();
    expect(within(dialog).getByText("ip_access.delete_rule_consequence_default")).toBeInTheDocument();
    // 删掉的是拒绝规则：说明该地址之后不再被它拒绝。
    expect(within(dialog).getByText("ip_access.delete_rule_consequence_deny")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "ip_access.delete_rule" }));
    await waitFor(() => expect(deleteRule).toHaveBeenCalledWith("r1"));
  });

  test("protected addresses are listed so a refused ban is explainable", async () => {
    renderTab({
      protectedEntries: [
        { cidr: "104.194.69.137/32", reason: "trusted_proxy" },
        { cidr: "10.0.0.5/32", reason: "local_address" },
      ],
    });
    expect(await screen.findByText("104.194.69.137/32")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.5/32")).toBeInTheDocument();
  });
});
