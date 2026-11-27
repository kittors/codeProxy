import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import type { BillingOrder, PortalBillingOverview } from "@code-proxy/api-client";
import { PortalBillingTab } from "../PortalBillingTab";

const portalBillingMock = vi.hoisted(() => ({
  overview: vi.fn(),
  listOrders: vi.fn(),
  createOrder: vi.fn(),
  getOrder: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  portalBillingApi: portalBillingMock,
}));

const SAMPLE_OVERVIEW: PortalBillingOverview = {
  enabled: true,
  currency: "CNY",
  channels: ["wechat", "alipay"],
  targets: [
    {
      binding_id: "bind-1",
      target_kind: "api_key",
      target_id: "key-1",
      label: "Production Key",
      key_masked: "sk-prod***1234",
      expires_at: new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString(),
      lifetime_limit_usd: 20,
      lifetime_used_usd: 5,
      note: "Auto-extends upon payment",
      plans: [
        {
          id: "plan-sub",
          name: "Monthly Pro",
          description: "30 days access",
          kind: "subscription",
          price_cents: 2990,
          duration_days: 30,
          quota_amount_usd: 5,
          quota_requests: 0,
          quota_tokens: 0,
          rate_usd_per_cny: 0,
          min_amount_cents: 0,
          max_amount_cents: 0,
          badge: "Popular",
        },
        {
          id: "plan-custom",
          name: "Custom Credit",
          description: "Flexible recharge",
          kind: "custom_quota",
          price_cents: 1000,
          duration_days: 0,
          quota_amount_usd: 0,
          quota_requests: 0,
          quota_tokens: 0,
          rate_usd_per_cny: 0.5,
          min_amount_cents: 500,
          max_amount_cents: 50000,
        },
      ],
    },
  ],
};

const SAMPLE_ORDER: BillingOrder = {
  id: "ord-1",
  order_no: "ORD202611220001",
  tenant_id: "t1",
  binding_id: "bind-1",
  target_kind: "api_key",
  target_id: "key-1",
  target_label: "Production Key",
  end_user_id: "u1",
  plan_id: "plan-sub",
  plan_name: "Monthly Pro",
  plan_kind: "subscription",
  plan_snapshot: {
    ...SAMPLE_OVERVIEW.targets[0].plans[0],
    tenant_id: "t1",
    permission_profile_id: "",
    badge: "Popular",
    sort_order: 0,
    enabled: true,
    created_at: "2026-11-22T00:00:00Z",
    updated_at: "2026-11-22T00:00:00Z",
  },
  provider: "xunhupay",
  pay_channel: "wechat",
  amount_cents: 2990,
  currency: "CNY",
  status: "pending",
  qrcode_url: "https://api.xunhupay.com/qr.png",
  pay_url: "https://api.xunhupay.com/pay/ORD202611220001",
  source: "portal",
  expires_at: new Date(Date.now() + 900_000).toISOString(),
  created_at: "2026-11-22T09:00:00Z",
  updated_at: "2026-11-22T09:00:00Z",
};

describe("PortalBillingTab", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    portalBillingMock.overview.mockResolvedValue(SAMPLE_OVERVIEW);
    portalBillingMock.listOrders.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      size: 30,
      summary: {
        today_amount_cents: 0,
        month_amount_cents: 0,
        total_amount_cents: 0,
        paid_count: 0,
        pending_count: 0,
        failed_count: 0,
      },
    });
    portalBillingMock.createOrder.mockResolvedValue(SAMPLE_ORDER);
    portalBillingMock.getOrder.mockResolvedValue({
      ...SAMPLE_ORDER,
      status: "fulfilled",
      fulfillment_summary: "Extended 30 days",
    });
  });

  test("renders bound plans, supports custom amount estimation, and checks out with QR modal", async () => {
    const onFulfilled = vi.fn();
    render(
      <ThemeProvider>
        <ToastProvider>
          <PortalBillingTab active onOrderFulfilled={onFulfilled} />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText("Production Key")).toBeInTheDocument();
    expect(screen.getByText("Monthly Pro")).toBeInTheDocument();
    expect(screen.getByText("$15.00 / $20.00")).toBeInTheDocument();

    // Switch to custom top-up plan and enter 20 CNY => +$10.00 credit.
    fireEvent.click(screen.getByRole("button", { name: /Custom Credit/i }));
    const amountInput = screen.getByRole("spinbutton");
    fireEvent.change(amountInput, { target: { value: "20" } });
    expect(screen.getByText("+$10.00")).toBeInTheDocument();

    // Switch back to Monthly Pro, verify channel toggle styling/semantics, and submit order.
    fireEvent.click(screen.getByRole("button", { name: /Monthly Pro/i }));
    const wechatBtn = screen.getByRole("button", { name: /WeChat Pay/i });
    const alipayBtn = screen.getByRole("button", { name: /Alipay/i });
    expect(wechatBtn).toHaveAttribute("aria-pressed", "true");
    expect(alipayBtn).toHaveAttribute("aria-pressed", "false");
    expect(wechatBtn.className).not.toContain("bg-sn-accent text-white");
    expect(wechatBtn.className).toContain("text-sn-label");
    fireEvent.click(alipayBtn);
    expect(alipayBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(wechatBtn);
    expect(wechatBtn).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /Pay ¥29\.90/i }));

    await waitFor(() => {
      expect(portalBillingMock.createOrder).toHaveBeenCalledWith({
        binding_id: "bind-1",
        plan_id: "plan-sub",
        pay_channel: "wechat",
      });
    });

    expect(await screen.findByText("Scan QR Code to Pay")).toBeInTheDocument();

    // Trigger manual status poll and verify fulfillment callback.
    fireEvent.click(screen.getByRole("button", { name: /I've paid, check now/i }));
    await waitFor(() => {
      expect(onFulfilled).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText("Payment received and fulfilled")).toBeInTheDocument();
  });

  test("shows unavailable empty state when billing is disabled", async () => {
    portalBillingMock.overview.mockResolvedValue({
      enabled: false,
      currency: "CNY",
      channels: [],
      targets: [],
    });
    render(
      <ThemeProvider>
        <ToastProvider>
          <PortalBillingTab active />
        </ToastProvider>
      </ThemeProvider>,
    );

    expect(await screen.findByText("Self-service billing unavailable")).toBeInTheDocument();
  });
});
