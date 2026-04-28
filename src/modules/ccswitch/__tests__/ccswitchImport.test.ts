import { describe, expect, test } from "vitest";
import {
  buildCcSwitchImportUrl,
  pickCcSwitchDefaultModel,
} from "@/modules/ccswitch/ccswitchImport";

const decodeUsageScript = (url: string) => {
  const encoded = new URL(url).searchParams.get("usageScript");
  expect(encoded).toBeTruthy();
  return atob(encoded!);
};

describe("ccswitchImport", () => {
  test("builds a Codex provider deeplink with endpoint, model, and usage script", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/",
      clientType: "codex",
      providerName: "Relay Provider",
      model: "gpt-5.3-codex",
    });

    const parsed = new URL(url);
    expect(parsed.protocol).toBe("ccswitch:");
    expect(parsed.hostname).toBe("v1");
    expect(parsed.pathname).toBe("/import");
    expect(parsed.searchParams.get("resource")).toBe("provider");
    expect(parsed.searchParams.get("app")).toBe("codex");
    expect(parsed.searchParams.get("name")).toBe("Relay Provider");
    expect(parsed.searchParams.get("homepage")).toBe("https://relay.example.com");
    expect(parsed.searchParams.get("endpoint")).toBe("https://relay.example.com");
    expect(parsed.searchParams.get("apiKey")).toBe("sk-test-key");
    expect(parsed.searchParams.get("icon")).toBe("openai");
    expect(parsed.searchParams.get("model")).toBe("gpt-5.3-codex");
    expect(parsed.searchParams.get("configFormat")).toBe("json");
    expect(parsed.searchParams.get("usageEnabled")).toBe("true");
    expect(parsed.searchParams.get("usageAutoInterval")).toBe("30");

    const usageScript = decodeUsageScript(url);
    expect(usageScript).toContain("{{baseUrl}}/v0/management/public/usage");
    expect(usageScript).toContain('method: "POST"');
    expect(usageScript).toContain('api_key: "{{apiKey}}"');
  });

  test("selects a client-specific default model from available models", () => {
    const models = ["gemini-2.5-pro", "gpt-4.1", "claude-sonnet-4-5", "gpt-5.3-codex"];

    expect(pickCcSwitchDefaultModel("claude", models)).toBe("claude-sonnet-4-5");
    expect(pickCcSwitchDefaultModel("codex", models)).toBe("gpt-5.3-codex");
    expect(pickCcSwitchDefaultModel("gemini", models)).toBe("gemini-2.5-pro");
  });
});
