import { describe, expect, test } from "vitest";
import {
  serializeProviderKey,
  serializeGeminiKey,
  serializeBedrockKey,
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
        priority: -12,
      }),
    ).toEqual(
      expect.objectContaining({
        "proxy-id": "hk",
        "proxy-url": "http://fallback.example:7890",
        priority: -12,
      }),
    );
  });

  test("serializes proxy-id for gemini configs", () => {
    expect(
      serializeGeminiKey({
        apiKey: "gemini-key",
        name: "Gemini",
        proxyId: "hk",
        priority: 2048,
      }),
    ).toEqual(expect.objectContaining({ "proxy-id": "hk", priority: 2048 }));
  });

  test("serializes priority for bedrock configs without narrowing backend int values", () => {
    expect(
      serializeBedrockKey({
        authMode: "api-key",
        apiKey: "bedrock-key",
        name: "Bedrock",
        priority: -2048,
      }),
    ).toEqual(expect.objectContaining({ priority: -2048 }));
  });

  test("serializes proxy-id for openai api key entries", () => {
    expect(
      serializeOpenAIProvider({
        name: "OpenAI",
        baseUrl: "https://api.example.com/v1",
        priority: 1001,
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
        priority: 1001,
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
