import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { vendorBrand } from "@code-proxy/assets";
import { describe, expect, test } from "vitest";
import { getModelVendorKey, ModelOwnerTag, ModelTag, ModelVendorTile, modelVendorBrand } from "./index";

const NEUTRAL_TAG = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";
const BRAND_TINT =
  "colorful:bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] colorful:text-[var(--brand-text)] colorful:dark:bg-[color-mix(in_oklab,var(--brand)_18%,transparent)]";
const brandOf = (id: string) => (modelVendorBrand(id).style as Record<string, string>)["--brand-l"];

describe("model tags", () => {
  test("groups requested model families into stable vendor families", () => {
    expect(getModelVendorKey("claude-opus-4-8")).toBe("claude");
    expect(getModelVendorKey("gpt-5.4")).toBe("gpt");
    expect(getModelVendorKey("codex-mini")).toBe("codex");
    expect(getModelVendorKey("openai-realtime")).toBe("openai");
    expect(getModelVendorKey("cline-pass/deepseek-v4-flash")).toBe("cline");
    expect(getModelVendorKey("deepseek-v4-flash")).toBe("deepseek");
    expect(getModelVendorKey("hy3-preview")).toBe("hunyuan");
    expect(getModelVendorKey("hunyuan-turbos")).toBe("hunyuan");
    expect(getModelVendorKey("tencent/hunyuan-large")).toBe("hunyuan");
    expect(getModelVendorKey("llama-3.3-70b")).toBe("llama");
    expect(getModelVendorKey("mistral-large-2")).toBe("mistral");
  });

  test("every tag keeps the neutral base; the colourful palette layers the vendor's brand tint", () => {
    // 简约风格下标签是同一种中性淡底（认厂商只靠 logo）；多彩风格（colorful: 变体）叠一层品牌淡底。
    const ids = [
      "claude-opus-4-8",
      "gpt-5.4",
      "codex-mini",
      "gemini-3-pro",
      "qwen3-max",
      "llama-3.3-70b",
      "some-private-model",
      "claude",
      "other",
    ];
    for (const id of ids) {
      const brand = modelVendorBrand(id);
      expect(brand.className).toContain(NEUTRAL_TAG);
      expect(brand.className).toContain(BRAND_TINT);
    }
  });

  test("the brand tint comes from the brand table, one colour per family", () => {
    // 颜色只从品牌表来：断言对照 vendorBrand()，品牌色微调时这里不用跟着改。
    expect(brandOf("claude-opus-4-8")).toBe(vendorBrand("claude")?.color);
    expect(brandOf("gpt-5.4")).toBe(vendorBrand("openai")?.color);
    expect(brandOf("codex-mini")).toBe(vendorBrand("codex")?.color);
    // 同一家的不同写法（含路由前缀）同色；厂商 key 和模型 ID 走同一张表。
    expect(brandOf("tencent/hunyuan-large")).toBe(brandOf("hunyuan-turbos"));
    expect(brandOf("claude")).toBe(brandOf("claude-sonnet-4-5"));
    // 认不出的厂商不带品牌变量，多彩风格下也回落到中性（墨色）。
    expect(brandOf("some-private-model")).toBeUndefined();
    expect(brandOf("other")).toBeUndefined();
  });

  test("recognised vendors show their logo; unrecognised ones show only the name", () => {
    const { container: known } = render(createElement(ModelTag, { id: "claude-sonnet-4-5", size: "sm" }));
    expect(known.querySelectorAll("img").length).toBeGreaterThan(0);

    // 同一家的不同写法（含路由前缀）也认得出 logo。
    const { container: prefixed } = render(createElement(ModelTag, { id: "tencent/hunyuan-large" }));
    expect(prefixed.querySelectorAll("img").length).toBeGreaterThan(0);

    const { container: unknown } = render(createElement(ModelTag, { id: "yi-lightning" }));
    expect(unknown.querySelector("img")).toBeNull();
    expect(screen.getByText("yi-lightning")).toBeInTheDocument();
  });

  test("the rendered tag is an outline-free neutral capsule that carries the brand variables", () => {
    render(createElement(ModelTag, { id: "claude-sonnet-4-5", size: "sm" }));
    const tag = screen.getByText("claude-sonnet-4-5").parentElement as HTMLElement;
    expect(tag.className).toContain("bg-ink/[0.05]");
    expect(tag.className).toContain(BRAND_TINT);
    expect(tag.className).not.toMatch(/(?:^|\s)border(?:\s|$)/);
    expect(tag.style.getPropertyValue("--brand-l")).toBe(vendorBrand("claude")?.color);
    // 旧的手写 Tailwind 色板（orange-50、emerald-700……）不会回来：颜色只走品牌变量。
    expect(tag.className).not.toMatch(/(?:orange|emerald|teal|cyan|lime|slate)-\d/);

    render(createElement(ModelOwnerTag, { owner: "anthropic", withLogo: true }));
    const owner = screen.getByText("anthropic").parentElement as HTMLElement;
    expect(owner.className).toContain("bg-ink/[0.05]");
    expect(owner.className).toContain(BRAND_TINT);
    expect(owner.querySelectorAll("img").length).toBeGreaterThan(0);
  });

  test("the vendor mark is just the logo; colourful icons put it on a brand-tinted tile", () => {
    // 基础类里没有底色块（图标着色为单色时只剩 logo，没有 logo 时是弱化墨色的首字母）；
    // 图标着色为多彩时（icon-hue: 变体）垫一块品牌淡底的图标块。任何时候都不描边。
    const { container } = render(createElement(ModelVendorTile, { modelId: "gpt-5.4" }));
    const tile = container.firstElementChild as HTMLElement;
    const baseClasses = tile.className
      .split(/\s+/)
      .filter((cls) => !cls.includes(":"))
      .join(" ");
    expect(baseClasses).not.toMatch(/(?:^|\s)(?:border|bg-[^\s]+|rounded-[^\s]+)(?:\s|$)/);
    expect(tile.className).toContain("icon-hue:bg-[color-mix(in_oklab,var(--brand)_10%,transparent)]");
    expect(tile.className).not.toMatch(/(?:^|\s)(?:[\w-]+:)*border(?:-[^\s]+)?(?:\s|$)/);
    expect(tile.style.getPropertyValue("--brand-l")).toBe(vendorBrand("openai")?.color);
    expect(tile.querySelectorAll("img").length).toBeGreaterThan(0);

    const { container: fallback } = render(createElement(ModelVendorTile, { modelId: "yi-lightning" }));
    expect(fallback.textContent).toBe("Y");
    expect((fallback.firstElementChild as HTMLElement).className).toContain("text-ink-3");
  });
});
