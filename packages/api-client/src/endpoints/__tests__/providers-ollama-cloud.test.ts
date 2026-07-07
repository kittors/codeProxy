import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const putMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: {
    get: getMock,
    put: putMock,
    delete: deleteMock,
  },
}));

describe("providersApi Ollama Cloud", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    deleteMock.mockReset();
  });

  test("normalizes Ollama Cloud configs with default Base URL and model aliases", async () => {
    const { providersApi } = await import("@code-proxy/api-client/endpoints/providers");
    getMock.mockResolvedValue({
      "ollama-cloud-api-key": [
        {
          name: "Ollama",
          "api-key": "sk-ollama",
          models: [{ name: "gpt-oss:120b", alias: "oss-large" }],
          "excluded-models": ["gpt-oss:20b", "*"],
        },
        { name: "Runtime", "api-key": "runtime-token", runtime_only: true },
      ],
    });

    await expect(providersApi.getOllamaCloudConfigs()).resolves.toEqual([
      {
        name: "Ollama",
        apiKey: "sk-ollama",
        baseUrl: "https://ollama.com",
        models: [{ name: "gpt-oss:120b", alias: "oss-large" }],
        excludedModels: ["gpt-oss:20b", "*"],
      },
    ]);
    expect(getMock).toHaveBeenCalledWith("/ollama-cloud-api-key");
  });

  test("serializes Ollama Cloud configs with model aliases and deletes them", async () => {
    const { providersApi } = await import("@code-proxy/api-client/endpoints/providers");

    await providersApi.saveOllamaCloudConfigs([
      {
        name: "Ollama",
        apiKey: "sk-ollama",
        baseUrl: "https://ollama.com",
        models: [{ name: "gpt-oss:120b", alias: "oss-large" }],
        excludedModels: ["gpt-oss:20b", "*"],
      },
    ]);

    expect(putMock).toHaveBeenCalledWith("/ollama-cloud-api-key", [
      {
        name: "Ollama",
        "api-key": "sk-ollama",
        "base-url": "https://ollama.com",
        models: [{ name: "gpt-oss:120b", alias: "oss-large" }],
        "excluded-models": ["gpt-oss:20b", "*"],
      },
    ]);

    await providersApi.deleteOllamaCloudConfig("sk-ollama");
    expect(deleteMock).toHaveBeenCalledWith("/ollama-cloud-api-key", undefined, {
      params: { "api-key": "sk-ollama" },
    });
  });
});
