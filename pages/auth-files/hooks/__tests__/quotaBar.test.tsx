import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { QUOTA_STALE_AFTER_MS } from "@code-proxy/domain";
import type { QuotaItem } from "@features/quota-preview/quota-helpers";
import { renderQuotaBarNode, type QuotaBarDeps } from "../quotaBar";

const NOW = 1_800_000_000_000;

const deps = (): QuotaBarDeps => ({
  t: ((key: string, vars?: Record<string, unknown>) =>
    vars?.age ? `${key}:${String(vars.age)}` : key) as unknown as QuotaBarDeps["t"],
  nowMs: NOW,
  translateQuotaText: (text: string) => text,
  formatQuotaItemDetailText: () => null,
  formatQuotaAgeCompact: (observedAtMs?: number) =>
    typeof observedAtMs === "number" ? `${Math.round((NOW - observedAtMs) / 3_600_000)}h` : null,
});

const bar = (item: QuotaItem) =>
  render(<div>{renderQuotaBarNode("m_quota.code_weekly", item, false, deps())}</div>);

const item = (overrides: Partial<QuotaItem> = {}): QuotaItem => ({
  key: "code_week",
  label: "m_quota.code_weekly",
  percent: 15,
  ...overrides,
});

describe("renderQuotaBarNode staleness", () => {
  test("a freshly observed value renders plainly", () => {
    const { container } = bar(item({ observedAtMs: NOW - 60_000 }));

    expect(screen.queryByText(/stale_observed/)).toBeNull();
    expect(screen.queryByText("m_quota.stale_never_observed")).toBeNull();
    expect(container.querySelector(".saturate-50")).toBeNull();
  });

  test("a value unconfirmed past the threshold is desaturated and dated", () => {
    const { container } = bar(item({ observedAtMs: NOW - QUOTA_STALE_AFTER_MS - 3_600_000 }));

    expect(screen.getByText(/m_quota\.stale_observed:/)).toBeInTheDocument();
    expect(container.querySelector(".saturate-50")).not.toBeNull();
  });

  // Accounts failing since before quota observation existed carry values with no
  // timestamp, and their snapshot history is past retention. Treating a missing
  // age as "fresh" would leave exactly those accounts unmarked.
  test("a value with an unknown age is degraded rather than trusted", () => {
    const { container } = bar(item({ observedAtMs: undefined }));

    expect(screen.getByText("m_quota.stale_never_observed")).toBeInTheDocument();
    expect(container.querySelector(".saturate-50")).not.toBeNull();
  });

  test("a window with no value at all is not marked stale", () => {
    const { container } = bar(item({ percent: null, observedAtMs: undefined }));

    expect(screen.queryByText("m_quota.stale_never_observed")).toBeNull();
    expect(container.querySelector(".saturate-50")).toBeNull();
  });
});
