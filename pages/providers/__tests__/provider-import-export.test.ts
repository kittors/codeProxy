import { describe, expect, test } from "vitest";
import type { OpenAIProvider, ProviderSimpleConfig } from "@code-proxy/api-client";
import { readRawRecord, withRawRecord } from "@code-proxy/api-client";
import {
  serializeOpenAIProvider,
  serializeOpenCodeGoKey,
  serializeProviderKey,
} from "@code-proxy/api-client/endpoints/helpers";
import {
  createProviderExportText,
  prepareProviderImport,
} from "@pages/providers/provider-import-export";

describe("provider import/export helpers", () => {
  test("creates stable export payloads for simple provider configs", () => {
    const text = createProviderExportText("codex", [
      {
        apiKey: " sk-b ",
        name: "Beta",
        headers: { Z: "2", A: "1" },
        excludedModels: ["gpt-4", "gpt-4", " claude-3 "],
        models: [
          { name: "gpt-4", alias: "gpt-4" },
          { name: "gpt-4" },
          { name: "claude-3", alias: "sonnet" },
        ],
      },
      {
        apiKey: "sk-a",
        name: "Alpha",
      },
    ] satisfies ProviderSimpleConfig[]);

    expect(JSON.parse(text)).toEqual({
      provider: "codex",
      version: 1,
      items: [
        { "api-key": "sk-a", name: "Alpha" },
        {
          "api-key": "sk-b",
          "excluded-models": ["claude-3", "gpt-4"],
          headers: { A: "1", Z: "2" },
          models: [{ alias: "sonnet", name: "claude-3" }, { name: "gpt-4" }],
          name: "Beta",
        },
      ],
    });
  });

  // OpenCode Go usage now authenticates with the API key, so an export must not
  // carry a dashboard session and an older export file must not bring one back.
  test("drops legacy OpenCode Go dashboard fields on export and import", () => {
    const text = createProviderExportText("opencode-go", [
      {
        apiKey: " go-key ",
        name: "OpenCode Go",
        models: [{ name: "deepseek-v4-pro" }],
        excludedModels: [" deepseek-v4-pro ", "*"],
        visionFallbackModel: " qwen3.5-plus ",
      },
    ] satisfies ProviderSimpleConfig[]);

    expect(JSON.parse(text)).toEqual({
      provider: "opencode-go",
      version: 1,
      items: [
        {
          "api-key": "go-key",
          "excluded-models": ["*"],
          name: "OpenCode Go",
          "vision-fallback-model": "qwen3.5-plus",
        },
      ],
    });

    const preview = prepareProviderImport(
      "opencode-go",
      JSON.stringify({
        provider: "opencode-go",
        items: [
          {
            "api-key": " go-key ",
            name: "OpenCode Go",
            models: [{ name: "deepseek-v4-pro" }],
            "excluded-models": ["deepseek-v4-pro", "*"],
            "vision-fallback-model": "qwen3.5-plus",
            "workspace-id": " wrk_123 ",
            "auth-cookie": " auth-token ",
          },
        ],
      }),
      [],
    );

    expect(preview.nextItems).toEqual([
      {
        apiKey: "go-key",
        name: "OpenCode Go",
        excludedModels: ["*"],
        visionFallbackModel: "qwen3.5-plus",
      },
    ]);
  });

  test("preserves Ollama Cloud provider fields without per-key model fields", () => {
    const text = createProviderExportText("ollama-cloud", [
      {
        apiKey: " ollama-key ",
        name: "Ollama Cloud",
        baseUrl: "https://ollama.com",
        models: [{ name: "gpt-oss:120b" }],
        excludedModels: [" gpt-oss:20b ", "*"],
      },
    ] satisfies ProviderSimpleConfig[]);

    expect(JSON.parse(text)).toEqual({
      provider: "ollama-cloud",
      version: 1,
      items: [
        {
          "api-key": "ollama-key",
          "base-url": "https://ollama.com",
          "excluded-models": ["*"],
          name: "Ollama Cloud",
        },
      ],
    });

    const preview = prepareProviderImport(
      "ollama-cloud",
      JSON.stringify({
        provider: "ollama-cloud",
        items: [
          {
            "api-key": " ollama-key ",
            name: "Ollama Cloud",
            models: [{ name: "gpt-oss:120b" }],
            "excluded-models": ["gpt-oss:20b", "*"],
          },
        ],
      }),
      [],
    );

    expect(preview.nextItems).toEqual([
      {
        apiKey: "ollama-key",
        name: "Ollama Cloud",
        baseUrl: "https://ollama.com",
        excludedModels: ["*"],
      },
    ]);
  });

  test("normalizes imports, reports diff counts, and removes duplicate OpenAI nested entries", () => {
    const current: OpenAIProvider[] = [
      {
        name: "OpenAI Main",
        baseUrl: "https://example.com/v1",
        apiKeyEntries: [{ apiKey: "sk-old" }],
        models: [{ name: "gpt-4.1" }],
      },
      {
        name: "Legacy",
        baseUrl: "https://legacy.example/v1",
        apiKeyEntries: [{ apiKey: "sk-legacy" }],
      },
    ];

    const preview = prepareProviderImport(
      "openai",
      JSON.stringify({
        provider: "openai",
        items: [
          {
            name: " OpenAI Main ",
            "base-url": "https://example.com/v1/",
            "api-key-entries": [
              { "api-key": "sk-old" },
              { "api-key": "sk-old", "proxy-url": "" },
              { "api-key": "sk-new", headers: { Z: "2", A: "1" } },
            ],
            models: [{ name: "gpt-4.1" }, { name: "gpt-4.1" }],
          },
          {
            name: "Fresh",
            disabled: true,
            "base-url": "https://fresh.example/v1",
            "api-key-entries": [{ "api-key": "sk-fresh" }],
          },
        ],
      }),
      current,
    );

    expect(preview.diff).toMatchObject({
      added: 1,
      removed: 1,
      changed: 1,
      unchanged: 0,
      duplicateEntriesRemoved: 2,
      hasChanges: true,
    });
    expect(preview.nextItems).toEqual([
      {
        name: "Fresh",
        disabled: true,
        baseUrl: "https://fresh.example/v1",
        apiKeyEntries: [{ apiKey: "sk-fresh" }],
      },
      {
        name: "OpenAI Main",
        baseUrl: "https://example.com/v1",
        apiKeyEntries: [{ apiKey: "sk-new", headers: { A: "1", Z: "2" } }, { apiKey: "sk-old" }],
        models: [{ name: "gpt-4.1" }],
      },
    ]);
  });
});

