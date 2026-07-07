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

describe("providersApi Cline", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
  });

  test("normalizes Cline configs with default and trimmed Base URL", async () => {
    const { providersApi } =
      await import("@code-proxy/api-client/endpoints/providers");
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
          models: [{ name: "cline-pass/glm-5.2", alias: "cline-glm" }],
          "excluded-models": ["*"],
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
        models: [{ name: "cline-pass/glm-5.2", alias: "cline-glm" }],
        excludedModels: ["*"],
        visionFallbackModel: "cline-pass/mimo-v2.5-pro",
      },
    ]);
  });

  test("ignores OAuth and runtime rows returned by the Cline config endpoint", async () => {
    const { providersApi } =
      await import("@code-proxy/api-client/endpoints/providers");
    getMock.mockResolvedValue({
      "cline-api-key": [
        { name: "Cline API key", "api-key": "sk-cline" },
        {
          name: "OAuth backed",
          "api-key": "oauth-token",
          account_type: "oauth",
        },
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
    const { providersApi } =
      await import("@code-proxy/api-client/endpoints/providers");
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
        models: [{ name: "cline-pass/glm-5.2", alias: "cline-glm" }],
        excludedModels: ["*"],
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
        models: [{ name: "cline-pass/glm-5.2", alias: "cline-glm" }],
        "excluded-models": ["*"],
        "vision-fallback-model": "cline-pass/mimo-v2.5-pro",
      },
    ]);

    await providersApi.deleteClineConfig("sk-cline");

    expect(deleteMock).toHaveBeenCalledWith("/cline-api-key", undefined, {
      params: { "api-key": "sk-cline" },
    });
  });

  test("patches Cline config and excluded models on the Cline endpoint", async () => {
    const { providersApi } =
      await import("@code-proxy/api-client/endpoints/providers");

    await providersApi.patchClineConfig(0, {
      name: "Cline",
      apiKey: "sk-cline",
      baseUrl: "https://api.cline.bot/api/v1",
      models: [{ name: "cline-pass/glm-5.2", alias: "glm" }],
      excludedModels: ["*"],
      visionFallbackModel: "cline-pass/mimo-v2.5-pro",
    });

    expect(patchMock).toHaveBeenCalledWith("/cline-api-key", {
      index: 0,
      value: {
        name: "Cline",
        "api-key": "sk-cline",
        "base-url": "https://api.cline.bot/api/v1",
        models: [{ name: "cline-pass/glm-5.2", alias: "glm" }],
        "excluded-models": ["*"],
        "vision-fallback-model": "cline-pass/mimo-v2.5-pro",
      },
    });

    await providersApi.patchClineExcludedModels(0, ["*"]);

    expect(patchMock).toHaveBeenLastCalledWith("/cline-api-key", {
      index: 0,
      value: { "excluded-models": ["*"] },
    });
  });

  test("omits empty api-key when patching an existing Cline config", async () => {
    const { providersApi } =
      await import("@code-proxy/api-client/endpoints/providers");

    await providersApi.patchClineConfig(0, {
      name: "Cline",
      apiKey: "",
      baseUrl: "https://api.cline.bot/api/v1",
      models: [{ name: "cline-pass/glm-5.2" }],
      visionFallbackModel: "cline-pass/mimo-v2.5-pro",
    });

    expect(patchMock).toHaveBeenCalledWith("/cline-api-key", {
      index: 0,
      value: {
        name: "Cline",
        "base-url": "https://api.cline.bot/api/v1",
        models: [{ name: "cline-pass/glm-5.2" }],
        "vision-fallback-model": "cline-pass/mimo-v2.5-pro",
      },
    });
  });
});
