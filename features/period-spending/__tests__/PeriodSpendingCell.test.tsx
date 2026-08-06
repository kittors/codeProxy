import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PeriodSpendingCell, PeriodSpendingLimitsCell } from "../PeriodSpendingCell";

const t = (key: string) => {
  const labels: Record<string, string> = {
    "quota.period.5h": "5 hours",
    "quota.period.day": "Day",
    "quota.period.week": "Week",
    "quota.period.month": "Month",
    "quota.unlimited": "Unlimited",
    "quota.status.warning": "Near quota limit",
    "quota.status.exceeded": "Quota exceeded",
  };
  return labels[key] ?? key;
};

describe("PeriodSpendingCell", () => {
  test("renders finite periods in the fixed 5h to month order", () => {
    const { container } = render(
      <PeriodSpendingCell
        t={t}
        items={[
          { period: "month", limit: 4000, used: 912.34, remaining: 3087.66 },
          { period: "day", limit: 300, used: 39, remaining: 261 },
          { period: "5h", limit: 100, used: 39, remaining: 61 },
          { period: "week", limit: 800, used: 120, remaining: 680 },
        ]}
      />,
    );

    expect(container.textContent).toBe(
      "5 hours$39 / $100Day$39 / $300Week$120 / $800Month$912.34 / $4,000",
    );
  });

  test("adds warning and danger semantics at 90 and 100 percent", () => {
    render(
      <PeriodSpendingCell
        t={t}
        items={[
          { period: "5h", limit: 100, used: 90, remaining: 10 },
          { period: "day", limit: 100, used: 100, remaining: 0 },
        ]}
      />,
    );

    const warning = screen.getByText("Near quota limit").parentElement;
    const danger = screen.getByText("Quota exceeded").parentElement;
    expect(warning).toHaveClass("border-amber-200");
    expect(danger).toHaveClass("border-rose-200");
    expect(warning?.querySelector("svg")).not.toBeNull();
    expect(danger?.querySelector("svg")).not.toBeNull();
  });

  test("shows unlimited when no finite period is configured", () => {
    render(<PeriodSpendingCell t={t} items={[]} />);
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
  });

  test("renders template limits without fake used values", () => {
    const { container } = render(
      <PeriodSpendingLimitsCell t={t} limits={{ "5h": 100, day: 300, week: 0, month: 4000 }} />,
    );

    expect(screen.getByText("$100")).toBeInTheDocument();
    expect(screen.getByText("$300")).toBeInTheDocument();
    expect(screen.getByText("$4,000")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("/");
    expect(container).not.toHaveTextContent("Week");
  });
});

describe("PeriodSpendingCell lifetime cap", () => {
  const lifetimeT = (key: string, options?: Record<string, unknown>) => {
    const labels: Record<string, string> = {
      "quota.unlimited": "Unlimited",
      "quota.lifetime_label": "Lifetime",
      "quota.remaining_value": `${String(options?.remaining ?? "")} left`,
      "quota.lifetime_remaining_detail": `Lifetime: ${String(options?.used ?? "")} used, ${String(options?.limit ?? "")} cap, ${String(options?.remaining ?? "")} left`,
      "quota.status.warning": "Near quota limit",
      "quota.status.exceeded": "Quota exceeded",
    };
    return labels[key] ?? key;
  };

  test("an account with only a lifetime cap no longer reads as unlimited", () => {
    render(<PeriodSpendingCell t={lifetimeT} items={[]} lifetime={{ used: 12, limit: 100 }} />);

    expect(screen.queryByText("Unlimited")).toBeNull();
    expect(screen.getByText("Lifetime")).toBeTruthy();
    expect(screen.getByText(/\$88 left/)).toBeTruthy();
  });

  test("shows remaining, not spent, because a lifetime cap never refills", () => {
    const { container } = render(
      <PeriodSpendingCell
        t={lifetimeT}
        items={[{ period: "day", limit: 300, used: 120, remaining: 180 }]}
        lifetime={{ used: 12, limit: 100 }}
      />,
    );

    // Rolling period keeps used/limit; lifetime switches to what is left.
    expect(container.textContent).toContain("$120 / $300");
    expect(container.textContent).toContain("$88 left / $100");
  });

  test("an overspent lifetime cap clamps to zero left instead of going negative", () => {
    render(<PeriodSpendingCell t={lifetimeT} items={[]} lifetime={{ used: 140, limit: 100 }} />);

    expect(screen.getByText(/\$0 left/)).toBeTruthy();
    expect(screen.getByText("Quota exceeded")).toBeTruthy();
  });

  test("no lifetime cap configured keeps the column periodic only", () => {
    render(<PeriodSpendingCell t={lifetimeT} items={[]} lifetime={{ used: 88, limit: 0 }} />);

    expect(screen.getByText("Unlimited")).toBeTruthy();
    expect(screen.queryByText("Lifetime")).toBeNull();
  });
});
