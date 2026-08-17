import { describe, expect, test } from "vitest";
import { isDistinctModelIdentity, isSameModelIdentity } from "../modelIdentity";

describe("isSameModelIdentity", () => {
  test.each([
    ["deepseek-v4-flash:0731", "deepseek-v4-flash:0731"],
    ["ollama/deepseek-v4-flash:0731", "deepseek-v4-flash:0731"],
    ["deepseek-v4-flash:0731", "ollama/deepseek-v4-flash:0731"],
    ["cline-pass/deepseek-v4-flash", "deepseek-v4-flash"],
    ["group/ollama/gpt-oss:20b", "gpt-oss:20b"],
    ["Ollama/GPT-OSS:20B", "gpt-oss:20b"],
  ])("treats %s and %s as one model", (requested, upstream) => {
    expect(isSameModelIdentity(requested, upstream)).toBe(true);
  });

  test.each([
    ["fast", "claude-sonnet-4"],
    ["gpt-oss:20b", "gpt-oss:120b"],
    ["xdeepseek-v4-flash", "deepseek-v4-flash"],
    ["deepseek-v4-flash", ""],
    ["", "deepseek-v4-flash"],
  ])("keeps %s and %s apart", (requested, upstream) => {
    expect(isSameModelIdentity(requested, upstream)).toBe(false);
  });
});

describe("isDistinctModelIdentity", () => {
  test("is false when either side is missing", () => {
    expect(isDistinctModelIdentity("deepseek-v4-flash", "")).toBe(false);
    expect(isDistinctModelIdentity("  ", "deepseek-v4-flash")).toBe(false);
  });

  test("is true only for a genuinely different upstream model", () => {
    expect(isDistinctModelIdentity("ollama/gpt-oss:20b", "gpt-oss:20b")).toBe(false);
    expect(isDistinctModelIdentity("fast", "claude-sonnet-4")).toBe(true);
  });
});
