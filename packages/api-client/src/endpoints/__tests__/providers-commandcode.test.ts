import { beforeEach, describe, expect, test, vi } from "vitest";

const getMock = vi.fn();
const postMock = vi.fn();
const putMock = vi.fn();
const patchMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    put: putMock,
    patch: patchMock,
    delete: deleteMock,
  },
}));

describe("providersApi Command Code", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    putMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
  });

  test("normalizes configs and defaults the Provider API base URL", async () => {
    const { providersApi } = await import(
      "@code-proxy/api-client/endpoints/providers"
    );
    getMock.mockResolvedValue({
      "commandcode-api-key": [
        {
          name: "GOAT plan",
          "api-key": "cc-key",
          disabled: true,
          prefix: "cc",
          "proxy-id": "hk",
          headers: { "X-Test": "yes" },
          models: [{ name: "gpt-5.6-terra", alias: "terra" }],
          "excluded-models": ["*"],
          "vision-fallback-model": "google/gemini-3.5-flash",
        },
      ],
    });

    const configs = await providersApi.getCommandCodeConfigs();
    expect(configs).toHaveLength(1);
    expect(configs[0]).toMatchObject({
      name: "GOAT plan",
      apiKey: "cc-key",
      disabled: true,
      prefix: "cc",
      baseUrl: "https://api.commandcode.ai/provider/v1",
      proxyId: "hk",
      excludedModels: ["*"],
      visionFallbackModel: "google/gemini-3.5-flash",
    });
  });

  // The credits endpoint authenticates with the inference key, so a Command Code
  // row must never carry a dashboard cookie the way Cline and Ollama rows do.
  test("drops any auth cookie rather than round-tripping it", async () => {
    const { providersApi } = await import(
      "@code-proxy/api-client/endpoints/providers"
    );
    getMock.mockResolvedValue({
      "commandcode-api-key": [
        { "api-key": "cc-key", "auth-cookie": "should-be-ignored" },
      ],
    });

    const configs = await providersApi.getCommandCodeConfigs();
    expect(configs[0]).not.toHaveProperty("authCookie");

    await providersApi.saveCommandCodeConfigs([
      {
        apiKey: "cc-key",
        authCookie: "should-be-ignored",
      } as Parameters<typeof providersApi.saveCommandCodeConfigs>[0][number],
    ]);
    expect(putMock).toHaveBeenCalledWith("/commandcode-api-key", [
      { "api-key": "cc-key" },
    ]);
  });

  test("queries usage with the credential alone", async () => {
    const { providersApi } = await import(
      "@code-proxy/api-client/endpoints/providers"
    );
    postMock.mockResolvedValue({ usage: [] });

    await providersApi.queryCommandCodeUsage({ "api-key": "cc-key", index: 0 });
    expect(postMock).toHaveBeenCalledWith("/commandcode-api-key/usage", {
      "api-key": "cc-key",
      index: 0,
    });
  });

  test("patches by index and keeps an unchanged key out of the payload", async () => {
    const { providersApi } = await import(
      "@code-proxy/api-client/endpoints/providers"
    );

    await providersApi.patchCommandCodeConfig(2, {
      apiKey: "   ",
      name: "renamed",
    } as Parameters<typeof providersApi.patchCommandCodeConfig>[1]);

    expect(patchMock).toHaveBeenCalledWith("/commandcode-api-key", {
      index: 2,
      value: { name: "renamed" },
    });
  });
});
