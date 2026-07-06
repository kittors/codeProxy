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

describe("providersApi Cline", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    deleteMock.mockReset();
  });

  test("normalizes Cline configs with default and trimmed Base URL", async () => {
    const { providersApi } = await import("@code-proxy/api-client/endpoints/providers");
    getMock.mockResolvedValue({
      "cline-api-key": [
        {
          name: "Cline Default",
          "api-key": "sk-default",
        },
        {
          name: "Cline Custom",
          "api-key": "sk-custom",
          "base-url": " https://api.example.com/v1/ ",
          "proxy-id": "hk",
          "proxy-url": "http://127.0.0.1:7890",
          headers: { "X-Test": "yes" },
          models: [{ name: "cline-pass/glm-5.2" }],
          "excluded-models": ["cline-pass/minimax-m3", "*"],
          "vision-fallback-model": "cline-pass/mimo-v2.5-pro",
        },
      ],
    });

    const result = await providersApi.getClineConfigs();

    expect(getMock).toHaveBeenCalledWith("/cline-api-key");
    expect(result).toEqual([
      {
        name: "Cline Default",
        apiKey: "sk-default",
        baseUrl: "https://api.cline.bot/api/v1",
      },
      {
        name: "Cline Custom",
        apiKey: "sk-custom",
        baseUrl: "https://api.example.com/v1",
        proxyId: "hk",
        proxyUrl: "http://127.0.0.1:7890",
        headers: { "X-Test": "yes" },
        excludedModels: ["cline-pass/minimax-m3", "*"],
      },
    ]);
  });

  test("ignores OAuth and runtime rows returned by the Cline config endpoint", async () => {
    const { providersApi } = await import("@code-proxy/api-client/endpoints/providers");
    getMock.mockResolvedValue({
      "cline-api-key": [
        { name: "Cline API key", "api-key": "sk-cline" },
        { name: "OAuth backed", "api-key": "oauth-token", account_type: "oauth" },
        { name: "runtime", "api-key": "runtime-token", runtime_only: true },
      ],
    });

    await expect(providersApi.getClineConfigs()).resolves.toEqual([
      {
        name: "Cline API key",
        apiKey: "sk-cline",
        baseUrl: "https://api.cline.bot/api/v1",
      },
    ]);
  });

  test("serializes and deletes Cline configs", async () => {
    const { providersApi } = await import("@code-proxy/api-client/endpoints/providers");
    putMock.mockResolvedValue({ status: "ok" });
    deleteMock.mockResolvedValue({ status: "ok" });

    await providersApi.saveClineConfigs([
      {
        name: "Cline",
        apiKey: "sk-cline",
        prefix: "team",
        baseUrl: "https://api.cline.bot/api/v1",
        proxyId: "hk",
        proxyUrl: "http://127.0.0.1:7890",
        headers: { "X-Test": "yes" },
        models: [{ name: "cline-pass/glm-5.2" }],
        excludedModels: ["cline-pass/minimax-m3", "*"],
        visionFallbackModel: "cline-pass/mimo-v2.5-pro",
      },
    ]);

    expect(putMock).toHaveBeenCalledWith("/cline-api-key", [
      {
        name: "Cline",
        "api-key": "sk-cline",
        prefix: "team",
        "base-url": "https://api.cline.bot/api/v1",
        "proxy-id": "hk",
        "proxy-url": "http://127.0.0.1:7890",
        headers: { "X-Test": "yes" },
        "excluded-models": ["cline-pass/minimax-m3", "*"],
      },
    ]);

    await providersApi.deleteClineConfig("sk-cline");

    expect(deleteMock).toHaveBeenCalledWith("/cline-api-key", undefined, {
      params: { "api-key": "sk-cline" },
    });
  });
});
