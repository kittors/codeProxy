import { describe, expect, test } from "vitest";
import { serializeProviderKey, serializeGeminiKey, serializeOpenAIProvider } from "../helpers";

describe("provider proxy id serialization", () => {
  test("serializes proxy-id for simple provider configs", () => {
    expect(
      serializeProviderKey({
        apiKey: "sk-test",
        name: "Codex",
        baseUrl: "https://api.example.com",
        proxyId: "hk",
        proxyUrl: "http://fallback.example:7890",
      }),
    ).toEqual(
      expect.objectContaining({
        "proxy-id": "hk",
        "proxy-url": "http://fallback.example:7890",
      }),
    );
  });

  test("serializes proxy-id for gemini configs", () => {
    expect(
      serializeGeminiKey({
        apiKey: "gemini-key",
        name: "Gemini",
        proxyId: "hk",
      }),
    ).toEqual(expect.objectContaining({ "proxy-id": "hk" }));
  });

  test("serializes proxy-id for openai api key entries", () => {
    expect(
      serializeOpenAIProvider({
        name: "OpenAI",
        disabled: true,
        baseUrl: "https://api.example.com/v1",
        apiKeyEntries: [
          {
            apiKey: "sk-openai",
            disabled: true,
            proxyId: "hk",
            proxyUrl: "http://fallback.example:7890",
          },
        ],
      }),
    ).toEqual(
      expect.objectContaining({
        disabled: true,
        "api-key-entries": [
          expect.objectContaining({
            disabled: true,
            "proxy-id": "hk",
            "proxy-url": "http://fallback.example:7890",
          }),
        ],
      }),
    );
  });
});
