import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { QuotaMetricChips } from "../QuotaMetricChips";

const chips = (usedCostUsd?: number) =>
  render(
    <QuotaMetricChips
      slots={[
        {
          id: "code_5h",
          label: "Codex 5h",
          item: { key: "code_5h", label: "m_quota.code_5h", percent: 40, usedCostUsd },
        },
        {
          id: "code_week",
          label: "Codex week",
          item: { key: "code_week", label: "w", percent: 90 },
        },
      ]}
      resolveMetaText={() => null}
      resolveResetText={() => "2h"}
      resolvePercentText={(item) => `${item?.percent ?? "--"}%`}
    />,
  );

// The table's half-width chips have no room for another figure, so a window's
// spend rides on the chip's hover text; the chip itself keeps its layout.
describe("QuotaMetricChips window spend", () => {
  test("puts the spend and the size it implies on the chip's hover text", () => {
    chips(12.34);
    const [fiveHour, week] = screen.getAllByTestId("auth-file-quota-metric");
    expect(fiveHour?.getAttribute("title")).toContain("$12.34");
    // 60% used for $12.34: about $20.57 for the whole window.
    expect(fiveHour?.getAttribute("title")).toContain("$20.57");
    expect(fiveHour).not.toHaveTextContent("$12.34");
    // No spend reported: no hover text added.
    expect(week?.getAttribute("title")).toBeNull();
  });

  test("adds nothing when the backend reports no spend", () => {
    chips(undefined);
    for (const chip of screen.getAllByTestId("auth-file-quota-metric")) {
      expect(chip.getAttribute("title")).toBeNull();
    }
  });
});
