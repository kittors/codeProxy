import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { getModelVendorKey, ModelOwnerTag, ModelTag, ModelVendorTile, modelVendorBrand } from "./index";

const NEUTRAL_TAG = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

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

  test("every vendor gets the same neutral tag: the brand colour lives only in the logo", () => {
    // 克制界面：标签不再按厂商品牌色整块上淡底、加描边（一屏七八种颜色就是「色太杂」）。
    // 认厂商只靠 logo，所以无论认不认得出厂商，标签外观都一样，也不再带品牌 CSS 变量。
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
      expect(brand.className).toBe(NEUTRAL_TAG);
      expect(brand.style).toEqual({});
    }
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

  test("the rendered tag is a neutral capsule without an outline or a brand palette", () => {
    render(createElement(ModelTag, { id: "claude-sonnet-4-5", size: "sm" }));
    const tag = screen.getByText("claude-sonnet-4-5").parentElement as HTMLElement;
    expect(tag.className).toContain("bg-ink/[0.05]");
    expect(tag.className).not.toMatch(/(?:^|\s)border(?:\s|$)/);
    expect(tag.style.getPropertyValue("--brand-l")).toBe("");
    // 旧的手写 Tailwind 色板（orange-50、emerald-700……）也不会回来。
    expect(tag.className).not.toMatch(/(?:orange|emerald|teal|cyan|lime|slate)-\d/);

    render(createElement(ModelOwnerTag, { owner: "anthropic", withLogo: true }));
    const owner = screen.getByText("anthropic").parentElement as HTMLElement;
    expect(owner.className).toContain("bg-ink/[0.05]");
    expect(owner.querySelectorAll("img").length).toBeGreaterThan(0);
  });

  test("the vendor mark is just the logo, with no tinted or outlined block behind it", () => {
    // 卡片角落里不放带底色的图标块：只剩 logo（没有 logo 时是弱化墨色的首字母）。
    const { container } = render(createElement(ModelVendorTile, { modelId: "gpt-5.4" }));
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.className).not.toMatch(/(?:^|\s)(?:border|bg-[^\s]+|rounded-[^\s]+)(?:\s|$)/);
    expect(tile.querySelectorAll("img").length).toBeGreaterThan(0);

    const { container: fallback } = render(createElement(ModelVendorTile, { modelId: "yi-lightning" }));
    expect(fallback.textContent).toBe("Y");
    expect((fallback.firstElementChild as HTMLElement).className).toContain("text-ink-3");
  });
});
