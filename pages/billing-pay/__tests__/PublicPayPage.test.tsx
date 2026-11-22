import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import type { BillingOrder, PublicBillingPayInfo } from "@code-proxy/api-client";
import { PublicPayPage } from "../PublicPayPage";

const publicBillingMock = vi.hoisted(() => ({
  getPayInfo: vi.fn(),
  createOrder: vi.fn(),
  getOrder: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  publicBillingApi: publicBillingMock,
}));

const PUBLIC_INFO: PublicBillingPayInfo = {
  code: "paycode99",
  currency: "CNY",
  channels: ["alipay"],
  target: {
    binding_id: "bind-1",
    target_kind: "api_key",
    target_id: "key-1",
    label: "Dedicated Key",
    key_masked: "sk-demo***8888",
    expires_at: null,
    lifetime_limit_usd: 100,
    lifetime_used_usd: 25,
    note: "Pay without login",
    plans: [
      {
        id: "plan-pack",
        name: "$20 Quota Pack",
        description: "One-time top-up",
        kind: "quota_pack",
        price_cents: 4000,
        duration_days: 0,
        quota_amount_usd: 20,
        quota_requests: 0,
        quota_tokens: 0,
        rate_usd_per_cny: 0,
        min_amount_cents: 0,
        max_amount_cents: 0,
      },
    ],
  },
};

const ORDER: BillingOrder = {
  id: "ord-2",
  order_no: "ORD202611220002",
  tenant_id: "t1",
  binding_id: "bind-1",
  target_kind: "api_key",
  target_id: "key-1",
  target_label: "Dedicated Key",
  end_user_id: "u1",
  plan_id: "plan-pack",
  plan_name: "$20 Quota Pack",
  plan_kind: "quota_pack",
  plan_snapshot: {
    ...PUBLIC_INFO.target.plans[0],
    tenant_id: "t1",
    permission_profile_id: "",
    badge: "",
    sort_order: 0,
    enabled: true,
    created_at: "",
    updated_at: "",
  },
  provider: "xunhupay",
  pay_channel: "alipay",
  amount_cents: 4000,
  currency: "CNY",
  status: "pending",
  pay_url: "https://api.xunhupay.com/pay/ORD202611220002",
  source: "public_qr",
  expires_at: new Date(Date.now() + 900_000).toISOString(),
  created_at: "2026-11-22T10:00:00Z",
  updated_at: "2026-11-22T10:00:00Z",
};

describe("PublicPayPage", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage("en");
    publicBillingMock.getPayInfo.mockResolvedValue(PUBLIC_INFO);
    publicBillingMock.createOrder.mockResolvedValue(ORDER);
    publicBillingMock.getOrder.mockResolvedValue(ORDER);
  });

  test("loads masked target info and creates public order with QR fallback", async () => {
    render(
      <MemoryRouter initialEntries={["/pay/paycode99"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/pay/:code" element={<PublicPayPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Dedicated Key")).toBeInTheDocument();
    expect(screen.getByText("sk-demo***8888")).toBeInTheDocument();
    expect(screen.getByText("$75.00 / $100.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Pay ¥40\.00/i }));
    await waitFor(() => {
      expect(publicBillingMock.createOrder).toHaveBeenCalledWith("paycode99", {
        plan_id: "plan-pack",
        pay_channel: "alipay",
      });
    });

    expect(await screen.findByText("Scan QR Code to Pay")).toBeInTheDocument();
  });

  test("shows error callout when public code is invalid", async () => {
    publicBillingMock.getPayInfo.mockRejectedValue(new Error("link expired"));
    render(
      <MemoryRouter initialEntries={["/pay/badcode"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/pay/:code" element={<PublicPayPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Payment link invalid or expired")).toBeInTheDocument();
    expect(screen.getByText("link expired")).toBeInTheDocument();
  });
});
