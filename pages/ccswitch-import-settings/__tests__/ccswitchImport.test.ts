import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildCcSwitchCodexModelCatalog,
  buildCcSwitchCodexModelCatalogJson,
  buildCcSwitchImportUrl,
  CC_SWITCH_CODEX_API_FORMAT,
  CC_SWITCH_CODEX_MODEL_CATALOG_FILENAME,
  normalizeCcSwitchCodexInlineModelCatalog,
  openCcSwitchImportUrl,
  pickCcSwitchDefaultModel,
  resolveCcSwitchImportConfig,
} from "@code-proxy/domain/ccswitch/ccswitchImport";
import { buildCcSwitchImportUrlForConfig } from "@code-proxy/domain/ccswitch/ccswitchImportLinks";

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

const decodeConfig = (url: string) => {
  const encoded = new URL(url).searchParams.get("config");
  expect(encoded).toBeTruthy();
  const binary = atob(encoded!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
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
        { role: "fable", requestModel: "claude-fable-router", targetModel: "claude-fable-5" },
      ],
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("model")).toBe("claude-main-router");
    expect(parsed.searchParams.get("haikuModel")).toBe("claude-haiku-router");
    expect(parsed.searchParams.get("sonnetModel")).toBe("claude-sonnet-router");
    expect(parsed.searchParams.get("opusModel")).toBe("claude-opus-router");
    expect(parsed.searchParams.get("fableModel")).toBe("claude-fable-router");
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
    expect(parsed.searchParams.get("apiFormat")).toBe(CC_SWITCH_CODEX_API_FORMAT);
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
    expect(usageScript).toContain("今日用量");
    expect(usageScript).toContain("used: calls");
    expect(usageScript).toContain("remaining: null");
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
    expect(usageScript).toContain("Today's usage");
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
    expect(decodeUsageScript(url)).toContain("Today's usage");
  });

  test("inlines the saved Codex model catalog when building a preset import link", () => {
    const url = buildCcSwitchImportUrlForConfig({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/",
      config: {
        id: "codex-pro",
        clientType: "codex",
        providerName: "Relay Pro",
        note: "",
        defaultModel: "gpt-5.5",
        modelMappings: [
          { requestModel: "deepseek-v4-flash", targetModel: "deepseek-chat" },
          { requestModel: "glm-4.6", targetModel: "glm-4.6-upstream" },
        ],
        allowedChannelGroups: ["pro"],
        routePath: "/pro/cs_test",
        endpointPath: "/v1",
        usageAutoInterval: 30,
        codexModelCatalogFilename: "cc-switch-model-catalog.json",
        codexModelCatalog: {
          models: [
            {
              slug: "gpt-5.5",
              display_name: "GPT 5.5",
              context_window: 512000,
              default_reasoning_level: "medium",
              supported_reasoning_levels: [
                { effort: "low", description: "Fast" },
                { effort: "medium", description: "Balanced" },
                { effort: "high", description: "Deep" },
                { effort: "xhigh", description: "Extra deep" },
              ],
              model_messages: { context_window: 512000 },
            },
            {
              slug: "deepseek-v4-flash",
              display_name: "DeepSeek V4 Flash",
              context_window: 256000,
            },
          ],
        },
      },
      configs: [],
      usageLanguage: "en",
    });

    const config = decodeConfig(url);
    expect(config.modelCatalog.models).toEqual([
      {
        slug: "gpt-5.5",
        model: "gpt-5.5",
        display_name: "GPT 5.5",
        context_window: 512000,
        default_reasoning_level: "medium",
        supported_reasoning_levels: [
          { effort: "low", description: "Fast" },
          { effort: "medium", description: "Balanced" },
          { effort: "high", description: "Deep" },
          { effort: "xhigh", description: "Extra deep" },
        ],
        model_messages: { context_window: 512000 },
      },
      {
        slug: "deepseek-v4-flash",
        model: "deepseek-v4-flash",
        display_name: "DeepSeek V4 Flash",
        context_window: 256000,
      },
      {
        model: "glm-4.6",
        defaultReasoningLevel: "medium",
        supportedReasoningLevels: [
          { effort: "low", description: "Fast responses with lighter reasoning" },
          {
            effort: "medium",
            description: "Balances speed and reasoning depth for everyday tasks",
          },
          { effort: "high", description: "Greater reasoning depth for complex problems" },
          { effort: "xhigh", description: "Extra high reasoning depth for complex problems" },
        ],
      },
    ]);
    expect(config.config).toContain(
      `model_catalog_json = "${CC_SWITCH_CODEX_MODEL_CATALOG_FILENAME}"`,
    );
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
    expect(decodeConfig(url)).toMatchObject({
      auth: { OPENAI_API_KEY: "sk-test-key" },
      apiFormat: CC_SWITCH_CODEX_API_FORMAT,
      modelCatalog: {
        models: [
          expect.objectContaining({
            model: "gpt-6-router",
            defaultReasoningLevel: "medium",
            supportedReasoningLevels: [
              { effort: "low", description: "Fast responses with lighter reasoning" },
              {
                effort: "medium",
                description: "Balances speed and reasoning depth for everyday tasks",
              },
              { effort: "high", description: "Greater reasoning depth for complex problems" },
              { effort: "xhigh", description: "Extra high reasoning depth for complex problems" },
            ],
          }),
          expect.objectContaining({ model: "kimi-k2" }),
        ],
      },
    });
    expect(decodeConfig(url).config).toContain(
      `model_catalog_json = "${CC_SWITCH_CODEX_MODEL_CATALOG_FILENAME}"`,
    );
  });

  test("builds a Codex model catalog from request-side mapped model names", () => {
    const catalog = buildCcSwitchCodexModelCatalog([
      { model: "gpt-5.5" },
      { model: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash", contextWindow: 256000 },
      { model: "DeepSeek-V4-Flash" },
      { model: "deepseek-v4-pro" },
    ]);

    expect(catalog.models.map((model) => model.slug)).toEqual([
      "gpt-5.5",
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
    expect(catalog.models.map((model) => model.model)).toEqual([
      "gpt-5.5",
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
    expect(catalog.models[1]).toMatchObject({
      display_name: "DeepSeek V4 Flash",
      context_window: 256000,
      max_context_window: 256000,
      default_reasoning_level: "medium",
      supported_reasoning_levels: [
        { effort: "low", description: "Fast responses with lighter reasoning" },
        { effort: "medium", description: "Balances speed and reasoning depth for everyday tasks" },
        { effort: "high", description: "Greater reasoning depth for complex problems" },
        { effort: "xhigh", description: "Extra high reasoning depth for complex problems" },
      ],
      visibility: "list",
      supported_in_api: true,
      supports_reasoning_summaries: true,
      support_verbosity: true,
      model_messages: {
        context_window: 256000,
        max_context_window: 256000,
        input_modalities: ["text", "image"],
      },
    });
  });

  test("uses GPT-5.6 capabilities without widening unknown model reasoning", () => {
    const catalog = buildCcSwitchCodexModelCatalog([
      { model: "gpt-5.6-sol" },
      { model: "gpt-5.6-terra", contextWindow: 400000 },
      { model: "gpt-5.6-luna", contextWindow: 2000000 },
      { model: "deepseek-v4-flash" },
    ]);

    for (const model of catalog.models.slice(0, 3)) {
      expect(model.max_context_window).toBe(1050000);
      expect(model.supported_reasoning_levels.map((level) => level.effort)).toEqual([
        "low",
        "medium",
        "high",
        "xhigh",
        "max",
        "ultra",
      ]);
    }
    expect(catalog.models[0]?.context_window).toBe(1050000);
    expect(catalog.models[1]?.context_window).toBe(400000);
    expect(catalog.models[2]?.context_window).toBe(1050000);
    expect(catalog.models[3]?.supported_reasoning_levels.map((level) => level.effort)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
  });

  test("normalizes camelCase explicit catalog fields for deep-link round trips", () => {
    const catalog = normalizeCcSwitchCodexInlineModelCatalog({
      models: [
        {
          slug: "gpt-5.6-sol",
          model: "gpt-5.6-sol",
          contextWindow: 900000,
          maxContextWindow: 1050000,
          defaultReasoningLevel: "ultra",
          supportedReasoningLevels: ["max", "ultra"],
          modelMessages: { contextWindow: 900000, maxContextWindow: 1050000 },
        },
      ],
    });

    expect(catalog?.models[0]).toMatchObject({
      context_window: 900000,
      max_context_window: 1050000,
      default_reasoning_level: "ultra",
      supported_reasoning_levels: ["max", "ultra"],
      model_messages: { context_window: 900000, max_context_window: 1050000 },
    });
    expect(catalog?.models[0]).not.toHaveProperty("contextWindow");
    expect(catalog?.models[0]).not.toHaveProperty("maxContextWindow");
  });

  test("serializes a Codex model catalog JSON that preserves all model IDs", () => {
    const catalog = JSON.parse(
      buildCcSwitchCodexModelCatalogJson([
        { model: "gpt-5.5" },
        { model: "deepseek-v4-flash" },
        { model: "deepseek-v4-pro" },
      ]),
    );

    expect(catalog.models.map((model: { slug: string }) => model.slug)).toEqual([
      "gpt-5.5",
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
    expect(catalog.models[0]).toHaveProperty("base_instructions");
    expect(catalog.models[0]).toHaveProperty("model_messages");
    expect(catalog.models[0]).toMatchObject({
      default_reasoning_level: "medium",
      supported_reasoning_levels: [
        { effort: "low", description: "Fast responses with lighter reasoning" },
        { effort: "medium", description: "Balances speed and reasoning depth for everyday tasks" },
        { effort: "high", description: "Greater reasoning depth for complex problems" },
        { effort: "xhigh", description: "Extra high reasoning depth for complex problems" },
      ],
    });
  });

  test("allows a generated Codex catalog entry to narrow reasoning levels explicitly", () => {
    const catalog = buildCcSwitchCodexModelCatalog([
      {
        model: "thinking-toggle-model",
        defaultReasoningLevel: "high",
        supportedReasoningLevels: ["none", "high"],
      },
    ]);

    expect(catalog.models[0]).toMatchObject({
      slug: "thinking-toggle-model",
      default_reasoning_level: "high",
      supported_reasoning_levels: [
        { effort: "none", description: "none" },
        { effort: "high", description: "Greater reasoning depth for complex problems" },
      ],
    });
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

  test("derives model_reasoning_effort from the catalog entry's default_reasoning_level", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/",
      clientType: "codex",
      providerName: "Relay Provider",
      model: "deepseek-v4-pro",
      codexModelCatalog: {
        models: [
          {
            slug: "deepseek-v4-pro",
            model: "deepseek-v4-pro",
            default_reasoning_level: "medium",
            supported_reasoning_levels: [
              { effort: "low" },
              { effort: "medium" },
              { effort: "high" },
              { effort: "xhigh" },
            ],
          },
          {
            slug: "gpt-5.5",
            model: "gpt-5.5",
            default_reasoning_level: "low",
          },
        ],
      },
    });

    expect(decodeConfig(url).config).toContain(`model_reasoning_effort = "medium"`);
    expect(decodeConfig(url).config).toContain(`model = "deepseek-v4-pro"`);
  });

  test("derives model_reasoning_effort from camelCase defaultReasoningLevel when snake_case is absent", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/",
      clientType: "codex",
      providerName: "Relay Provider",
      model: "gpt-5.5",
      codexModelCatalog: {
        models: [
          {
            model: "gpt-5.5",
            defaultReasoningLevel: "low",
            supportedReasoningLevels: ["low", "medium", "high", "xhigh"],
          },
        ],
      },
    });

    expect(decodeConfig(url).config).toContain(`model_reasoning_effort = "low"`);
  });

  test("exports normalized GPT-5.6 catalog metadata through the CC Switch deep link", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test",
      baseUrl: "https://relay.example.com",
      clientType: "codex",
      enabled: true,
      providerName: "Relay GPT-5.6",
      model: "gpt-5.6-sol",
      codexModelCatalog: {
        models: [
          {
            slug: "gpt-5.6-sol",
            model: "gpt-5.6-sol",
            contextWindow: 1050000,
            maxContextWindow: 1050000,
            defaultReasoningLevel: "ultra",
            supportedReasoningLevels: [
              { effort: "max", description: "Maximum" },
              { effort: "ultra", description: "Delegated" },
            ],
          },
        ],
      },
    });

    const decoded = decodeConfig(url);
    expect(decoded.config).toContain(`model_reasoning_effort = "ultra"`);
    expect(decoded.modelCatalog.models[0]).toMatchObject({
      context_window: 1050000,
      max_context_window: 1050000,
      default_reasoning_level: "ultra",
      supported_reasoning_levels: [
        { effort: "max", description: "Maximum" },
        { effort: "ultra", description: "Delegated" },
      ],
    });
  });

  test("falls back to model_reasoning_effort = high when no matching catalog entry exists", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/",
      clientType: "codex",
      providerName: "Relay Provider",
      model: "gpt-5.5",
      codexModelCatalog: {
        models: [
          {
            model: "deepseek-v4-pro",
            default_reasoning_level: "medium",
          },
        ],
      },
    });

    // The selected model is not in the explicit catalog, so the configured
    // effort falls back to the legacy "high" default even though a separate
    // entry carries reasoning metadata.
    expect(decodeConfig(url).config).toContain(`model_reasoning_effort = "high"`);
  });

  test("falls back to model_reasoning_effort = high when catalog is empty for backward compatibility", () => {
    const url = buildCcSwitchImportUrl({
      apiKey: "sk-test-key",
      baseUrl: "https://relay.example.com/",
      clientType: "codex",
      providerName: "Relay Provider",
      model: "gpt-5.5",
    });

    // No codexModelCatalog passed: the selected model is auto-synthesized
    // into the catalog (so the catalog pointer is present) but the effort
    // falls back to the legacy "high" default to preserve prior behavior.
    expect(decodeConfig(url).config).toContain(`model_reasoning_effort = "high"`);
    expect(decodeConfig(url).config).toContain(
      `model_catalog_json = "${CC_SWITCH_CODEX_MODEL_CATALOG_FILENAME}"`,
    );
  });
});
