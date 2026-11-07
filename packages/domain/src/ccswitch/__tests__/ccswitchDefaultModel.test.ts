import { describe, expect, test } from "vitest";
import { pickCcSwitchDefaultModel } from "@code-proxy/domain/ccswitch/ccswitchDefaultModel";

describe("pickCcSwitchDefaultModel", () => {
  test("Claude Code: Sonnet, then Opus, then Haiku, then any Claude model, else the first", () => {
    expect(
      pickCcSwitchDefaultModel("claude", [
        "claude-haiku-4-5",
        "claude-opus-4-8",
        "claude-sonnet-5",
      ]),
    ).toBe("claude-sonnet-5");
    expect(pickCcSwitchDefaultModel("claude", ["claude-haiku-4-5", "claude-opus-4-8"])).toBe(
      "claude-opus-4-8",
    );
    expect(pickCcSwitchDefaultModel("claude", ["claude-haiku-4-5", "kimi-k2"])).toBe(
      "claude-haiku-4-5",
    );
    expect(pickCcSwitchDefaultModel("claude", ["glm-5", "kimi-k2"])).toBe("glm-5");
  });

  test("Codex follows the earlier MODEL_PRIORITY order and picks nothing off the list", () => {
    expect(
      pickCcSwitchDefaultModel("codex", ["codex-auto-review", "gpt-5", "gpt-5.3-codex", "gpt-5.5"]),
    ).toBe("gpt-5.5");
    expect(pickCcSwitchDefaultModel("codex", ["gpt-5", "gpt-5-codex", "gpt-5.3-codex"])).toBe(
      "gpt-5.3-codex",
    );
    expect(pickCcSwitchDefaultModel("codex", ["codex-auto-review", "gpt-5"])).toBe(
      "codex-auto-review",
    );
    expect(pickCcSwitchDefaultModel("codex", ["deepseek-v4-flash", "kimi-k2"])).toBeUndefined();
  });

  test("Gemini CLI prefers Gemini 3, then 2.5 Pro, then 2.5 Flash", () => {
    expect(
      pickCcSwitchDefaultModel("gemini", ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro"]),
    ).toBe("gemini-3-pro");
    expect(pickCcSwitchDefaultModel("gemini", ["gemini-2.5-flash", "gemini-2.5-pro"])).toBe(
      "gemini-2.5-pro",
    );
    expect(pickCcSwitchDefaultModel("gemini", ["kimi-k2"])).toBeUndefined();
  });

  test("apps without an earlier rule get no pick", () => {
    for (const clientType of ["opencode", "openclaw", "hermes"] as const) {
      expect(pickCcSwitchDefaultModel(clientType, ["gpt-5.5", "claude-sonnet-5"])).toBeUndefined();
    }
    expect(pickCcSwitchDefaultModel("claude", [])).toBeUndefined();
  });
});