/*
 * 面板没有输入框的字段（priority、alpha-search、codex-tool-bridge……）：导出要带上，导入后整表保存也不能丢。
 * 当前条目用 withRawRecord 挂上后端记录，和 providersApi 的 getter 读出来的一样。
 */
describe("provider import/export keeps the fields the panel does not model", () => {
  const backendCodex = {
    "api-key": "sk-codex",
    name: "Codex Main",
    priority: 5,
    websockets: true,
    "alpha-search": true,
  };
  const loadedCodex = (): ProviderSimpleConfig =>
    withRawRecord(backendCodex, { apiKey: "sk-codex", name: "Codex Main" });

  test("an export carries them", () => {
    const [exported] = JSON.parse(createProviderExportText("codex", [loadedCodex()])).items;

    expect(exported).toEqual(backendCodex);
  });

  test("a new channel exports only what the panel models", () => {
    const [exported] = JSON.parse(
      createProviderExportText("codex", [{ apiKey: "sk-new", name: "New" }]),
    ).items;

    expect(exported).toEqual({ "api-key": "sk-new", name: "New" });
  });

  test("importing an unchanged export is not a change", () => {
    const text = createProviderExportText("codex", [loadedCodex()]);

    const preview = prepareProviderImport("codex", text, [loadedCodex()]);

    expect(preview.diff).toMatchObject({ unchanged: 1, changed: 0, hasChanges: false });
    expect(readRawRecord(preview.nextItems[0])).toEqual(backendCodex);
  });

  test("the order of the unmodeled fields, nested ones included, does not make a change", () => {
    const withCloak = withRawRecord(
      { "api-key": "sk-claude", priority: 1, cloak: { mode: "always", "strict-mode": true } },
      { apiKey: "sk-claude" },
    );
    const text = JSON.stringify({
      provider: "claude",
      items: [
        { cloak: { "strict-mode": true, mode: "always" }, priority: 1, "api-key": "sk-claude" },
      ],
    });

    expect(prepareProviderImport("claude", text, [withCloak]).diff.hasChanges).toBe(false);
  });

  test("the imported file's fields are what the next save writes, the current ones are not kept", () => {
    const text = JSON.stringify({
      provider: "codex",
      items: [{ "api-key": "sk-codex", name: "Codex Main", priority: 9, "alpha-search": false }],
    });

    const preview = prepareProviderImport("codex", text, [loadedCodex()]);

    expect(preview.diff).toMatchObject({ changed: 1, hasChanges: true });
    // 导入是「用文件替换当前配置」：文件里没有 websockets，导入后就没有它。
    expect(serializeProviderKey(preview.nextItems[0])).toEqual({
      "api-key": "sk-codex",
      name: "Codex Main",
      priority: 9,
      "alpha-search": false,
    });
  });

  test("a file written by hand with camelCase keys does not smuggle them in as extra fields", () => {
    const text = JSON.stringify({
      provider: "claude",
      items: [
        {
          apiKey: "sk-hand",
          baseUrl: "https://claude.example",
          excludedModels: ["claude-opus-4"],
          priority: 2,
        },
      ],
    });

    const [item] = prepareProviderImport("claude", text, []).nextItems;

    expect(serializeProviderKey(item)).toEqual({
      "api-key": "sk-hand",
      "base-url": "https://claude.example",
      "excluded-models": ["claude-opus-4"],
      priority: 2,
    });
  });

  test("the retired OpenCode Go dashboard keys stay out even when the record still has them", () => {
    const text = JSON.stringify({
      provider: "opencode-go",
      items: [
        {
          "api-key": "go-key",
          "workspace-id": "wrk_123",
          "auth-cookie": "auth-token",
          priority: 3,
          "codex-tool-bridge": true,
        },
      ],
    });
    const stillHasThem = withRawRecord(
      {
        "api-key": "go-key",
        "workspace-id": "wrk_123",
        "auth-cookie": "auth-token",
        priority: 3,
        "codex-tool-bridge": true,
      },
      { apiKey: "go-key" },
    );

    const [imported] = prepareProviderImport("opencode-go", text, []).nextItems;
    const [exported] = JSON.parse(createProviderExportText("opencode-go", [stillHasThem])).items;

    expect(serializeOpenCodeGoKey(imported)).toEqual({
      "api-key": "go-key",
      priority: 3,
      "codex-tool-bridge": true,
    });
    expect(exported).toEqual({ "api-key": "go-key", priority: 3, "codex-tool-bridge": true });
  });

  test("an OpenAI-compatible provider keeps codex-tool-bridge through export and import", () => {
    const backend = {
      name: "Relay",
      "base-url": "https://relay.example/v1",
      "codex-tool-bridge": true,
      "api-key-entries": [{ "api-key": "sk-relay" }],
    };
    const loaded: OpenAIProvider = withRawRecord(backend, {
      name: "Relay",
      baseUrl: "https://relay.example/v1",
      apiKeyEntries: [{ apiKey: "sk-relay" }],
    });

    const text = createProviderExportText("openai", [loaded]);
    const preview = prepareProviderImport("openai", text, [loaded]);

    expect(JSON.parse(text).items[0]).toEqual(backend);
    expect(preview.diff.hasChanges).toBe(false);
    expect(serializeOpenAIProvider(preview.nextItems[0])).toEqual(backend);
  });
});
