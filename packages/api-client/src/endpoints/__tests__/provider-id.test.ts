import { beforeEach, describe, expect, test, vi } from "vitest";
import { providersApi } from "../providers";
import { serializeOpenAIProvider, serializeProviderKey } from "../helpers";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("../../client/client", () => ({
  apiClient: {
    get: mocks.get,
  },
}));

describe("provider stable ids", () => {
  beforeEach(() => mocks.get.mockReset());

  test("preserves ids returned for provider keys and OpenAI provider entries", async () => {
    mocks.get
      .mockResolvedValueOnce({
        "gemini-api-key": [{ id: "key-id-1", name: "Gemini", "api-key": "secret" }],
      })
      .mockResolvedValueOnce({
        "openai-compatibility": [
          {
            id: "provider-id-1",
            name: "OpenAI Compatible",
            "base-url": "https://example.com/v1",
            "api-key-entries": [{ id: "entry-id-1", "api-key": "sk-entry" }],
          },
        ],
      });

    await expect(providersApi.getGeminiKeys()).resolves.toEqual([
      expect.objectContaining({ id: "key-id-1", apiKey: "secret" }),
    ]);
    await expect(providersApi.getOpenAIProviders()).resolves.toEqual([
      expect.objectContaining({
        id: "provider-id-1",
        apiKeyEntries: [expect.objectContaining({ id: "entry-id-1" })],
      }),
    ]);
  });

  test("serializes stable ids without using names or API keys as binding ids", () => {
    expect(serializeProviderKey({ id: "key-id-1", apiKey: "secret", name: "Gemini" })).toEqual(
      expect.objectContaining({ id: "key-id-1" }),
    );
    expect(
      serializeOpenAIProvider({
        id: "provider-id-1",
        name: "OpenAI Compatible",
        apiKeyEntries: [{ id: "entry-id-1", apiKey: "sk-entry" }],
      }),
    ).toEqual(
      expect.objectContaining({
        id: "provider-id-1",
        "api-key-entries": [expect.objectContaining({ id: "entry-id-1" })],
      }),
    );
  });
});
