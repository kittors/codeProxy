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

  test("normalizes Ollama Cloud configs with default Base URL", async () => {
    const { providersApi } = await import("@code-proxy/api-client/endpoints/providers");
    getMock.mockResolvedValue({
      "ollama-cloud-api-key": [
        { name: "Ollama", "api-key": "sk-ollama" },
        { name: "Runtime", "api-key": "runtime-token", runtime_only: true },
      ],
    });

    await expect(providersApi.getOllamaCloudConfigs()).resolves.toEqual([
      {
        name: "Ollama",
        apiKey: "sk-ollama",
        baseUrl: "https://ollama.com",
      },
    ]);
    expect(getMock).toHaveBeenCalledWith("/ollama-cloud-api-key");
  });

  test("serializes and deletes Ollama Cloud configs", async () => {
    const { providersApi } = await import("@code-proxy/api-client/endpoints/providers");

    await providersApi.saveOllamaCloudConfigs([
      {
        name: "Ollama",
        apiKey: "sk-ollama",
        baseUrl: "https://ollama.com",
        models: [{ name: "gpt-oss:120b" }],
      },
    ]);

    expect(putMock).toHaveBeenCalledWith("/ollama-cloud-api-key", [
      {
        name: "Ollama",
        "api-key": "sk-ollama",
        "base-url": "https://ollama.com",
        models: [{ name: "gpt-oss:120b" }],
      },
    ]);

    await providersApi.deleteOllamaCloudConfig("sk-ollama");
    expect(deleteMock).toHaveBeenCalledWith("/ollama-cloud-api-key", undefined, {
      params: { "api-key": "sk-ollama" },
    });
  });
});
