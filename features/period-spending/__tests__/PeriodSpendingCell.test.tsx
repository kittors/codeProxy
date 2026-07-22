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
