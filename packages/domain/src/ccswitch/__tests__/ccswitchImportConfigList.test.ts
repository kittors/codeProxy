import { describe, expect, test } from "vitest";
import {
  ccSwitchCodexReasoningEffortsFromCatalog,
  createCcSwitchImportConfig,
  createCcSwitchRoutePath,
  ensureCcSwitchRoutePath,
  normalizeCcSwitchImportConfigList,
  normalizeCcSwitchModelMappings,
} from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import {
  CC_SWITCH_CLIENT_TYPES,
  parseCcSwitchClientTypes,
} from "@code-proxy/domain/ccswitch/ccswitchClients";

describe("ccswitchImportConfigList", () => {
  test("creates distinct CC Switch route paths from generated config IDs", () => {
    const routeA = createCcSwitchRoutePath("kimicode", "ccswitch-1770000000000-alpha123");
    const routeB = createCcSwitchRoutePath("kimicode", "ccswitch-1770000000000-bravo456");

    expect(routeA).toBe("/kimicode/cs_alpha123");
    expect(routeB).toBe("/kimicode/cs_bravo456");
    expect(routeA).not.toBe(routeB);
  });

  test("keeps a route path while it starts with the group and derives one otherwise", () => {
    expect(ensureCcSwitchRoutePath("/pro/cs_legacy", "pro", "seed-zzzzzz")).toBe("/pro/cs_legacy");
    expect(ensureCcSwitchRoutePath("/pro/cs_legacy", "team-a", "seed-abcdef")).toBe(
      "/team-a/cs_abcdef",
    );
    expect(ensureCcSwitchRoutePath("/pro/cs_legacy", "", "seed-abcdef")).toBe("");
  });

  test("normalizes mappings from backend rows and panel objects alike", () => {
    expect(
      normalizeCcSwitchModelMappings([
        { role: "MAIN", "request-model": "claude-fable-5", "target-model": "grok-4.5" },
        // A missing request name means the target itself, as the backend stores it.
        { role: "haiku", "target-model": "grok-4.5" },
        // Earlier panels used the role as a placeholder request name; it was never sent.
        { role: "sonnet", requestModel: "sonnet", targetModel: "grok-4.5" },
        { requestModel: "gpt-5.4", targetModel: "deepseek-v4-flash", contextWindow: "272000" },
        { requestModel: "gpt-5.4", targetModel: "deepseek-v4-flash" },
        { role: "main", requestModel: "dup", targetModel: "dup" },
        { requestModel: "orphan" },
        null,
      ]),
    ).toEqual([
      { role: "main", requestModel: "claude-fable-5", targetModel: "grok-4.5" },
      { role: "haiku", requestModel: "grok-4.5", targetModel: "grok-4.5" },
      { role: "sonnet", requestModel: "grok-4.5", targetModel: "grok-4.5" },
      { requestModel: "gpt-5.4", targetModel: "deepseek-v4-flash", contextWindow: 272000 },
    ]);
  });

  test("new presets get the app's name and endpoint suffix and no default model", () => {
    expect(createCcSwitchImportConfig({ clientType: "hermes", id: "cfg" })).toMatchObject({
      id: "cfg",
      providerName: "CliProxy Hermes",
      defaultModel: "",
      endpointPath: "/v1",
      usageAutoInterval: 30,
      modelMappings: [],
    });
    expect(createCcSwitchImportConfig({ clientType: "claude" }).endpointPath).toBe("");
  });

  test("keeps only the default reasoning effort of the backend's Codex catalog", () => {
    expect(
      ccSwitchCodexReasoningEffortsFromCatalog({
        models: [
          { slug: "GPT-5.5", default_reasoning_level: "medium", context_window: 272000 },
          { model: "gpt-5.6-sol", defaultReasoningLevel: "ultra" },
          { slug: "no-effort" },
        ],
      }),
    ).toEqual({ "gpt-5.5": "medium", "gpt-5.6-sol": "ultra" });
    expect(ccSwitchCodexReasoningEffortsFromCatalog(undefined)).toBeUndefined();
  });

  test("drops presets for apps this panel does not know", () => {
    const configs = normalizeCcSwitchImportConfigList([
      { clientType: "opencode" },
      // @ts-expect-error a value from a newer backend
      { clientType: "grokbuild" },
    ]);
    expect(configs.map((config) => config.clientType)).toEqual(["opencode"]);
  });
});

describe("parseCcSwitchClientTypes", () => {
  test("a backend without the field predates the capability", () => {
    expect(parseCcSwitchClientTypes(undefined)).toBeNull();
  });

  test("keeps the panel's order and drops apps it does not know", () => {
    expect(parseCcSwitchClientTypes(["hermes", "claude", "pi", "CODEX"])).toEqual([
      "claude",
      "codex",
      "hermes",
    ]);
    expect(parseCcSwitchClientTypes([...CC_SWITCH_CLIENT_TYPES])).toEqual(CC_SWITCH_CLIENT_TYPES);
  });
});
