import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { QuotaLimitKpiCards } from "../components/QuotaLimitsBanner";

const t = (key: string, options?: Record<string, unknown>) => {
  const labels: Record<string, string> = {
    "apikey_lookup.quota_daily_requests": "Daily requests",
    "apikey_lookup.quota_total_spending": "Lifetime spending",
    "apikey_lookup.quota_used_of_limit": "Used of limit",
    "quota.remaining_value": `${String(options?.remaining ?? "")} left`,
    "quota.lifetime_remaining_hint": `Cap ${String(options?.limit ?? "")} · Used ${String(options?.used ?? "")}`,
  };
  return labels[key] ?? key;
};

describe("QuotaLimitKpiCards", () => {
  test("the lifetime card leads with what is left while keeping the cap in the hint", () => {
    render(
      <QuotaLimitKpiCards
        t={t}
        limits={{ "spending-limit": 100, "spending-used": 12 }}
        renderValue={(value) => value}
      />,
    );

    const card = screen.getByTestId("api-key-lookup-quota-spending");
    expect(card.textContent).toContain("$88.00 left");
    expect(card.textContent).toContain("$100.00");
    expect(card.textContent).toContain("Cap $100.00 · Used $12.00");
  });

  test("rolling quotas keep used/limit because they refill on their own", () => {
    render(
      <QuotaLimitKpiCards
        t={t}
        limits={{ "daily-limit": 1000, "daily-used": 120 }}
        renderValue={(value) => value}
      />,
    );

    const card = screen.getByTestId("api-key-lookup-quota-daily-limit");
    expect(card.textContent).toContain("120");
    expect(card.textContent).toContain("1,000");
    expect(card.textContent).not.toContain("left");
  });

  test("an overspent lifetime cap reads as zero left, not a negative balance", () => {
    render(
      <QuotaLimitKpiCards
        t={t}
        limits={{ "spending-limit": 100, "spending-used": 140 }}
        renderValue={(value) => value}
      />,
    );

    expect(screen.getByTestId("api-key-lookup-quota-spending").textContent).toContain("$0.00 left");
  });
});
