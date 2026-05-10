import { beforeEach, describe, expect, test, vi } from "vitest";
import { apiClient } from "@/lib/http/client";
import { ccSwitchImportConfigsApi } from "@/lib/http/apis/ccswitch-import-configs";

vi.mock("@/lib/http/client", () => ({
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
});
