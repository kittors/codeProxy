import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const putMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: getMock,
    put: putMock,
    delete: deleteMock,
  },
}));

describe("providersApi OpenCode Go", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    deleteMock.mockReset();
  });

  test("normalizes OpenCode Go configs without exposing Base URL", async () => {
    const { providersApi } = await import("@/lib/http/apis/providers");
    getMock.mockResolvedValue({
      "opencode-go-api-key": [
        {
          name: "OpenCode Go",
          "api-key": "sk-go",
          prefix: "go",
          "base-url": "https://should-not-surface.example",
          "proxy-id": "hk",
          "proxy-url": "http://127.0.0.1:7890",
          headers: { "X-Test": "yes" },
          models: [{ name: "should-not-surface" }],
          "excluded-models": ["disabled-model"],
        },
      ],
    });

    const result = await providersApi.getOpenCodeGoConfigs();

    expect(getMock).toHaveBeenCalledWith("/opencode-go-api-key");
    expect(result).toEqual([
      {
        name: "OpenCode Go",
        apiKey: "sk-go",
        prefix: "go",
        proxyId: "hk",
        proxyUrl: "http://127.0.0.1:7890",
        headers: { "X-Test": "yes" },
        excludedModels: ["disabled-model"],
      },
    ]);
  });

  test("ignores OAuth auth-file rows returned by the OpenCode Go config endpoint", async () => {
    const { providersApi } = await import("@/lib/http/apis/providers");
    getMock.mockResolvedValue({
      "opencode-go-api-key": [
        {
          name: "OpenCode Go API key",
          "api-key": "sk-go",
        },
        {
          name: "user@example.com",
          "api-key": "oauth-backed-token",
          account_type: "oauth",
          type: "opencode-go",
        },
      ],
    });

    await expect(providersApi.getOpenCodeGoConfigs()).resolves.toEqual([
      {
        name: "OpenCode Go API key",
        apiKey: "sk-go",
      },
    ]);
  });

  test("serializes and deletes OpenCode Go configs without Base URL or models", async () => {
    const { providersApi } = await import("@/lib/http/apis/providers");
    putMock.mockResolvedValue({ status: "ok" });
    deleteMock.mockResolvedValue({ status: "ok" });

    await providersApi.saveOpenCodeGoConfigs([
      {
        name: "OpenCode Go",
        apiKey: "sk-go",
        prefix: "go",
        baseUrl: "https://should-not-save.example",
        proxyId: "hk",
        proxyUrl: "http://127.0.0.1:7890",
        headers: { "X-Test": "yes" },
        models: [{ name: "should-not-save" }],
        excludedModels: ["disabled-model"],
      },
    ]);

    expect(putMock).toHaveBeenCalledWith("/opencode-go-api-key", [
      {
        name: "OpenCode Go",
        "api-key": "sk-go",
        prefix: "go",
        "proxy-id": "hk",
        "proxy-url": "http://127.0.0.1:7890",
        headers: { "X-Test": "yes" },
        "excluded-models": ["disabled-model"],
      },
    ]);

    await providersApi.deleteOpenCodeGoConfig("sk-go");

    expect(deleteMock).toHaveBeenCalledWith("/opencode-go-api-key", undefined, {
      params: { "api-key": "sk-go" },
    });
  });

  test("ignores OAuth auth-file rows from every provider config endpoint", async () => {
    const { providersApi } = await import("@/lib/http/apis/providers");
    const oauthRow = {
      name: "yuan364299311@gmail.com",
      "api-key": "oauth-backed-token",
      account_type: "oauth",
      type: "claude",
    };
    const runtimeOnlyRow = {
      name: "runtime-only-channel",
      "api-key": "runtime-backed-token",
      runtime_only: true,
    };

    getMock.mockImplementation(async (path: string) => {
      if (path === "/gemini-api-key") {
        return {
          "gemini-api-key": [{ name: "Gemini API", "api-key": "sk-gemini" }, oauthRow],
        };
      }
      if (path === "/codex-api-key") {
        return {
          "codex-api-key": [{ name: "Codex API", "api-key": "sk-codex" }, oauthRow],
        };
      }
      if (path === "/claude-api-key") {
        return {
          "claude-api-key": [
            { name: "Claude API", "api-key": "sk-claude" },
            oauthRow,
            runtimeOnlyRow,
          ],
        };
      }
      if (path === "/vertex-api-key") {
        return {
          "vertex-api-key": [{ name: "Vertex API", "api-key": "sk-vertex" }, oauthRow],
        };
      }
      if (path === "/bedrock-api-key") {
        return {
          "bedrock-api-key": [
            { name: "Bedrock API", "api-key": "sk-bedrock", "auth-mode": "api-key" },
            oauthRow,
          ],
        };
      }
      if (path === "/openai-compatibility") {
        return {
          "openai-compatibility": [
            {
              name: "OpenAI compatible API",
              "base-url": "https://example.com/v1",
              "api-key-entries": [{ "api-key": "sk-openai" }],
            },
            oauthRow,
          ],
        };
      }
      return {};
    });

    await expect(providersApi.getGeminiKeys()).resolves.toEqual([
      { name: "Gemini API", apiKey: "sk-gemini" },
    ]);
    await expect(providersApi.getCodexConfigs()).resolves.toEqual([
      { name: "Codex API", apiKey: "sk-codex" },
    ]);
    await expect(providersApi.getClaudeConfigs()).resolves.toEqual([
      { name: "Claude API", apiKey: "sk-claude" },
    ]);
    await expect(providersApi.getVertexConfigs()).resolves.toEqual([
      { name: "Vertex API", apiKey: "sk-vertex" },
    ]);
    await expect(providersApi.getBedrockConfigs()).resolves.toEqual([
      { name: "Bedrock API", apiKey: "sk-bedrock", authMode: "api-key" },
    ]);
    await expect(providersApi.getOpenAIProviders()).resolves.toEqual([
      {
        name: "OpenAI compatible API",
        baseUrl: "https://example.com/v1",
        apiKeyEntries: [{ apiKey: "sk-openai" }],
      },
    ]);
  });
});
