import { describe, expect, test } from "vitest";
import { encodeQrMatrix } from "../qrCode";
import { describePlanBenefits, formatExpiryRemaining, formatYuan, orderStatusMeta } from "../billingFormat";

describe("QR code matrix encoder", () => {
  test("encodes short and long URLs with valid finder patterns", () => {
    const shortMatrix = encodeQrMatrix("https://relay.example.com/#/pay/abc123");
    const shortSize = shortMatrix.length;
    expect(shortSize).toBeGreaterThanOrEqual(21);
    expect((shortSize - 17) % 4).toBe(0);
    expect(shortMatrix[0].length).toBe(shortSize);
    // Top-left finder pattern 7x7 outer ring is dark.
    for (let i = 0; i < 7; i += 1) {
      expect(shortMatrix[0][i]).toBe(true);
      expect(shortMatrix[6][i]).toBe(true);
      expect(shortMatrix[i][0]).toBe(true);
      expect(shortMatrix[i][6]).toBe(true);
    }

    const longMatrix = encodeQrMatrix(
      "https://api.xunhupay.com/payment/do.html?appid=201906123456&trade_order_id=ORD202611220001&total_fee=29.90&nonce_str=abcdef1234567890",
    );
    expect(longMatrix.length).toBeGreaterThan(shortSize);
  });

  test("rejects payloads exceeding version 10 M capacity", () => {
    expect(() => encodeQrMatrix("a".repeat(250))).toThrow(/exceeds supported length/i);
  });
});

describe("billingFormat helpers", () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key;

  test("formats CNY cents accurately", () => {
    expect(formatYuan(0)).toBe("¥0.00");
    expect(formatYuan(2990)).toBe("¥29.90");
    expect(formatYuan(10000)).toBe("¥100.00");
  });

  test("computes expiry status for expired, soon, and active dates", () => {
    expect(formatExpiryRemaining(null, t)).toBeNull();
    expect(formatExpiryRemaining("invalid", t)).toBeNull();

    const past = new Date(Date.now() - 3600 * 1000).toISOString();
    expect(formatExpiryRemaining(past, t)?.expired).toBe(true);

    const soon = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    const soonMeta = formatExpiryRemaining(soon, t);
    expect(soonMeta?.expired).toBe(false);
    expect(soonMeta?.soon).toBe(true);

    const later = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString();
    const laterMeta = formatExpiryRemaining(later, t);
    expect(laterMeta?.expired).toBe(false);
    expect(laterMeta?.soon).toBe(false);
  });

  test("describes benefits for all four plan kinds", () => {
    expect(
      describePlanBenefits(
        {
          kind: "subscription",
          duration_days: 30,
          quota_amount_usd: 5,
          quota_requests: 0,
          quota_tokens: 0,
          rate_usd_per_cny: 0,
          min_amount_cents: 0,
          max_amount_cents: 0,
        },
        t,
      ),
    ).toEqual([
      'billing.benefit_duration_days:{"days":30}',
      'billing.benefit_bonus_usd:{"usd":"5.00"}',
    ]);

    expect(
      describePlanBenefits(
        {
          kind: "quota_pack",
          duration_days: 0,
          quota_amount_usd: 10,
          quota_requests: 500,
          quota_tokens: 0,
          rate_usd_per_cny: 0,
          min_amount_cents: 0,
          max_amount_cents: 0,
        },
        t,
      ),
    ).toHaveLength(2);

    expect(
      describePlanBenefits(
        {
          kind: "custom_quota",
          duration_days: 0,
          quota_amount_usd: 0,
          quota_requests: 0,
          quota_tokens: 0,
          rate_usd_per_cny: 0.5,
          min_amount_cents: 500,
          max_amount_cents: 50000,
        },
        t,
      ),
    ).toHaveLength(2);

    expect(
      describePlanBenefits(
        {
          kind: "daily_reset",
          duration_days: 0,
          quota_amount_usd: 0,
          quota_requests: 0,
          quota_tokens: 0,
          rate_usd_per_cny: 0,
          min_amount_cents: 0,
          max_amount_cents: 0,
        },
        t,
      ),
    ).toEqual(["billing.benefit_daily_reset"]);
  });

  test("maps order status metadata", () => {
    expect(orderStatusMeta("fulfilled", t).label).toBe("billing.order_status.fulfilled");
    expect(orderStatusMeta("pending", t).label).toBe("billing.order_status.pending");
    expect(orderStatusMeta("failed", t).label).toBe("billing.order_status.failed");
    expect(orderStatusMeta("closed", t).label).toBe("billing.order_status.closed");
  });
});
