import { describe, expect, it } from "vitest";
import {
  findDuplicateProviderIndex,
  providerDuplicateKey,
} from "../provider-duplicate-key";

describe("providerDuplicateKey", () => {
  it("keys api-key-only channels on the credential alone", () => {
    for (const type of ["gemini", "opencode-go", "cline"] as const) {
      expect(
        providerDuplicateKey(type, { apiKey: " sk-one ", baseUrl: "https://a" }),
      ).toBe(providerDuplicateKey(type, { apiKey: "sk-one", baseUrl: "https://b" }));
    }
  });

  it("keys base-url-scoped channels on credential plus endpoint", () => {
    for (const type of ["ollama-cloud", "commandcode", "vertex"] as const) {
      expect(
        providerDuplicateKey(type, { apiKey: "sk-one", baseUrl: "https://a" }),
      ).not.toBe(
        providerDuplicateKey(type, { apiKey: "sk-one", baseUrl: "https://b" }),
      );
      expect(
        providerDuplicateKey(type, { apiKey: "sk-one", baseUrl: "https://a" }),
      ).toBe(providerDuplicateKey(type, { apiKey: "sk-one", baseUrl: "https://a" }));
    }
  });

  it("returns null for channels the backend lets duplicate", () => {
    expect(providerDuplicateKey("claude", { apiKey: "sk-one" })).toBeNull();
    expect(providerDuplicateKey("codex", { apiKey: "sk-one" })).toBeNull();
    expect(providerDuplicateKey("bedrock", { apiKey: "sk-one" })).toBeNull();
  });

  it("returns null when there is no credential to collide on", () => {
    expect(providerDuplicateKey("gemini", { apiKey: "   " })).toBeNull();
  });
});

describe("findDuplicateProviderIndex", () => {
  const list = [
    { apiKey: "sk-one", name: "first" },
    { apiKey: "sk-two", name: "second" },
  ];

  it("reports the row a new credential would collide with", () => {
    expect(
      findDuplicateProviderIndex("gemini", list, { apiKey: "sk-two" }, null),
    ).toBe(1);
  });

  it("does not flag a row against itself when editing", () => {
    expect(
      findDuplicateProviderIndex(
        "gemini",
        list,
        { apiKey: "sk-two", name: "renamed" },
        1,
      ),
    ).toBe(-1);
  });

  it("flags an edit that would collide with a different row", () => {
    expect(
      findDuplicateProviderIndex("gemini", list, { apiKey: "sk-one" }, 1),
    ).toBe(0);
  });

  it("lets a fresh credential through", () => {
    expect(
      findDuplicateProviderIndex("gemini", list, { apiKey: "sk-three" }, null),
    ).toBe(-1);
  });

  it("never blocks channels that allow duplicates", () => {
    expect(
      findDuplicateProviderIndex("codex", list, { apiKey: "sk-one" }, null),
    ).toBe(-1);
  });
});
