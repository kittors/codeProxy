import { describe, expect, test } from "vitest";
import {
  calculateCost,
  filterUsageByTimeRange,
  normalizeUsageSourceId,
  type ModelPrice,
  type UsageDetail,
} from "@/utils/usage";

describe("usage utils", () => {
  test("normalizeUsageSourceId fingerprints raw keys instead of leaking them", () => {
    const source = normalizeUsageSourceId("sk-test-secret-1234567890");
    expect(source.startsWith("k:")).toBe(true);
    expect(source).not.toContain("sk-test-secret-1234567890");
  });

  test("calculateCost excludes cached tokens from prompt billing", () => {
    const detail: UsageDetail = {
      timestamp: new Date().toISOString(),
      source: "k:test",
      auth_index: 1,
      failed: false,
      __modelName: "gpt-4.1",
      tokens: {
        input_tokens: 1000,
        output_tokens: 500,
        reasoning_tokens: 0,
        cached_tokens: 400,
        total_tokens: 1500,
      },
    };
    const prices: Record<string, ModelPrice> = {
      "gpt-4.1": {
        prompt: 10,
        completion: 20,
        cache: 1,
      },
    };

    expect(calculateCost(detail, prices)).toBeCloseTo(0.0164, 6);
  });

  test("calculateCost supports per-call pricing for invocation billed models", () => {
    const detail = {
      timestamp: "2026-04-25T10:00:00Z",
      source: "image-provider",
      auth_index: 0,
      failed: false,
      __modelName: "gpt-image-2",
      tokens: {
        input_tokens: 0,
        output_tokens: 0,
        reasoning_tokens: 0,
        cached_tokens: 0,
        total_tokens: 0,
      },
    };
    const prices: Record<string, ModelPrice> = {
      "gpt-image-2": {
        mode: "call",
        prompt: 0,
        completion: 0,
        cache: 0,
        perCall: 0.04,
      },
    };

    expect(calculateCost(detail, prices)).toBeCloseTo(0.04, 6);
  });

  test("filterUsageByTimeRange keeps only recent details", () => {
    const now = Date.now();
    const recent = new Date(now - 60 * 60 * 1000).toISOString();
    const old = new Date(now - 9 * 24 * 60 * 60 * 1000).toISOString();

    const usageData = {
      apis: {
        "/v1/chat/completions": {
          models: {
            "gpt-4.1": {
              details: [
                {
                  timestamp: recent,
                  source: "sk-recent",
                  auth_index: 1,
                  failed: false,
                  tokens: {
                    input_tokens: 1,
                    output_tokens: 2,
                    reasoning_tokens: 0,
                    cached_tokens: 0,
                    total_tokens: 3,
                  },
                },
                {
                  timestamp: old,
                  source: "sk-old",
                  auth_index: 1,
                  failed: false,
                  tokens: {
                    input_tokens: 1,
                    output_tokens: 2,
                    reasoning_tokens: 0,
                    cached_tokens: 0,
                    total_tokens: 3,
                  },
                },
              ],
            },
          },
        },
      },
    };

    const filtered = filterUsageByTimeRange(usageData, "7d", now);
    const details = (filtered.apis["/v1/chat/completions"].models["gpt-4.1"].details ??
      []) as Array<{
      timestamp: string;
    }>;

    expect(details).toHaveLength(1);
    expect(details[0]?.timestamp).toBe(recent);
  });
});
