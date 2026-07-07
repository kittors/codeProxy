import { describe, expect, test } from "vitest";
import { getEffectiveProviderModels } from "@pages/providers/provider-model-access";

describe("getEffectiveProviderModels", () => {
  const catalog = [
    { id: "qwen3.7-max", owned_by: "opencode" },
    { id: "kimi-k2.7-code", owned_by: "opencode" },
  ];

  test("does not fallback to catalog for disabled or no-access configs", () => {
    expect(
      getEffectiveProviderModels(
        "opencode-go",
        { apiKey: "sk", disabled: true },
        catalog,
      ),
    ).toEqual([]);
    expect(
      getEffectiveProviderModels(
        "opencode-go",
        { apiKey: "sk", excludedModels: ["*"] },
        catalog,
      ),
    ).toEqual([]);
  });

  test("uses catalog only when no explicit allowlist or deny-all marker exists", () => {
    expect(
      getEffectiveProviderModels("opencode-go", { apiKey: "sk" }, catalog),
    ).toEqual([{ name: "qwen3.7-max" }, { name: "kimi-k2.7-code" }]);
  });
});
