import { describe, expect, test } from "vitest";
import {
  serializeProviderKey,
  serializeGeminiKey,
  serializeOpenAIProvider,
} from "@/lib/http/apis/helpers";

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
        baseUrl: "https://api.example.com/v1",
        apiKeyEntries: [
          {
            apiKey: "sk-openai",
            proxyId: "hk",
            proxyUrl: "http://fallback.example:7890",
          },
        ],
      }),
    ).toEqual(
      expect.objectContaining({
        "api-key-entries": [
          expect.objectContaining({
            "proxy-id": "hk",
            "proxy-url": "http://fallback.example:7890",
          }),
        ],
      }),
    );
  });
});
