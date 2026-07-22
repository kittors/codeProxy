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
    "apikey_lookup.account_scope": "Account quota",
    "apikey_lookup.key_scope": "Key quota",
    "quota.period.5h": "5 hours",
    "quota.period.day": "Day",
    "quota.period.week": "Week",
    "quota.period.month": "Month",
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

  test("prefers scope-aware period quotas over legacy limits", () => {
    render(
      <div className="grid">
        <QuotaLimitKpiCards
          t={t}
          limits={{
            "daily-spending-limit": 999,
            "daily-spending-used": 1,
          }}
          quotaScopes={[
            {
              scope: "account",
              "period-spending": [{ period: "day", limit: 300, used: 39, remaining: 261 }],
              "daily-spending-used": 39,
              "lifetime-spending-used": 900,
            },
            {
              scope: "key",
              "period-spending": [{ period: "5h", limit: 50, used: 12, remaining: 38 }],
              "daily-spending-used": 20,
              "lifetime-spending-used": 300,
            },
          ]}
          renderValue={(value) => value}
        />
      </div>,
    );

    expect(screen.getByText("Account quota · Day")).toBeInTheDocument();
    expect(screen.getByText("Key quota · 5 hours")).toBeInTheDocument();
    expect(screen.getByText(/\$39/)).toBeInTheDocument();
    expect(screen.queryByText("Daily spending")).not.toBeInTheDocument();
  });

  test("falls back to legacy limits when quota scopes are absent", () => {
    const items = buildQuotaKpiItems(
      t,
      { "daily-spending-limit": 10, "daily-spending-used": 2 },
      undefined,
    );

    expect(items).toEqual([expect.objectContaining({ key: "daily-spending", used: 2, limit: 10 })]);
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
