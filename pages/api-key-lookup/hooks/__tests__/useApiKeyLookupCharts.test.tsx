import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { ChartDataResponse } from "../../types";
import { useApiKeyLookupCharts } from "../useApiKeyLookupCharts";

const t = (key: string) => (key === "common.other" ? "Other" : key);

function chartData(distribution?: ChartDataResponse["api_key_distribution"]): ChartDataResponse {
  return {
    daily_series: [],
    heatmap_series: [],
    model_distribution: [],
    api_key_distribution: distribution,
    stats: {
      total: 0,
      success_rate: 0,
      total_tokens: 0,
      total_sessions: 0,
      total_cost: 0,
    },
  };
}

describe("useApiKeyLookupCharts API key distribution", () => {
  test("builds Top10 plus Other and reorders by the selected metric", () => {
    const distribution = Array.from({ length: 11 }, (_, index) => ({
      api_key_id: `key-${String(index + 1).padStart(2, "0")}`,
      name: `Key ${index + 1}`,
      requests: (11 - index) * 10,
      tokens: (index + 1) * 100,
    }));
    const { result } = renderHook(() =>
      useApiKeyLookupCharts({
        chartData: chartData(distribution),
        compact: false,
        isDark: false,
        t,
      }),
    );

    expect(result.current.apiKeyDistributionData).toHaveLength(11);
    expect(result.current.apiKeyDistributionData[0]).toEqual({ name: "Key 1", value: 110 });
    expect(result.current.apiKeyDistributionData.at(-1)).toEqual({ name: "Other", value: 10 });
    expect(result.current.apiKeyDistributionLegend[0]).toMatchObject({
      name: "Key 1",
      valueLabel: "110",
      percentLabel: "16.7%",
    });

    act(() => result.current.setApiKeyMetric("tokens"));

    expect(result.current.apiKeyDistributionData[0]).toEqual({ name: "Key 11", value: 1100 });
    expect(result.current.apiKeyDistributionData.at(-1)).toEqual({ name: "Other", value: 100 });
    expect(result.current.apiKeyDistributionLegend[0]).toMatchObject({
      name: "Key 11",
      valueLabel: "1.1K",
      percentLabel: "16.7%",
    });
  });

  test("uses the stable id fallback, filters zero slices, and keeps a single key at 100%", () => {
    const { result } = renderHook(() =>
      useApiKeyLookupCharts({
        chartData: chartData([
          {
            api_key_id: "abcdefgh-1234",
            name: "   ",
            requests: 4,
            tokens: 0,
          },
          {
            api_key_id: "zero-key",
            name: "Zero",
            requests: 0,
            tokens: 9,
          },
        ]),
        compact: false,
        isDark: false,
        t,
      }),
    );

    expect(result.current.apiKeyDistributionData).toEqual([{ name: "API Key abcdefgh", value: 4 }]);
    expect(result.current.apiKeyDistributionLegend).toEqual([
      expect.objectContaining({
        name: "API Key abcdefgh",
        valueLabel: "4",
        percentLabel: "100.0%",
      }),
    ]);

    act(() => result.current.setApiKeyMetric("tokens"));
    expect(result.current.apiKeyDistributionData).toEqual([{ name: "Zero", value: 9 }]);
  });

  test("treats a legacy response without api_key_distribution as empty", () => {
    const { result } = renderHook(() =>
      useApiKeyLookupCharts({ chartData: chartData(), compact: false, isDark: false, t }),
    );

    expect(result.current.apiKeyDistributionData).toEqual([]);
    expect(result.current.apiKeyDistributionLegend).toEqual([]);
  });
});
