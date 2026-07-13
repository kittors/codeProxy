import { describe, expect, test } from "vitest";
import { getModelVendorColor, getModelVendorKey } from "./index";

describe("model tags", () => {
  test("groups requested model families into stable color families", () => {
    expect(getModelVendorKey("claude-opus-4-8")).toBe("claude");
    expect(getModelVendorKey("gpt-5.4")).toBe("gpt");
    expect(getModelVendorKey("codex-mini")).toBe("codex");
    expect(getModelVendorKey("openai-realtime")).toBe("openai");
    expect(getModelVendorKey("cline-pass/deepseek-v4-flash")).toBe("cline");
    expect(getModelVendorKey("deepseek-v4-flash")).toBe("deepseek");
    expect(getModelVendorKey("hy3-preview")).toBe("hunyuan");
    expect(getModelVendorKey("hunyuan-turbos")).toBe("hunyuan");
    expect(getModelVendorKey("tencent/hunyuan-large")).toBe("hunyuan");

    expect(getModelVendorColor("claude-opus-4-8").text).toContain("orange");
    expect(getModelVendorColor("gpt-5.4").text).toContain("emerald");
    expect(getModelVendorColor("codex-mini").text).toContain("emerald");
    expect(getModelVendorColor("openai-realtime").text).toContain("emerald");
    expect(getModelVendorColor("cline-pass/deepseek-v4-flash").text).toContain("teal");
    expect(getModelVendorColor("deepseek-v4-flash").text).toContain("cyan");
    expect(getModelVendorColor("hy3-preview").text).toContain("blue");
  });
});
