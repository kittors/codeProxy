import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildCcSwitchImportUrl,
  openCcSwitchImportUrl,
  pickCcSwitchDefaultModel,
  resolveCcSwitchImportConfig,
} from "@/modules/ccswitch/ccswitchImport";
import { buildCcSwitchImportUrlForConfig } from "@/modules/ccswitch/ccswitchImportLinks";

const decodeUsageScript = (url: string) => {
  const encoded = new URL(url).searchParams.get("usageScript");
  expect(encoded).toBeTruthy();
  const binary = atob(encoded!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
};

describe("ccswitchImport", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  test("builds a Claude provider deeplink with main and family model mappings", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-ant-test-key",
      baseUrl: "https://relay.example.com/pro",
      clientType: "claude",
      providerName: "Mapped Claude",
      modelMappings: [
        { role: "main", requestModel: "claude-main-router", targetModel: "claude-sonnet-4-5" },
        { role: "haiku", requestModel: "claude-haiku-router", targetModel: "claude-haiku-4-5" },
        { role: "sonnet", requestModel: "claude-sonnet-router", targetModel: "claude-sonnet-4-5" },
        { role: "opus", requestModel: "claude-opus-router", targetModel: "claude-opus-4-1" },
      ],
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("model")).toBe("claude-main-router");
    expect(parsed.searchParams.get("haikuModel")).toBe("claude-haiku-router");
    expect(parsed.searchParams.get("sonnetModel")).toBe("claude-sonnet-router");
    expect(parsed.searchParams.get("opusModel")).toBe("claude-opus-router");
  });

  test("keeps legacy Claude role placeholders compatible when building deeplinks", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-ant-test-key",
      baseUrl: "https://relay.example.com/pro",
      clientType: "claude",
      providerName: "Legacy Claude",
      modelMappings: [
        { role: "main", requestModel: "main", targetModel: "claude-sonnet-4-5" },
        { role: "haiku", requestModel: "haiku", targetModel: "claude-haiku-4-5" },
      ],
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("model")).toBe("claude-sonnet-4-5");
    expect(parsed.searchParams.get("haikuModel")).toBe("claude-haiku-4-5");
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
    expect(usageScript).toContain("{{baseUrl}}/v0/management/public/usage/summary");
    expect(usageScript).toContain('method: "POST"');
    expect(usageScript).toContain('api_key: "{{apiKey}}"');
    expect(usageScript).toContain("days: 1");
    expect(usageScript).toContain("total_calls");
    expect(usageScript).toContain("quota_cost");
    expect(usageScript).toContain("今日已经使用");
    expect(usageScript).toContain("used: undefined");
    expect(usageScript).toContain("remaining: calls");
    expect(usageScript).toContain('unit: "次"');
    expect(usageScript).toContain('extra: "今日消耗：" + cost.toFixed(4) + "$"');
    expect(usageScript).not.toContain("额度");
  });

  test("builds an English usage script when the management UI language is English", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/",
      clientType: "codex",
      providerName: "Relay Provider",
      model: "gpt-5.5",
      usageLanguage: "en",
    });

    const usageScript = decodeUsageScript(url);
    expect(usageScript).toContain("Used today");
    expect(usageScript).toContain("API Key not found");
    expect(usageScript).toContain('unit: "times"');
    expect(usageScript).toContain('extra: "Today\'s cost:" + cost.toFixed(4) + "$"');
    expect(usageScript).not.toContain("今日用量");
    expect(usageScript).not.toContain("今日消耗");
  });

  test("passes provider notes in CC Switch deeplinks", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/",
      clientType: "codex",
      providerName: "Relay Provider",
      note: "Pro pool remark",
      model: "gpt-5.5",
    });

    expect(new URL(url).searchParams.get("notes")).toBe("Pro pool remark");
  });

  test("passes CC Switch import config remarks as provider notes", () => {
    const url = buildCcSwitchImportUrlForConfig({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/",
      config: {
        id: "codex-pro",
        clientType: "codex",
        providerName: "Relay Pro",
        note: "Pro pool remark",
        defaultModel: "gpt-5.5",
        modelMappings: [],
        allowedChannelGroups: ["pro"],
        routePath: "/pro/cs_test",
        endpointPath: "/v1",
        usageAutoInterval: 30,
      },
      configs: [],
      usageLanguage: "en",
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("notes")).toBe("Pro pool remark");
    expect(decodeUsageScript(url)).toContain("Used today");
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

  test("uses separate usageBaseUrl when explicitly provided with a routePath baseUrl", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/team-a",
      usageBaseUrl: "https://relay.example.com",
      clientType: "codex",
      providerName: "Separated Usage",
      model: "gpt-5.4",
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("homepage")).toBe("https://relay.example.com/team-a");
    expect(parsed.searchParams.get("endpoint")).toBe("https://relay.example.com/team-a/v1");
    expect(parsed.searchParams.get("usageBaseUrl")).toBe("https://relay.example.com");

    const usageScript = decodeUsageScript(url);
    expect(usageScript).toContain("{{baseUrl}}/v0/management/public/usage/summary");
  });

  test("uses the request model name from generic model mappings as the provider default", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/pro",
      clientType: "codex",
      providerName: "Mapped Codex",
      modelMappings: [
        { requestModel: "gpt-6-router", targetModel: "deepseek-v4-flash" },
        { requestModel: "kimi-k2", targetModel: "kimi-k2" },
      ],
      settings: {
        codex: { defaultModel: "" },
      },
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("model")).toBe("gpt-6-router");
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

  test("does not report the protocol unavailable from retained browser focus alone", () => {
    vi.useFakeTimers();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const onProtocolUnavailable = vi.fn();

    openCcSwitchImportUrl("ccswitch://v1/import?resource=provider", { onProtocolUnavailable });
    vi.advanceTimersByTime(10_000);

    expect(openSpy).toHaveBeenCalledWith("ccswitch://v1/import?resource=provider", "_self");
    expect(onProtocolUnavailable).not.toHaveBeenCalled();
  });
});
