import { describe, expect, test } from "vitest";
import type { OpenAIProvider, ProviderSimpleConfig } from "@code-proxy/api-client";
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

  test("preserves OpenCode Go dashboard usage fields during import and export", () => {
    const text = createProviderExportText("opencode-go", [
      {
        apiKey: " go-key ",
        name: "OpenCode Go",
        excludedModels: [" deepseek-v4-pro "],
        visionFallbackModel: " qwen3.5-plus ",
        workspaceId: " wrk_123 ",
        authCookie: " auth-token ",
      },
    ] satisfies ProviderSimpleConfig[]);

    expect(JSON.parse(text)).toEqual({
      provider: "opencode-go",
      version: 1,
      items: [
        {
          "api-key": "go-key",
          "excluded-models": ["deepseek-v4-pro"],
          "auth-cookie": "auth-token",
          name: "OpenCode Go",
          "vision-fallback-model": "qwen3.5-plus",
          "workspace-id": "wrk_123",
        },
      ],
    });

    const preview = prepareProviderImport("opencode-go", text, []);

    expect(preview.nextItems).toEqual([
      {
        apiKey: "go-key",
        name: "OpenCode Go",
        excludedModels: ["deepseek-v4-pro"],
        visionFallbackModel: "qwen3.5-plus",
        workspaceId: "wrk_123",
        authCookie: "auth-token",
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
