import { describe, expect, test } from "vitest";
import {
  buildOpenAIDraft,
  buildProviderKeyDraft,
  buildProviderModelsEndpoint,
  maskApiKey,
  normalizeDiscoveredModels,
} from "@pages/providers/providers-helpers";
import {
  buildCandidateUsageSourceIds,
  normalizeUsageSourceId,
} from "@code-proxy/domain";

describe("providers helpers", () => {
  test("masks api keys consistently for provider cards", () => {
    expect(maskApiKey("")).toBe("--");
    expect(maskApiKey("sk-short12")).toBe("sk***12");
    expect(maskApiKey("sk-openai-provider-1234567890")).toBe("sk-ope***7890");
  });

  test("builds provider key draft from existing provider config", () => {
    const draft = buildProviderKeyDraft({
      name: "Claude Main",
      apiKey: "sk-ant-123456",
      prefix: "claude-main",
      baseUrl: "https://claude.example.com",
      proxyUrl: "https://proxy.example.com",
      proxyId: "hk",
      excludedModels: ["claude-3-opus", "claude-3-haiku"],
      headers: { "x-test": "1" },
      models: [
        {
          name: "claude-3-opus",
          alias: "opus",
          priority: 10,
          testModel: "probe-model",
        },
      ],
      skipAnthropicProcessing: true,
    });

    expect(draft.name).toBe("Claude Main");
    expect(draft.apiKey).toBe("sk-ant-123456");
    expect(draft.proxyId).toBe("hk");
    expect(draft.excludedModelsText).toBe("claude-3-opus\nclaude-3-haiku");
    expect(draft.headersEntries).toEqual([
      { id: expect.any(String), key: "x-test", value: "1" },
    ]);
    expect(draft.modelEntries).toEqual([
      {
        id: expect.any(String),
        name: "claude-3-opus",
        alias: "opus",
        priorityText: "10",
        testModel: "probe-model",
      },
    ]);
    expect(draft.skipAnthropicProcessing).toBe(true);
  });

  test("builds openai draft and preserves api key entries for editing", () => {
    const draft = buildOpenAIDraft({
      name: "OpenAI Main",
      disabled: true,
      baseUrl: "https://example.com/v1",
      prefix: "oa",
      priority: 5,
      testModel: "gpt-4.1",
      headers: { "x-provider": "openai" },
      apiKeyEntries: [
        {
          apiKey: "sk-openai-provider-1234567890",
          proxyUrl: "https://proxy.example.com",
          proxyId: "hk",
          headers: { "x-entry": "edge" },
        },
      ],
      models: [{ name: "gpt-4.1", alias: "primary" }],
    });

    expect(draft.name).toBe("OpenAI Main");
    expect(draft.disabled).toBe(true);
    expect(draft.baseUrl).toBe("https://example.com/v1");
    expect(draft.priorityText).toBe("5");
    expect(draft.headersEntries).toEqual([
      { id: expect.any(String), key: "x-provider", value: "openai" },
    ]);
    expect(draft.apiKeyEntries).toEqual([
      {
        id: expect.stringContaining("sk-openai-provider-1234567890"),
        apiKey: "sk-openai-provider-1234567890",
        disabled: false,
        proxyUrl: "https://proxy.example.com",
        proxyId: "hk",
        headersEntries: [
          { id: expect.any(String), key: "x-entry", value: "edge" },
        ],
      },
    ]);
  });

  test("normalizes discovered models and de-duplicates case-insensitively", () => {
    expect(
      normalizeDiscoveredModels({
        data: [
          { id: "gpt-4.1", owned_by: "openai" },
          { id: "GPT-4.1", owned_by: "duplicate" },
          { name: "gpt-4o-mini" },
          { id: "" },
          null,
        ],
      }),
    ).toEqual([{ id: "gpt-4.1", owned_by: "openai" }, { id: "gpt-4o-mini" }]);
  });

  test("normalizes Claude/Codex payloads via models, items, and slug fields", () => {
    expect(
      normalizeDiscoveredModels({
        models: [{ id: "claude-sonnet-4-5", display_name: "Sonnet" }],
      }),
    ).toEqual([{ id: "claude-sonnet-4-5" }]);
    expect(
      normalizeDiscoveredModels({
        items: [{ slug: "gpt-5.1-codex", title: "Codex" }],
      }),
    ).toEqual([{ id: "gpt-5.1-codex" }]);
  });

  test("builds Claude and Codex /models endpoints with defaults", () => {
    expect(buildProviderModelsEndpoint("claude", "")).toBe(
      "https://api.anthropic.com/v1/models",
    );
    expect(buildProviderModelsEndpoint("claude", "https://gw.example/v1")).toBe(
      "https://gw.example/v1/models",
    );
    expect(buildProviderModelsEndpoint("codex", "")).toBe(
      "https://api.openai.com/v1/models",
    );
    expect(
      buildProviderModelsEndpoint("codex", "https://api.openai.com/v1"),
    ).toBe("https://api.openai.com/v1/models");
  });

  test("normalizes discovered models from a JSON string payload", () => {
    expect(
      normalizeDiscoveredModels(
        JSON.stringify({
          object: "list",
          data: [
            { id: "qwen3.5-plus", object: "model", owned_by: "opencode" },
            { id: "deepseek-v4-flash", object: "model", owned_by: "opencode" },
          ],
        }),
      ),
    ).toEqual([
      { id: "qwen3.5-plus", owned_by: "opencode" },
      { id: "deepseek-v4-flash", owned_by: "opencode" },
    ]);
  });

  test("normalizes usage sources and matches raw plus masked api key candidates", () => {
    const masked = maskApiKey("sk-openai-provider-1234567890");
    const normalized = normalizeUsageSourceId(
      "sk-openai-provider-1234567890",
      maskApiKey,
    );
    const candidates = buildCandidateUsageSourceIds({
      apiKey: "sk-openai-provider-1234567890",
      prefix: "oa",
      masker: maskApiKey,
    });

    expect(normalized).toMatch(/^k:/);
    expect(candidates).toContain("t:oa");
    expect(candidates).toContain(`m:${masked}`);
    expect(candidates.some((entry) => entry === normalized)).toBe(true);
    expect(normalizeUsageSourceId(masked, maskApiKey)).toBe(`m:${masked}`);
  });
});
