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

describe("providersApi Bedrock", () => {
  beforeEach(() => {
    getMock.mockReset();
    putMock.mockReset();
    deleteMock.mockReset();
  });

  test("normalizes API key and SigV4 Bedrock configs", async () => {
    const { providersApi } = await import("@/lib/http/apis/providers");
    getMock.mockResolvedValue({
      "bedrock-api-key": [
        {
          name: "Bedrock API",
          "auth-mode": "api-key",
          "api-key": "br-key",
          region: "eu-west-1",
          "force-global": true,
          "base-url": "https://bedrock.local",
          "proxy-id": "hk",
          priority: -7,
          headers: { "X-Test": "yes" },
          models: [{ name: "claude-sonnet-4-5", alias: "aws-sonnet" }],
          "excluded-models": ["claude-opus-*"],
        },
        {
          name: "Bedrock SigV4",
          "auth-mode": "sigv4",
          "access-key-id": "AKIA",
          "secret-access-key": "SECRET",
          "session-token": "SESSION",
          region: "us-east-1",
        },
      ],
    });

    const result = await providersApi.getBedrockConfigs();

    expect(getMock).toHaveBeenCalledWith("/bedrock-api-key");
    expect(result).toEqual([
      expect.objectContaining({
        name: "Bedrock API",
        authMode: "api-key",
        apiKey: "br-key",
        region: "eu-west-1",
        forceGlobal: true,
        baseUrl: "https://bedrock.local",
        proxyId: "hk",
        priority: -7,
        headers: { "X-Test": "yes" },
        models: [{ name: "claude-sonnet-4-5", alias: "aws-sonnet" }],
        excludedModels: ["claude-opus-*"],
      }),
      expect.objectContaining({
        name: "Bedrock SigV4",
        authMode: "sigv4",
        apiKey: "AKIA",
        accessKeyId: "AKIA",
        secretAccessKey: "SECRET",
        sessionToken: "SESSION",
        region: "us-east-1",
      }),
    ]);
  });

  test("normalizes and serializes simple provider priority with proxy-id", async () => {
    const { providersApi } = await import("@/lib/http/apis/providers");
    getMock.mockResolvedValue({
      "claude-api-key": [
        {
          "api-key": "sk-claude",
          name: "Claude",
          "proxy-id": "hk",
          priority: -1001,
        },
      ],
    });
    putMock.mockResolvedValue({ status: "ok" });

    const result = await providersApi.getClaudeConfigs();
    expect(result).toEqual([
      expect.objectContaining({ apiKey: "sk-claude", proxyId: "hk", priority: -1001 }),
    ]);

    await providersApi.saveClaudeConfigs([{ ...result[0], priority: 1001 }]);

    expect(putMock).toHaveBeenCalledWith(
      "/claude-api-key",
      [expect.objectContaining({ "proxy-id": "hk", priority: 1001 })],
    );
  });

  test("serializes and deletes Bedrock configs", async () => {
    const { providersApi } = await import("@/lib/http/apis/providers");
    putMock.mockResolvedValue({ status: "ok" });
    deleteMock.mockResolvedValue({ status: "ok" });

    await providersApi.saveBedrockConfigs([
      {
        name: "Bedrock API",
        authMode: "api-key",
        apiKey: "br-key",
        region: "eu-west-1",
        forceGlobal: true,
        priority: 4096,
      },
      {
        name: "Bedrock SigV4",
        authMode: "sigv4",
        apiKey: "AKIA",
        accessKeyId: "AKIA",
        secretAccessKey: "SECRET",
        sessionToken: "SESSION",
        region: "us-east-1",
      },
    ]);

    expect(putMock).toHaveBeenCalledWith("/bedrock-api-key", [
      expect.objectContaining({
        name: "Bedrock API",
        "auth-mode": "api-key",
        "api-key": "br-key",
        region: "eu-west-1",
        "force-global": true,
        priority: 4096,
      }),
      expect.objectContaining({
        name: "Bedrock SigV4",
        "auth-mode": "sigv4",
        "access-key-id": "AKIA",
        "secret-access-key": "SECRET",
        "session-token": "SESSION",
        region: "us-east-1",
      }),
    ]);
    expect(putMock.mock.calls[0][1][1]).not.toHaveProperty("api-key");

    await providersApi.deleteBedrockConfig(1);

    expect(deleteMock).toHaveBeenCalledWith("/bedrock-api-key", undefined, {
      params: { index: 1 },
    });
  });
});
