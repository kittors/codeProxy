import { beforeEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "../../client/client";
import {
  ccSwitchImportConfigsApi,
  normalizeCcSwitchImportConfigs,
} from "@code-proxy/api-client/endpoints/ccswitch-import-configs";

vi.mock("../../client/client", () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

const mockedApiPut = vi.mocked(apiClient.put);

describe("ccSwitchImportConfigsApi", () => {
  beforeEach(() => {
    mockedApiPut.mockReset();
    mockedApiPut.mockResolvedValue(undefined);
  });

  test("serializes model mappings for database-backed persistence", async () => {
    await ccSwitchImportConfigsApi.replace([
      {
        id: "kimi-code",
        clientType: "claude",
        providerName: "Kimi code",
        note: "kimicode",
        defaultModel: "kimi-k2.5",
        allowedChannelGroups: ["kimicode"],
        routePath: "/kimicode/cs_kimi",
        endpointPath: "/v1",
        usageAutoInterval: 30,
        apiKeyField: "ANTHROPIC_API_KEY",
        modelMappings: [
          { role: "main", requestModel: "kimi-k2.5", targetModel: "kimi-k2.5" },
          { role: "haiku", requestModel: "claude-3-5-haiku", targetModel: "kimi-k2.5" },
        ],
      },
    ]);

    expect(mockedApiPut).toHaveBeenCalledWith("/ccswitch-import-configs", [
      expect.objectContaining({
        id: "kimi-code",
        "client-type": "claude",
        "route-path": "/kimicode/cs_kimi",
        "model-mappings": [
          { role: "main", "request-model": "kimi-k2.5", "target-model": "kimi-k2.5" },
          {
            role: "haiku",
            "request-model": "claude-3-5-haiku",
            "target-model": "kimi-k2.5",
          },
        ],
      }),
    ]);
  });

  test("serializes Codex model catalog for database-backed persistence", async () => {
    await ccSwitchImportConfigsApi.replace([
      {
        id: "codex-deepseek",
        clientType: "codex",
        providerName: "Pro pool + DeepSeek",
        note: "",
        defaultModel: "gpt-5.5",
        allowedChannelGroups: ["pro"],
        routePath: "/pro/cs_deepseek",
        endpointPath: "/v1",
        usageAutoInterval: 30,
        modelMappings: [
          { requestModel: "gpt-5.5", targetModel: "gpt-5.5", contextWindow: 272000 },
          { requestModel: "deepseek-v4-flash", targetModel: "deepseek-chat" },
        ],
        codexModelCatalogFilename: "cc-switch-model-catalog.json",
        codexModelCatalog: {
          models: [
            {
              slug: "gpt-5.5",
              display_name: "gpt-5.5",
              default_reasoning_level: "medium",
              supported_reasoning_levels: [
                { effort: "low", description: "Fast" },
                { effort: "medium", description: "Balanced" },
                { effort: "high", description: "Deep" },
                { effort: "xhigh", description: "Extra deep" },
              ],
            },
            { slug: "deepseek-v4-flash", display_name: "deepseek-v4-flash" },
          ],
        },
      },
    ]);

    expect(mockedApiPut).toHaveBeenCalledWith("/ccswitch-import-configs", [
      expect.objectContaining({
        id: "codex-deepseek",
        "client-type": "codex",
        "model-mappings": [
          {
            "request-model": "gpt-5.5",
            "target-model": "gpt-5.5",
            "context-window": 272000,
          },
          { "request-model": "deepseek-v4-flash", "target-model": "deepseek-chat" },
        ],
        "codex-model-catalog-filename": "cc-switch-model-catalog.json",
        "codex-model-catalog": expect.objectContaining({
          models: expect.arrayContaining([
            expect.objectContaining({
              slug: "gpt-5.5",
              default_reasoning_level: "medium",
              supported_reasoning_levels: [
                { effort: "low", description: "Fast" },
                { effort: "medium", description: "Balanced" },
                { effort: "high", description: "Deep" },
                { effort: "xhigh", description: "Extra deep" },
              ],
            }),
            expect.objectContaining({ slug: "deepseek-v4-flash" }),
          ]),
        }),
      }),
    ]);
  });

  test("normalizes backend Codex model catalog fields", () => {
    const configs = normalizeCcSwitchImportConfigs([
      {
        id: "codex-deepseek",
        "client-type": "codex",
        "provider-name": "Pro pool + DeepSeek",
        "default-model": "gpt-5.5",
        "model-mappings": [
          { "request-model": "gpt-5.5", "target-model": "gpt-5.5", "context-window": 272000 },
          { "request-model": "deepseek-v4-flash", "target-model": "deepseek-chat" },
        ],
        "allowed-channel-groups": ["pro"],
        "route-path": "/pro/cs_deepseek",
        "endpoint-path": "/v1",
        "usage-auto-interval": 30,
        "codex-model-catalog-filename": "cc-switch-model-catalog.json",
        "codex-model-catalog": {
          models: [
            {
              model: "gpt-5.5",
              display_name: "gpt-5.5",
              default_reasoning_level: "medium",
              supported_reasoning_levels: ["low", "medium", "high", "xhigh"],
            },
            { slug: "deepseek-v4-flash", display_name: "deepseek-v4-flash" },
          ],
        },
      },
    ]);

    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      codexModelCatalogFilename: "cc-switch-model-catalog.json",
      modelMappings: [
        { requestModel: "gpt-5.5", targetModel: "gpt-5.5", contextWindow: 272000 },
        { requestModel: "deepseek-v4-flash", targetModel: "deepseek-chat" },
      ],
      codexModelCatalog: {
        models: [
          {
            model: "gpt-5.5",
            default_reasoning_level: "medium",
            supported_reasoning_levels: ["low", "medium", "high", "xhigh"],
          },
          { slug: "deepseek-v4-flash" },
        ],
      },
    });
  });
});
