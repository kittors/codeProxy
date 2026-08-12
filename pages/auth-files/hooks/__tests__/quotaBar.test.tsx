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
