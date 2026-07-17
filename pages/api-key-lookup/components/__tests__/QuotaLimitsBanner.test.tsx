import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { buildQuotaKpiItems, QuotaLimitKpiCards } from "../QuotaLimitsBanner";

const t = (key: string) => {
  const labels: Record<string, string> = {
    "apikey_lookup.quota_limits_title": "Quota limits",
    "apikey_lookup.quota_used_of_limit": "Used / limit",
    "apikey_lookup.quota_daily_requests": "Daily requests",
    "apikey_lookup.quota_total_requests": "Total request quota",
    "apikey_lookup.quota_daily_spending": "Daily spending",
    "apikey_lookup.quota_total_spending": "Total spending",
  };
  return labels[key] ?? key;
};

describe("QuotaLimitKpiCards", () => {
  test("builds no items without limits", () => {
    expect(buildQuotaKpiItems(t, null)).toEqual([]);
  });

  test("renders configured limits as KPI cards with used/limit", () => {
    render(
      <div className="grid">
        <QuotaLimitKpiCards
          t={t}
          limits={{
            "daily-limit": 100,
            "daily-used": 12,
            "total-quota": 1000,
            "total-used": 40,
            "daily-spending-limit": 5,
            "daily-spending-used": 1.25,
            "spending-limit": 50,
            "spending-used": 9.5,
          }}
          renderValue={(value) => value}
        />
      </div>,
    );

    expect(screen.getByTestId("api-key-lookup-quota-daily-limit")).toBeInTheDocument();
    expect(screen.getByText("Daily requests")).toBeInTheDocument();
    expect(screen.getByText("Total request quota")).toBeInTheDocument();
    expect(screen.getByText("Daily spending")).toBeInTheDocument();
    expect(screen.getByText("Total spending")).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/\$1\.25/)).toBeInTheDocument();
  });

  test("hides unset limits", () => {
    render(
      <div className="grid">
        <QuotaLimitKpiCards
          t={t}
          limits={{
            "daily-limit": 10,
            "daily-used": 1,
          }}
          renderValue={(value) => value}
        />
      </div>,
    );
    expect(screen.getByText("Daily requests")).toBeInTheDocument();
    expect(screen.queryByText("Total spending")).not.toBeInTheDocument();
    expect(screen.queryByText("Daily spending")).not.toBeInTheDocument();
  });
});
