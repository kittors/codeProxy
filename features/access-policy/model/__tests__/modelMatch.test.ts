import { describe, expect, test } from "vitest";
import {
  isStarOnlyPattern,
  matchesAnyModelPattern,
  matchingCatalogModels,
  modelPatternMatches,
  normalizeModelName,
  normalizeModelPattern,
} from "../modelMatch";

// 与后端 internal/quota/model_match_test.go 同一组用例：两边对同一个模型名必须得出同样的结论。
describe("model pattern matching mirrors the gateway", () => {
  test.each([
    ["claude-opus-4-5", "claude-opus-4-5", true],
    ["claude-opus-4-5", "CLAUDE-OPUS-4-5(high)", true],
    ["claude-opus-*", "claude-opus-4-1", true],
    ["claude-opus-*", "claude-sonnet-4-5", false],
    ["*opus*", "claude-opus-4-5-20251101", true],
    ["gpt-5*", "gpt-5", true],
    ["gpt-5*", "gpt-4o", false],
    ["gpt-oss:20b", "ollama/gpt-oss:20b", true],
    ["ollama/gpt-oss:20b", "gpt-oss:20b", false],
    ["ollama/*", "ollama/gpt-oss:20b", true],
    ["claude-opus-4-5", "claude-opus-4-5-thinking", false],
    ["", "gpt-5", false],
    ["gpt-5", "", false],
    ["a**b", "axxb", true],
    ["*ab*cd", "xxabyycd", true],
    ["*ab*cd", "xxabyyc", false],
    ["a*b*c", "abbbc", true],
    ["a*b*c", "acb", false],
  ])("%s ~ %s → %s", (pattern, model, expected) => {
    expect(modelPatternMatches(pattern, model)).toBe(expected);
  });

  test("strips thinking suffixes and context markers but keeps other brackets", () => {
    expect(normalizeModelName("Claude-Opus-4-5(HIGH)")).toBe("claude-opus-4-5");
    expect(normalizeModelName("deepseek-v4-flash[1M]")).toBe("deepseek-v4-flash");
    expect(normalizeModelName("model[128K](8192)")).toBe("model");
    expect(normalizeModelName("model[beta]")).toBe("model[beta]");
    expect(normalizeModelPattern("  GPT-5** ")).toBe("gpt-5*");
  });

  test("rejects a lone star and previews catalog matches", () => {
    expect(isStarOnlyPattern(" ** ")).toBe(true);
    expect(isStarOnlyPattern("claude-*")).toBe(false);
    expect(matchesAnyModelPattern(["x", "gpt-*"], "gpt-4o")).toBe(true);
    expect(matchesAnyModelPattern([], "gpt-4o")).toBe(false);
    expect(
      matchingCatalogModels(["claude-opus-*"], ["claude-opus-4-5", "claude-sonnet-4-5", "claude-opus-4-1"]),
    ).toEqual(["claude-opus-4-5", "claude-opus-4-1"]);
  });
});
