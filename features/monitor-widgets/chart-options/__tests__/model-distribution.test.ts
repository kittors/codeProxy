import { describe, expect, test } from "vitest";
import { CHART_CATEGORICAL } from "@code-proxy/ui";
import {
  buildModelDistributionData,
  createModelDistributionOption,
  modelDistributionColors,
} from "../model-distribution";

describe("buildModelDistributionData", () => {
  test("keeps the first five models and groups the rest as other", () => {
    expect(
      buildModelDistributionData({
        items: [
          { model: "m1", requests: 10, tokens: 100 },
          { model: "m2", requests: 9, tokens: 90 },
          { model: "m3", requests: 8, tokens: 80 },
          { model: "m4", requests: 7, tokens: 70 },
          { model: "m5", requests: 6, tokens: 60 },
          { model: "m6", requests: 5, tokens: 50 },
          { model: "m7", requests: 4, tokens: 40 },
        ],
        metric: "requests",
        otherLabel: "其他",
      }),
    ).toEqual([
      { name: "m1", value: 10 },
      { name: "m2", value: 9 },
      { name: "m3", value: 8 },
      { name: "m4", value: 7 },
      { name: "m5", value: 6 },
      { name: "其他", value: 9 },
    ]);
  });
});

describe("modelDistributionColors", () => {
  const data = buildModelDistributionData({
    items: Array.from({ length: 7 }, (_, index) => ({
      model: `m${index + 1}`,
      requests: 10 - index,
      tokens: 0,
    })),
    metric: "requests",
    otherLabel: "其他",
  });

  test("slices follow the categorical palette and the folded tail stays neutral", () => {
    const colors = modelDistributionColors(data, false, "其他");

    expect(colors.slice(0, 5)).toEqual(CHART_CATEGORICAL.slice(0, 5));
    // 「其他」是若干小项的合计，用中性浅灰，不占一个分类色。
    expect(colors[5]).toMatch(/^rgba\(\d+, \d+, \d+, 0\.45\)$/);
    expect(CHART_CATEGORICAL).not.toContain(colors[5]);
  });

  test("the chart and its legend read the same colours", () => {
    const option = createModelDistributionOption({ isDark: false, data, otherLabel: "其他" });

    expect(option.color).toEqual(modelDistributionColors(data, false, "其他"));
  });

  test("a model that happens to be named like the other label keeps its colour when it is not last", () => {
    const colors = modelDistributionColors(
      [
        { name: "其他", value: 5 },
        { name: "m2", value: 3 },
      ],
      false,
      "其他",
    );
    expect(colors).toEqual(CHART_CATEGORICAL.slice(0, 2));
  });
});
