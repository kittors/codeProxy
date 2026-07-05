import { describe, expect, test } from "vitest";
import { buildModelDistributionData } from "../model-distribution";

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
