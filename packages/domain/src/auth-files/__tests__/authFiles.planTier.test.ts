import { describe, expect, test } from "vitest";
import type { AuthFileItem } from "../types";
import { planTierOf, resolveFileType } from "../authFiles";

describe("planTierOf", () => {
  test("ranks each vendor's plans from free to flagship", () => {
    // Codex：plus < pro < pro 5x < pro 20x
    expect(planTierOf("plus")).toBe("entry");
    expect(planTierOf("pro")).toBe("pro");
    expect(planTierOf("chatgptpro")).toBe("pro");
    expect(planTierOf("pro_5x")).toBe("max");
    expect(planTierOf("pro-20x")).toBe("ultra");
    // Claude Code：max < max 5x < max 20x
    expect(planTierOf("max")).toBe("pro");
    expect(planTierOf("max_5x")).toBe("max");
    expect(planTierOf("max-20x")).toBe("ultra");
    // Grok：supergrok < supergrok heavy（三种写法同档）
    expect(planTierOf("supergrok")).toBe("pro");
    for (const heavy of ["supergrok-heavy", "supergrok_heavy", "supergrokheavy"]) {
      expect(planTierOf(heavy)).toBe("ultra");
    }
    // 组织套餐
    expect(planTierOf("team")).toBe("pro");
    expect(planTierOf("business")).toBe("pro");
    expect(planTierOf("enterprise")).toBe("ultra");
  });

  test("normalises case and whitespace like the badge label does", () => {
    expect(planTierOf(" PRO_20X ")).toBe("ultra");
    expect(planTierOf("Max_5x")).toBe("max");
  });

  test("keeps free, empty and unknown plans quiet", () => {
    expect(planTierOf("free")).toBe("free");
    expect(planTierOf("unknown")).toBe("free");
    expect(planTierOf("")).toBe("free");
    expect(planTierOf(null)).toBe("free");
    expect(planTierOf(undefined)).toBe("free");
    // 认不出的付费名按入门档：宁可低调，也不把未知套餐渲染成旗舰。
    expect(planTierOf("mystery-plan")).toBe("entry");
  });
});

describe("resolveFileType known providers", () => {
  const file = (fields: Partial<AuthFileItem>) => ({ name: "", ...fields }) as AuthFileItem;

  test("prefers the longest known provider key", () => {
    expect(resolveFileType(file({ type: "gemini-cli" }))).toBe("gemini-cli");
    expect(resolveFileType(file({ type: "gemini-cli-oauth" }))).toBe("gemini-cli");
    expect(resolveFileType(file({ type: "gemini" }))).toBe("gemini");
    expect(resolveFileType(file({ provider: "antigravity" }))).toBe("antigravity");
  });

  test("falls back to the file name, then to the raw type", () => {
    expect(resolveFileType(file({ name: "codex-alice@example.com.json" }))).toBe("codex");
    expect(resolveFileType(file({ name: "vertex.json" }))).toBe("vertex");
    expect(resolveFileType(file({ type: "XAI" }))).toBe("xai");
    expect(resolveFileType(file({}))).toBe("unknown");
  });
});
