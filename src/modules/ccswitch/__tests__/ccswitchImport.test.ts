import { describe, expect, test } from "vitest";
import {
  buildCcSwitchImportUrl,
  pickCcSwitchDefaultModel,
  resolveCcSwitchImportConfig,
} from "@/modules/ccswitch/ccswitchImport";

const decodeUsageScript = (url: string) => {
  const encoded = new URL(url).searchParams.get("usageScript");
  expect(encoded).toBeTruthy();
  return atob(encoded!);
};

describe("ccswitchImport", () => {
  test("builds a Claude provider deeplink with the Anthropic API key auth field", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-ant-test-key",
      baseUrl: "https://relay.example.com/",
      clientType: "claude",
      providerName: "Relay Claude",
      model: "claude-sonnet-4-5",
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("app")).toBe("claude");
    expect(parsed.searchParams.get("apiKey")).toBe("sk-ant-test-key");
    expect(parsed.searchParams.get("apiKeyField")).toBe("ANTHROPIC_API_KEY");
  });

  test("uses the configured Claude auth field in provider deeplinks", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-ant-test-key",
      baseUrl: "https://relay.example.com/",
      clientType: "claude",
      providerName: "Relay Claude",
      settings: {
        claude: { apiKeyField: "ANTHROPIC_AUTH_TOKEN" },
      },
    });

    expect(new URL(url).searchParams.get("apiKeyField")).toBe("ANTHROPIC_AUTH_TOKEN");
  });

  test("builds a Codex provider deeplink with endpoint, model, and usage script", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/",
      clientType: "codex",
      providerName: "Relay Provider",
      model: "gpt-5.5",
    });

    const parsed = new URL(url);
    expect(parsed.protocol).toBe("ccswitch:");
    expect(parsed.hostname).toBe("v1");
    expect(parsed.pathname).toBe("/import");
    expect(parsed.searchParams.get("resource")).toBe("provider");
    expect(parsed.searchParams.get("app")).toBe("codex");
    expect(parsed.searchParams.get("name")).toBe("Relay Provider");
    expect(parsed.searchParams.get("homepage")).toBe("https://relay.example.com");
    expect(parsed.searchParams.get("endpoint")).toBe("https://relay.example.com/v1");
    expect(parsed.searchParams.get("apiKey")).toBe("sk-test-key");
    expect(parsed.searchParams.get("icon")).toBe("codex");
    expect(parsed.searchParams.get("model")).toBe("gpt-5.5");
    expect(parsed.searchParams.get("configFormat")).toBe("json");
    expect(parsed.searchParams.get("usageEnabled")).toBe("true");
    expect(parsed.searchParams.get("usageBaseUrl")).toBe("https://relay.example.com");
    expect(parsed.searchParams.get("usageAutoInterval")).toBe("30");
    expect(parsed.searchParams.get("enabled")).toBe("true");

    const usageScript = decodeUsageScript(url);
    expect(usageScript).toContain("{{baseUrl}}/v0/management/public/usage");
    expect(usageScript).toContain('method: "POST"');
    expect(usageScript).toContain('api_key: "{{apiKey}}"');
  });

  test("builds a provider deeplink for a selected channel group route and enabled state", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/team-a",
      clientType: "codex",
      providerName: "Team A Codex",
      model: "gpt-5.4",
      enabled: false,
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("homepage")).toBe("https://relay.example.com/team-a");
    expect(parsed.searchParams.get("endpoint")).toBe("https://relay.example.com/team-a/v1");
    expect(parsed.searchParams.get("name")).toBe("Team A Codex");
    expect(parsed.searchParams.get("model")).toBe("gpt-5.4");
    expect(parsed.searchParams.get("enabled")).toBe("false");
  });

  test("selects a client-specific default model from available models", () => {
    const models = ["gemini-2.5-pro", "gpt-4.1", "claude-sonnet-4-5", "gpt-5.3-codex"];

    expect(pickCcSwitchDefaultModel("claude", models)).toBe("claude-sonnet-4-5");
    expect(pickCcSwitchDefaultModel("codex", models)).toBe("gpt-5.5");
    expect(pickCcSwitchDefaultModel("gemini", models)).toBe("gemini-2.5-pro");
  });

  test("resolves import settings overrides for endpoint path and default model", () => {
    const config = resolveCcSwitchImportConfig({
      baseUrl: "https://relay.example.com/api/",
      clientType: "codex",
      models: ["gpt-5.3-codex"],
      settings: {
        codex: { endpointPath: "/openai/v1", defaultModel: "gpt-5.6" },
      },
    });

    expect(config.homepage).toBe("https://relay.example.com/api");
    expect(config.endpoint).toBe("https://relay.example.com/api/openai/v1");
    expect(config.model).toBe("gpt-5.6");
  });
});
