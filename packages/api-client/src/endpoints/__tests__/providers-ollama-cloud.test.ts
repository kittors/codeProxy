import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const putMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: {
    get: getMock,
    put: putMock,
    patch: patchMock,
    delete: deleteMock,
  },
}));

describe("providersApi Ollama Cloud", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    patchMock.mockReset();
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

  test("patches Ollama Cloud config and excluded models on the Ollama endpoint", async () => {
    const { providersApi } = await import("@code-proxy/api-client/endpoints/providers");

    await providersApi.patchOllamaCloudConfig(2, {
      name: "Ollama",
      apiKey: "sk-ollama",
      baseUrl: "https://ollama.com",
      models: [{ name: "gpt-oss:120b", alias: "oss-large" }],
      excludedModels: ["gpt-oss:20b", "*"],
      visionFallbackModel: "gpt-oss:120b",
    });

    expect(patchMock).toHaveBeenCalledWith("/ollama-cloud-api-key", {
      index: 2,
      value: {
        name: "Ollama",
        "api-key": "sk-ollama",
        "base-url": "https://ollama.com",
        models: [{ name: "gpt-oss:120b", alias: "oss-large" }],
        "excluded-models": ["gpt-oss:20b", "*"],
        "vision-fallback-model": "gpt-oss:120b",
      },
    });

    await providersApi.patchOllamaCloudExcludedModels(2, ["*"]);

    expect(patchMock).toHaveBeenLastCalledWith("/ollama-cloud-api-key", {
      index: 2,
      value: { "excluded-models": ["*"] },
    });
  });

  test("omits empty api-key when patching an existing Ollama Cloud config", async () => {
    const { providersApi } = await import("@code-proxy/api-client/endpoints/providers");

    await providersApi.patchOllamaCloudConfig(0, {
      name: "Ollama",
      apiKey: "",
      baseUrl: "https://ollama.com",
      models: [{ name: "gpt-oss:120b" }],
      visionFallbackModel: "gpt-oss:120b",
    });

    expect(patchMock).toHaveBeenCalledWith("/ollama-cloud-api-key", {
      index: 0,
      value: {
        name: "Ollama",
        "base-url": "https://ollama.com",
        models: [{ name: "gpt-oss:120b" }],
        "vision-fallback-model": "gpt-oss:120b",
      },
    });
  });
});
