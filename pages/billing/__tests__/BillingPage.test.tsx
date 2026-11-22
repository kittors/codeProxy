import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import {
  normalizeEndUser,
  type BillingBinding,
  type BillingPlan,
  type BillingSettings,
  type EndUserAPIKey,
} from "@code-proxy/api-client";
import { BillingPage } from "../BillingPage";

const mocks = vi.hoisted(() => ({
  caps: {
    status: "ready" as const,
    capabilities: { billing: true },
    reload: vi.fn(),
  },
  billingAdminApi: {
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    testChannel: vi.fn(),
    listPlans: vi.fn(),
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
    deletePlan: vi.fn(),
    listBindings: vi.fn(),
    upsertBinding: vi.fn(),
    rotateBindingCode: vi.fn(),
    deleteBinding: vi.fn(),
    listOrders: vi.fn(),
    syncOrder: vi.fn(),
    fulfillOrder: vi.fn(),
    createManualOrder: vi.fn(),
  },
  endUsersApi: {
    list: vi.fn(),
    listKeys: vi.fn(),
  },
  profilesApi: {
    listDetailed: vi.fn(),
  },
}));

vi.mock("@features/backend-capabilities", () => ({
  useConfigCapabilities: () => mocks.caps,
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({ can: () => true }),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  billingAdminApi: mocks.billingAdminApi,
  endUsersApi: mocks.endUsersApi,
  apiKeyPermissionProfilesApi: mocks.profilesApi,
}));

const SETTINGS: BillingSettings = {
  enabled: true,
  provider: "xunhupay",
  public_base_url: "https://relay.example.com",
  xunhu_gateway_url: "https://api.xunhupay.com/payment/do.html",
  xunhu_query_url: "https://api.xunhupay.com/payment/query.html",
  xunhu_wechat_enabled: true,
  xunhu_wechat_appid: "wx-app-1",
  xunhu_wechat_appsecret: "",
  xunhu_wechat_has_secret: true,
  xunhu_alipay_enabled: false,
  xunhu_alipay_appid: "",
  xunhu_alipay_appsecret: "",
  xunhu_alipay_has_secret: false,
  order_expire_minutes: 15,
  currency: "CNY",
  wechat_notify_url: "https://relay.example.com/v0/management/public/billing/notify/xunhupay/wechat",
  alipay_notify_url: "https://relay.example.com/v0/management/public/billing/notify/xunhupay/alipay",
  persistent: true,
};

const PLAN: BillingPlan = {
  id: "plan-1",
  tenant_id: "t1",
  name: "Standard Monthly",
  description: "30-day renewal",
  kind: "subscription",
  price_cents: 3000,
  duration_days: 30,
  quota_amount_usd: 0,
  quota_requests: 0,
  quota_tokens: 0,
  rate_usd_per_cny: 0,
  min_amount_cents: 0,
  max_amount_cents: 0,
  permission_profile_id: "",
  badge: "Best",
  sort_order: 0,
  enabled: true,
  created_at: "2026-11-22T00:00:00Z",
  updated_at: "2026-11-22T00:00:00Z",
};

const BINDING: BillingBinding = {
  id: "bind-1",
  tenant_id: "t1",
  target_kind: "api_key",
  target_id: "key-1",
  end_user_id: "u1",
  enabled: true,
  plan_ids: ["plan-1"],
  price_overrides: {},
  public_code: "paycode99",
  allow_public_pay: true,
  note: "",
  created_at: "2026-11-22T00:00:00Z",
  updated_at: "2026-11-22T00:00:00Z",
  target_label: "Alice Key",
  key_masked: "sk-xxxx***9999",
  expires_at: null,
  lifetime_limit_usd: 50,
  public_pay_url: "https://relay.example.com/#/pay/paycode99",
};

describe("BillingPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    mocks.caps.capabilities.billing = true;
    mocks.billingAdminApi.getSettings.mockResolvedValue(SETTINGS);
    mocks.billingAdminApi.updateSettings.mockResolvedValue(SETTINGS);
    mocks.billingAdminApi.testChannel.mockResolvedValue({
      channel: "wechat",
      ok: true,
      message: "Connected",
      duration_ms: 42,
    });
    mocks.billingAdminApi.listPlans.mockResolvedValue([PLAN]);
    mocks.billingAdminApi.listBindings.mockResolvedValue([BINDING]);
    mocks.billingAdminApi.listOrders.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 20,
      summary: {
        today_amount_cents: 3000,
        month_amount_cents: 9000,
        total_amount_cents: 9000,
        paid_count: 3,
        pending_count: 1,
        failed_count: 0,
      },
    });
    mocks.endUsersApi.list.mockResolvedValue({
      items: [
        normalizeEndUser({
          id: "u1",
          tenant_id: "t1",
          username: "alice",
          display_name: "Alice",
          status: "active",
          must_change_password: false,
          created_at: "",
          updated_at: "",
          version: 1,
        }),
      ],
    });
    mocks.endUsersApi.listKeys.mockResolvedValue({
      items: [
        {
          id: "key-1",
          name: "Alice Key",
          key_masked: "sk-xxxx***9999",
          disabled: false,
        } as EndUserAPIKey,
      ],
    });
    mocks.profilesApi.listDetailed.mockResolvedValue({ items: [] });
  });

  test("renders gateway config, tests XunhuPay channel, and navigates across tabs", async () => {
    render(
      <MemoryRouter initialEntries={["/access/billing"]}>
        <ThemeProvider>
          <ToastProvider>
            <BillingPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("General Billing Settings")).toBeInTheDocument();
    expect(screen.getByDisplayValue("wx-app-1")).toBeInTheDocument();

    // Test WeChat channel connectivity.
    const testBtns = screen.getAllByRole("button", { name: /Test connection/i });
    fireEvent.click(testBtns[0]);
    await waitFor(() => {
      expect(mocks.billingAdminApi.testChannel).toHaveBeenCalledWith(
        expect.objectContaining({ channel: "wechat", appid: "wx-app-1" }),
      );
    });

    // Switch to Plans tab.
    fireEvent.click(screen.getByRole("tab", { name: "Billing Plans" }));
    expect(await screen.findByText("Standard Monthly")).toBeInTheDocument();
    expect(screen.getByText("¥30.00")).toBeInTheDocument();

    // Switch to Bindings tab and open QR modal.
    fireEvent.click(screen.getByRole("tab", { name: "Bindings & QR Codes" }));
    expect(await screen.findByText("Alice Key")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /QR Code/i }));
    expect(await screen.findByText("Direct Payment QR Code")).toBeInTheDocument();

    // Switch to Orders tab and confirm KPI figures.
    fireEvent.click(screen.getByRole("tab", { name: "Orders" }));
    expect(await screen.findByText("¥90.00")).toBeInTheDocument();
  });

  test("shows unsupported notice on older backends without billing capability", async () => {
    mocks.caps.capabilities.billing = false;
    render(
      <MemoryRouter initialEntries={["/access/billing"]}>
        <ThemeProvider>
          <ToastProvider>
            <BillingPage />
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Backend does not support billing yet")).toBeInTheDocument();
  });
});
