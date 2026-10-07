import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { vendorBrand } from "@code-proxy/assets";
import { getModelVendorKey, ModelTag, modelVendorBrand } from "./index";

const brandOf = (modelIdOrVendorKey: string) =>
  (modelVendorBrand(modelIdOrVendorKey).style as Record<string, string | undefined>)["--brand-l"];

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
  });

  test("tags take their colour from the vendor's brand, one colour per family", () => {
    // 颜色只从品牌表来：断言对照 vendorBrand()，品牌色微调时这里不用跟着改。
    expect(brandOf("claude-opus-4-8")).toBe(vendorBrand("claude")?.color);
    expect(brandOf("gpt-5.4")).toBe(vendorBrand("openai")?.color);
    expect(brandOf("openai-realtime")).toBe(vendorBrand("openai")?.color);
    expect(brandOf("codex-mini")).toBe(vendorBrand("codex")?.color);
    expect(brandOf("cline-pass/deepseek-v4-flash")).toBe(vendorBrand("cline")?.color);
    expect(brandOf("deepseek-v4-flash")).toBe(vendorBrand("deepseek")?.color);
    // 同一家的不同写法（含路由前缀）同色。
    expect(brandOf("hy3-preview")).toBe(vendorBrand("hunyuan")?.color);
    expect(brandOf("tencent/hunyuan-large")).toBe(brandOf("hunyuan-turbos"));
    // 厂商 key 和模型 ID 走同一张表。
    expect(brandOf("claude")).toBe(brandOf("claude-sonnet-4-5"));

    // 不同厂商一眼分得开。
    const families = ["claude-opus-4-8", "gpt-5.4", "codex-mini", "gemini-3-pro", "qwen3-max"];
    expect(new Set(families.map(brandOf)).size).toBe(families.length);
  });

  test("unrecognised vendors fall back to a neutral tag", () => {
    expect(brandOf("llama-3.3-70b")).toBeUndefined();
    expect(brandOf("some-private-model")).toBeUndefined();
    expect(brandOf("other")).toBeUndefined();
  });

  test("the rendered tag carries the brand variables", () => {
    render(createElement(ModelTag, { id: "claude-sonnet-4-5", size: "sm" }));
    const tag = screen.getByText("claude-sonnet-4-5").parentElement as HTMLElement;
    expect(tag.style.getPropertyValue("--brand-l")).toBe(vendorBrand("claude")?.color);
    // 旧的手写 Tailwind 色板（orange-50、emerald-700……）不再出现。
    expect(tag.className).not.toMatch(/(?:orange|emerald|teal|cyan|lime|slate)-\d/);
  });
});
