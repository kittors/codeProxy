import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { vendorBrand } from "@code-proxy/assets";
import { AuthFilePlanBadge } from "../components/AuthFilePlanBadge";

const renderBadge = (provider: string, planType: string) => {
  render(<AuthFilePlanBadge provider={provider} planType={planType} />);
  return screen.getByTestId("auth-file-plan-badge");
};

describe("AuthFilePlanBadge", () => {
  afterEach(() => cleanup());

  test.each([
    ["codex", "pro_20x", "ultra", "PRO 20X"],
    ["claude", "max_5x", "max", "MAX 5X"],
    ["codex", "plus", "entry", "PLUS"],
    ["codex", "free", "free", "FREE"],
    ["antigravity", "pro", "pro", "PRO"],
  ])("%s %s reads as the %s tier and keeps its plan name", (provider, plan, tier, label) => {
    const badge = renderBadge(provider, plan);
    expect(badge).toHaveAttribute("data-plan-tier", tier);
    expect(badge).toHaveTextContent(label);
  });

  test("the same tier takes a different brand colour per vendor", () => {
    const brandOf = (provider: string) => {
      const color = renderBadge(provider, "pro").style.getPropertyValue("--brand-l");
      cleanup();
      return color;
    };
    const colors = {
      codex: brandOf("codex"),
      claude: brandOf("claude"),
      antigravity: brandOf("antigravity"),
      "gemini-cli": brandOf("gemini-cli"),
    };
    // 颜色只从品牌表来：对照 vendorBrand()，品牌色微调时这里不用跟着改。
    for (const [provider, color] of Object.entries(colors)) {
      expect(color).toBe(vendorBrand(provider)?.color);
    }
    expect(new Set(Object.values(colors)).size).toBe(4);
  });

  test("an unrecognised vendor stays neutral instead of borrowing a brand", () => {
    const badge = renderBadge("some-private-provider", "pro");
    expect(badge.style.getPropertyValue("--brand-l")).toBe("");
    expect(badge).toHaveAttribute("data-plan-tier", "pro");
  });

  test("the old monochrome membership classes are gone", () => {
    for (const plan of ["pro_20x", "max_5x", "pro", "plus", "free"]) {
      const classes = renderBadge("codex", plan).className.split(/\s+/);
      for (const legacy of ["bg-ink", "bg-ink-2", "ring-ink-3", "bg-selected", "bg-hover"]) {
        expect(classes).not.toContain(legacy);
      }
      cleanup();
    }
  });
});
