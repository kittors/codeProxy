import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";
import { ApiKeyUsagePage } from "../ApiKeyUsagePage";

const mocks = vi.hoisted(() => ({
  fetchPublicLogs: vi.fn(),
  fetchPublicUsageSummary: vi.fn(),
  apiKeyBillingApi: {
    overview: vi.fn(),
    createOrder: vi.fn(),
    listOrders: vi.fn(),
    getOrder: vi.fn(),
  },
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  apiKeyBillingApi: mocks.apiKeyBillingApi,
}));

vi.mock("../../api-key-lookup/api", () => ({
  fetchPublicLogs: mocks.fetchPublicLogs,
  fetchPublicUsageSummary: mocks.fetchPublicUsageSummary,
}));

vi.mock("../../api-key-lookup/components/QuickImportTabContent", () => ({
  QuickImportTabContent: ({ apiKey }: { apiKey: string }) => (
    <div data-testid="quick-import-stub">quick-import:{apiKey}</div>
  ),
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ApiKeyUsagePage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("ApiKeyUsagePage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
    window.history.replaceState({}, "", "/manage/apikey-usage");
    window.localStorage.clear();
    mocks.fetchPublicLogs.mockReset();
    mocks.fetchPublicUsageSummary.mockReset();
    mocks.apiKeyBillingApi.overview.mockReset();
    mocks.apiKeyBillingApi.createOrder.mockReset();
    mocks.apiKeyBillingApi.listOrders.mockReset();
    mocks.apiKeyBillingApi.getOrder.mockReset();
    mocks.apiKeyBillingApi.overview.mockRejectedValue(new Error("not enabled"));
    mocks.fetchPublicLogs.mockResolvedValue({
      items: [
        {
          id: 1,
          timestamp: "2026-07-22T01:00:00Z",
          model: "gpt-test",
          failed: false,
          latency_ms: 100,
          input_tokens: 1,
          output_tokens: 2,
          cached_tokens: 0,
          total_tokens: 3,
          cost: 0,
          has_content: false,
        },
      ],
      total: 1,
      page: 1,
      size: 50,
      api_key_name: "张军宝",
      stats: { total: 1, success_rate: 100, total_tokens: 3, total_cost: 0 },
      filters: {
        api_key_ids: [],
        api_key_id_names: {},
        api_key_id_counts: {},
        models: ["gpt-test"],
        channels: [],
        statuses: ["success", "failed"],
      },
    });
    mocks.fetchPublicUsageSummary.mockResolvedValue({
      found: true,
      range: "today",
      stats: { total_calls: 1, quota_cost: 0.12 },
      limits: {
        "daily-spending-limit": 10,
        "daily-spending-used": 1.25,
      },
      "quota-scopes": [],
    });
  });

  test("opens a key modal, stores the key in localStorage, and supports logout", async () => {
    renderPage();

    expect(screen.getByTestId("apikey-usage-header")).toHaveTextContent("API 密钥用量查询");
    expect(screen.getByTestId("apikey-usage-empty")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/输入 API 密钥|Enter API Key/i)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/输入 API 密钥|Enter API Key/i), "sk-demo");
    await userEvent.click(screen.getByTestId("apikey-usage-submit"));

    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenCalled();
    });
    expect(mocks.fetchPublicLogs.mock.calls[0][0]).toMatchObject({
      apiKey: "sk-demo",
      page: 1,
    });
    expect(await screen.findByText("请求日志")).toBeInTheDocument();
    expect(screen.getByText("快捷导入")).toBeInTheDocument();
    expect(screen.getByText("张军宝")).toBeInTheDocument();
    expect(screen.queryByText("使用统计")).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /KEY 名称|Key name/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.fetchPublicUsageSummary).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "sk-demo" }),
      );
    });
    expect(await screen.findByTestId("apikey-lookup-logs-quota")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("apiKeyUsage.lastApiKey.v1") || "{}")).toEqual({
      apiKey: "sk-demo",
      name: "张军宝",
    });

    await userEvent.click(screen.getByTestId("apikey-usage-key-menu"));
    await userEvent.click(await screen.findByTestId("apikey-usage-logout"));

    expect(window.localStorage.getItem("apiKeyUsage.lastApiKey.v1")).toBeNull();
    expect(await screen.findByTestId("apikey-usage-empty")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/输入 API 密钥|Enter API Key/i)).toBeInTheDocument();
  });

  test("flags an empty key in place, and the dialog can be dismissed and reopened", async () => {
    renderPage();

    const dialog = screen.getByRole("dialog", { name: "输入 API 密钥" });
    await userEvent.click(screen.getByTestId("apikey-usage-submit"));
    expect(mocks.fetchPublicLogs).not.toHaveBeenCalled();
    expect(within(dialog).getByText("这一项必填")).toBeInTheDocument();

    // 没有已查询的 Key 时也能关掉：顶栏和空状态都有入口再打开。
    await userEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await userEvent.click(screen.getByTestId("apikey-usage-open-modal"));
    expect(await screen.findByRole("dialog", { name: "输入 API 密钥" })).toBeInTheDocument();
  });

  test("restores the last API key from localStorage", async () => {
    window.localStorage.setItem(
      "apiKeyUsage.lastApiKey.v1",
      JSON.stringify({ apiKey: "sk-restored", name: "restored-name" }),
    );

    renderPage();

    await waitFor(() => {
      expect(mocks.fetchPublicLogs).toHaveBeenCalled();
    });
    expect(mocks.fetchPublicLogs.mock.calls[0][0]).toMatchObject({
      apiKey: "sk-restored",
      page: 1,
    });
    expect(await screen.findByText("张军宝")).toBeInTheDocument();
    expect(screen.queryByTestId("apikey-usage-empty")).not.toBeInTheDocument();
  });

  test("shows subscription expiry banner, billing tab, plans, and payment history for a bound key", async () => {
    const expiresIso = new Date(Date.now() + 34 * 24 * 3600 * 1000).toISOString();
    mocks.apiKeyBillingApi.overview.mockResolvedValue({
      enabled: true,
      has_billing_info: true,
      currency: "CNY",
      channels: ["wechat"],
      orders_count: 1,
      target: {
        binding_id: "bind-1",
        target_kind: "api_key",
        target_id: "key-1",
        label: "曹俊涛",
        key_masked: "sk-b****78o1",
        expires_at: expiresIso,
        lifetime_limit_usd: 0,
        lifetime_used_usd: 100,
        note: "续费自动顺延",
        plans: [
          {
            id: "plan-1",
            name: "codex 套餐1",
            description: "包月续费",
            kind: "subscription",
            price_cents: 20400,
            duration_days: 30,
            quota_amount_usd: 0,
            quota_requests: 0,
            quota_tokens: 0,
            rate_usd_per_cny: 0,
            min_amount_cents: 0,
            max_amount_cents: 0,
            badge: "推荐",
          },
        ],
      },
    });
    mocks.apiKeyBillingApi.listOrders.mockResolvedValue({
      items: [
        {
          id: "ord-hist",
          order_no: "ORD20261026120000MANUAL01",
          tenant_id: "t1",
          binding_id: "bind-1",
          target_kind: "api_key",
          target_id: "key-1",
          target_label: "曹俊涛",
          end_user_id: "u1",
          plan_id: "plan-1",
          plan_name: "codex 套餐1",
          plan_kind: "subscription",
          plan_snapshot: {
            id: "plan-1",
            tenant_id: "t1",
            name: "codex 套餐1",
            description: "",
            kind: "subscription",
            price_cents: 20400,
            duration_days: 30,
            quota_amount_usd: 0,
            quota_requests: 0,
            quota_tokens: 0,
            rate_usd_per_cny: 0,
            min_amount_cents: 0,
            max_amount_cents: 0,
            permission_profile_id: "",
            badge: "",
            sort_order: 0,
            enabled: true,
            created_at: "",
            updated_at: "",
          },
          provider: "manual",
          pay_channel: "manual",
          amount_cents: 40000,
          currency: "CNY",
          status: "fulfilled",
          fulfillment_summary: "历史线下收款补录（2个月）",
          source: "admin_manual",
          expires_at: "2026-10-26T04:00:00Z",
          paid_at: "2026-10-26T04:00:00Z",
          created_at: "2026-10-26T04:00:00Z",
          updated_at: "2026-10-26T04:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      size: 30,
      summary: {
        today_amount_cents: 0,
        month_amount_cents: 0,
        total_amount_cents: 40000,
        paid_count: 1,
        pending_count: 0,
        failed_count: 0,
      },
    });
    mocks.apiKeyBillingApi.createOrder.mockResolvedValue({
      id: "ord-new",
      order_no: "ORD202611229999",
      tenant_id: "t1",
      binding_id: "bind-1",
      target_kind: "api_key",
      target_id: "key-1",
      target_label: "曹俊涛",
      end_user_id: "u1",
      plan_id: "plan-1",
      plan_name: "codex 套餐1",
      plan_kind: "subscription",
      plan_snapshot: {} as never,
      provider: "xunhupay",
      pay_channel: "wechat",
      amount_cents: 20400,
      currency: "CNY",
      status: "pending",
      qrcode_url: "https://api.xunhupay.com/qr.png",
      pay_url: "https://api.xunhupay.com/pay/ORD202611229999",
      source: "apikey_usage",
      expires_at: new Date(Date.now() + 900_000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    window.localStorage.setItem(
      "apiKeyUsage.lastApiKey.v1",
      JSON.stringify({ apiKey: "sk-bound-key", name: "曹俊涛" }),
    );
    renderPage();

    // Expiry banner and Billing tab appear immediately without leaving the usage page.
    expect(await screen.findByTestId("apikey-usage-billing-banner")).toHaveTextContent(/剩余约 34 天/);
    expect(screen.getByRole("tab", { name: "充值续费" })).toBeInTheDocument();
    const navTablist = screen.getAllByRole("tablist")[0];
    expect(within(navTablist).getAllByRole("tab").map((el) => el.textContent)).toEqual([
      "请求日志",
      "充值续费",
      "快捷导入",
    ]);

    // Click shortcut button to enter Billing tab and view plans + historical payment records.
    await userEvent.click(screen.getByRole("button", { name: /套餐与充值/ }));
    expect(await screen.findByText("codex 套餐1")).toBeInTheDocument();
    expect(await screen.findByText("ORD20261026120000MANUAL01")).toBeInTheDocument();
    expect(screen.getByText("¥400.00")).toBeInTheDocument();

    // Create a live checkout order and verify QR modal pops up.
    await userEvent.click(screen.getByRole("button", { name: /立即支付 ¥204\.00/ }));
    await waitFor(() => {
      expect(mocks.apiKeyBillingApi.createOrder).toHaveBeenCalledWith("sk-bound-key", {
        plan_id: "plan-1",
        pay_channel: "wechat",
      });
    });
    expect(await screen.findByText("扫码完成支付")).toBeInTheDocument();
  });
});
