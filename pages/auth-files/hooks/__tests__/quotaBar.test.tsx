import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { QuotaItem } from "@features/quota-preview/quota-helpers";
import { renderQuotaBarNode, type QuotaBarDeps } from "../quotaBar";

const deps = (): QuotaBarDeps => ({
  translateQuotaText: (text: string) => text,
  formatQuotaItemDetailText: () => "reset in 2d",
});

const bar = (item: QuotaItem) =>
  render(<div>{renderQuotaBarNode("m_quota.code_weekly", item, false, deps())}</div>);

const item = (overrides: Partial<QuotaItem> = {}): QuotaItem => ({
  key: "code_week",
  label: "m_quota.code_weekly",
  percent: 15,
  ...overrides,
});

describe("renderQuotaBarNode", () => {
  test("renders the label, percent and detail text", () => {
    bar(item());

    expect(screen.getByText("m_quota.code_weekly")).toBeInTheDocument();
    expect(screen.getByText("15%")).toBeInTheDocument();
    expect(screen.getByText("reset in 2d")).toBeInTheDocument();
  });

  test("prints the window's spend beside the countdown, with the estimate on hover", () => {
    render(
      <div>
        {renderQuotaBarNode("m_quota.code_weekly", item({ usedCostUsd: 12 }), false, {
          ...deps(),
          describeQuotaItemSpend: (value) =>
            value?.usedCostUsd === undefined
              ? null
              : { text: "$12.00", title: "Spent $12.00 · 85% used, about $14.12" },
        })}
      </div>,
    );

    const spend = screen.getByTestId("quota-bar-spend");
    expect(spend).toHaveTextContent("$12.00");
    expect(spend).toHaveAttribute("title", "Spent $12.00 · 85% used, about $14.12");
    expect(screen.getByText("15%")).toBeInTheDocument();
  });

  // Two rows can share a group name and differ only by window; when the line
  // is short, the group name is what truncates.
  test("keeps the window of a 'group · window' label out of the truncated part", () => {
    render(<div>{renderQuotaBarNode("Claude and GPT · 每周", item(), true, deps())}</div>);

    expect(screen.getByText("Claude and GPT")).toHaveClass("truncate");
    const suffix = screen.getByTestId("quota-bar-label-suffix");
    expect(suffix).toHaveTextContent("· 每周");
    expect(suffix).not.toHaveClass("truncate");
  });

  test("leaves a label without a window separator whole", () => {
    bar(item());
    expect(screen.queryByTestId("quota-bar-label-suffix")).toBeNull();
  });

  // An older backend sends no spend; the bar must look exactly as before.
  test("shows no amount when the window reports no spend", () => {
    render(
      <div>
        {renderQuotaBarNode("m_quota.code_weekly", item(), false, {
          ...deps(),
          describeQuotaItemSpend: () => null,
        })}
      </div>,
    );
    expect(screen.queryByTestId("quota-bar-spend")).toBeNull();
  });

  // Entering the page always force-probes the visible cards, so an observation
  // age said more about probe timing than about the account. The bar must now
  // render one way only — no dating text, no desaturated fill.
  test("never dates or desaturates the value", () => {
    const { container } = bar(item());

    expect(container.querySelector(".saturate-50")).toBeNull();
    expect(container.querySelector(".text-amber-600")).toBeNull();
    expect(screen.queryByText(/stale/i)).toBeNull();
    expect(screen.getByText("15%")).toBeInTheDocument();
  });
});
