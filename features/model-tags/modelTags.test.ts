import { describe, expect, test } from "vitest";
import { getModelVendorColor, getModelVendorKey } from "./index";

describe("model tags", () => {
  test("groups requested model families into stable color families", () => {
    expect(getModelVendorKey("claude-opus-4-8")).toBe("claude");
    expect(getModelVendorKey("gpt-5.4")).toBe("gpt");
    expect(getModelVendorKey("codex-mini")).toBe("codex");
    expect(getModelVendorKey("openai-realtime")).toBe("openai");
    expect(getModelVendorKey("deepseek-v4-flash")).toBe("deepseek");

    expect(getModelVendorColor("claude-opus-4-8").text).toContain("orange");
    expect(getModelVendorColor("gpt-5.4").text).toContain("emerald");
    expect(getModelVendorColor("codex-mini").text).toContain("emerald");
    expect(getModelVendorColor("openai-realtime").text).toContain("emerald");
    expect(getModelVendorColor("deepseek-v4-flash").text).toContain("cyan");
  });
});
