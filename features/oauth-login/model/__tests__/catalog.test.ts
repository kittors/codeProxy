import { describe, expect, test } from "vitest";
import { ACCOUNT_PROVIDERS, resolveAccountProvider } from "../catalog";

describe("resolveAccountProvider", () => {
  test("maps list filters to the provider that adds that kind of account", () => {
    expect(resolveAccountProvider("claude")).toBe("anthropic");
    expect(resolveAccountProvider("gemini")).toBe("gemini-cli");
    expect(resolveAccountProvider("grok")).toBe("xai");
    expect(resolveAccountProvider("vertex")).toBe("vertex");
    expect(resolveAccountProvider(" IFLOW ")).toBe("iflow");
  });

  test("defaults to Codex for all and unknown filters", () => {
    expect(resolveAccountProvider("all")).toBe("codex");
    expect(resolveAccountProvider(undefined)).toBe("codex");
  });

  test("every OAuth entry names its provider", () => {
    for (const provider of ACCOUNT_PROVIDERS) {
      if (provider.methods.includes("oauth")) expect(provider.oauth).toBeTruthy();
    }
  });
});
