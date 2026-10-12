import { describe, expect, test } from "vitest";
import {
  createCcSwitchImportConfig,
  type CcSwitchImportConfigListItem,
  type CcSwitchModelMapping,
} from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import {
  getAliasMappings,
  getPrimaryModel,
  getRouteModels,
  prepareDraftForSave,
  removeAliasMapping,
  seedModels,
  setChannelGroup,
  setClaudeRoleModel,
  setClientType,
  setDefaultContextWindow,
  setDefaultModel,
  setRouteModels,
} from "../ccswitchConfigDraft";

const preset = (
  input: Partial<CcSwitchImportConfigListItem> & Pick<CcSwitchImportConfigListItem, "clientType">,
) =>
  createCcSwitchImportConfig({
    id: "cfg-abcdef",
    providerName: "Relay",
    allowedChannelGroups: ["team"],
    routePath: "/team/cs_saved1",
    ...input,
  });

/** Every request≠target mapping of `before` must still be in `after`, by request name. */
const expectAliasesKept = (
  before: CcSwitchImportConfigListItem,
  after: CcSwitchImportConfigListItem,
) => {
  const aliasNames = (mappings: readonly CcSwitchModelMapping[]) =>
    mappings
      .filter((mapping) => mapping.requestModel.toLowerCase() !== mapping.targetModel.toLowerCase())
      .map((mapping) => mapping.requestModel.toLowerCase());
  const kept = new Set(after.modelMappings.map((mapping) => mapping.requestModel.toLowerCase()));
  for (const name of aliasNames(before.modelMappings)) expect(kept.has(name), name).toBe(true);
};

describe("Claude Code roles", () => {
  const legacy = () =>
    preset({
      clientType: "claude",
      defaultModel: "grok-4.5",
      modelMappings: [
        { role: "main", requestModel: "claude-fable-5", targetModel: "grok-4.5" },
        { role: "haiku", requestModel: "claude-haiku-4-5", targetModel: "grok-4.5" },
        { role: "sonnet", requestModel: "grok-4.5", targetModel: "grok-4.5" },
        { role: "fable", requestModel: "claude-fable-5", targetModel: "grok-4.5" },
      ],
    });

  test("an identity role changes request and target together", () => {
    const next = setClaudeRoleModel(legacy(), "sonnet", "grok-code-fast-1");
    expect(next.modelMappings.find((mapping) => mapping.role === "sonnet")).toEqual({
      role: "sonnet",
      requestModel: "grok-code-fast-1",
      targetModel: "grok-code-fast-1",
    });
  });

  test("an alias role keeps its request name; roles sharing it move along", () => {
    const next = setClaudeRoleModel(legacy(), "main", "grok-code-fast-1");
    expect(
      next.modelMappings.filter((mapping) => mapping.requestModel === "claude-fable-5"),
    ).toEqual([
      { role: "main", requestModel: "claude-fable-5", targetModel: "grok-code-fast-1" },
      { role: "fable", requestModel: "claude-fable-5", targetModel: "grok-code-fast-1" },
    ]);
    // default-model keeps tracking the main target, as earlier panels stored it.
    expect(next.defaultModel).toBe("grok-code-fast-1");
    expect(getPrimaryModel(next)).toBe("grok-code-fast-1");
  });

  test("a new tier is an identity mapping", () => {
    const next = setClaudeRoleModel(legacy(), "opus", "grok-4.5-heavy");
    expect(next.modelMappings.at(-1)).toEqual({
      role: "opus",
      requestModel: "grok-4.5-heavy",
      targetModel: "grok-4.5-heavy",
    });
  });

  test("clearing an alias tier keeps the name on the route as a role-less mapping", () => {
    const before = legacy();
    const next = setClaudeRoleModel(before, "haiku", "");
    expect(next.modelMappings.some((mapping) => mapping.role === "haiku")).toBe(false);
    expect(getAliasMappings(next)).toEqual([
      { requestModel: "claude-haiku-4-5", targetModel: "grok-4.5" },
    ]);
    expectAliasesKept(before, prepareDraftForSave(next));
  });

  test("clearing an identity tier just drops it; the main model cannot be cleared", () => {
    const withoutSonnet = setClaudeRoleModel(legacy(), "sonnet", "");
    expect(withoutSonnet.modelMappings.some((mapping) => mapping.role === "sonnet")).toBe(false);
    expect(getAliasMappings(withoutSonnet)).toEqual([]);
    const unchanged = legacy();
    expect(setClaudeRoleModel(unchanged, "main", "")).toBe(unchanged);
  });

  test("a model whose name an alias already owns cannot be picked for another role", () => {
    const before = legacy();
    expect(setClaudeRoleModel(before, "opus", "claude-haiku-4-5")).toBe(before);
  });
});

describe("other apps' models", () => {
  const legacyCodex = () =>
    preset({
      clientType: "codex",
      defaultModel: "gpt-5.4",
      modelMappings: [
        { requestModel: "gpt-5.4", targetModel: "deepseek-v4-flash", contextWindow: 128000 },
        { requestModel: "kimi-k2", targetModel: "kimi-k2", contextWindow: 128000 },
        { requestModel: "gpt-5.5", targetModel: "deepseek-v4-pro" },
      ],
    });

  test("route models are the identities; aliases are listed apart", () => {
    const draft = legacyCodex();
    expect(getRouteModels(draft)).toEqual(["kimi-k2"]);
    expect(getAliasMappings(draft).map((mapping) => mapping.requestModel)).toEqual([
      "gpt-5.4",
      "gpt-5.5",
    ]);
    expect(getPrimaryModel(draft)).toBe("deepseek-v4-flash");
  });

  test("an alias default keeps its request name and only changes the target", () => {
    const next = setDefaultModel(legacyCodex(), "kimi-k2");
    expect(next.defaultModel).toBe("gpt-5.4");
    expect(next.modelMappings[0]).toEqual({
      requestModel: "gpt-5.4",
      targetModel: "kimi-k2",
      contextWindow: 128000,
    });
  });

  test("an identity default switches to the picked model, adding it to the route", () => {
    const draft = preset({
      clientType: "opencode",
      defaultModel: "kimi-k2",
      modelMappings: [{ requestModel: "kimi-k2", targetModel: "kimi-k2" }],
    });
    const next = setDefaultModel(draft, "qwen3.5-plus");
    expect(next.defaultModel).toBe("qwen3.5-plus");
    expect(getRouteModels(next)).toEqual(["kimi-k2", "qwen3.5-plus"]);
    // A name an alias owns is not available as a plain model.
    const legacy = legacyCodex();
    const withIdentityDefault = removeAliasMapping(legacy, "gpt-5.4");
    expect(setDefaultModel(withIdentityDefault, "gpt-5.5")).toBe(withIdentityDefault);
  });

  test("route models keep the default and the aliases and skip names aliases own", () => {
    const before = legacyCodex();
    const next = setRouteModels(before, ["qwen3.5-plus", "gpt-5.5", "kimi-k2"]);
    expect(getRouteModels(next)).toEqual(["kimi-k2", "qwen3.5-plus"]);
    expectAliasesKept(before, next);
    const cleared = setRouteModels(next, []);
    expect(getRouteModels(cleared)).toEqual([]);
    expect(getAliasMappings(cleared)).toHaveLength(2);

    const identity = preset({
      clientType: "hermes",
      defaultModel: "kimi-k2",
      modelMappings: [{ requestModel: "kimi-k2", targetModel: "kimi-k2" }],
    });
    expect(getRouteModels(setRouteModels(identity, []))).toEqual(["kimi-k2"]);
  });

  test("deleting the default alias keeps the default on the same model, context window included", () => {
    const next = removeAliasMapping(legacyCodex(), "gpt-5.4");
    expect(next.defaultModel).toBe("deepseek-v4-flash");
    expect(next.modelMappings).toContainEqual({
      requestModel: "deepseek-v4-flash",
      targetModel: "deepseek-v4-flash",
      contextWindow: 128000,
    });
    expect(next.modelMappings.some((mapping) => mapping.requestModel === "gpt-5.4")).toBe(false);
  });

  test("the Codex context window belongs to the default model", () => {
    const draft = preset({
      clientType: "codex",
      defaultModel: "gpt-5.5",
      modelMappings: [{ requestModel: "gpt-5.5", targetModel: "gpt-5.5" }],
    });
    const withWindow = setDefaultContextWindow(draft, "272000");
    expect(withWindow.modelMappings[0]).toEqual({
      requestModel: "gpt-5.5",
      targetModel: "gpt-5.5",
      contextWindow: 272000,
    });
    expect(setDefaultContextWindow(withWindow, "").modelMappings[0]).toEqual({
      requestModel: "gpt-5.5",
      targetModel: "gpt-5.5",
    });
  });
});

describe("saving", () => {
  test("never drops a request≠target mapping and keeps a context window only on the Codex default", () => {
    const before = preset({
      clientType: "codex",
      defaultModel: "gpt-5.4",
      endpointPath: "/openai",
      modelMappings: [
        { requestModel: "gpt-5.4", targetModel: "deepseek-v4-flash", contextWindow: 200000 },
        { requestModel: "kimi-k2", targetModel: "kimi-k2", contextWindow: 128000 },
        { requestModel: "gpt-5.5", targetModel: "deepseek-v4-pro", contextWindow: 128000 },
      ],
    });
    const saved = prepareDraftForSave(before);
    expectAliasesKept(before, saved);
    expect(saved.modelMappings).toEqual([
      { requestModel: "gpt-5.4", targetModel: "deepseek-v4-flash", contextWindow: 200000 },
      { requestModel: "kimi-k2", targetModel: "kimi-k2" },
      { requestModel: "gpt-5.5", targetModel: "deepseek-v4-pro" },
    ]);
    // Older panels join endpoint-path onto the route when they build a link.
    expect(saved.endpointPath).toBe("/v1");
    expect(saved.routePath).toBe("/team/cs_saved1");
  });

  test("puts the default model on the route and drops context windows outside Codex", () => {
    const saved = prepareDraftForSave(
      preset({
        clientType: "opencode",
        defaultModel: "kimi-k2",
        modelMappings: [
          { requestModel: "qwen3.5-plus", targetModel: "qwen3.5-plus", contextWindow: 1 },
        ],
      }),
    );
    expect(saved.modelMappings).toEqual([
      { requestModel: "qwen3.5-plus", targetModel: "qwen3.5-plus" },
      { requestModel: "kimi-k2", targetModel: "kimi-k2" },
    ]);
  });

  test("Claude Code stores the main target as default-model", () => {
    const saved = prepareDraftForSave(
      preset({
        clientType: "claude",
        defaultModel: "stale",
        modelMappings: [{ role: "main", requestModel: "claude-sonnet-5", targetModel: "kimi-k2" }],
      }),
    );
    expect(saved.defaultModel).toBe("kimi-k2");
    expect(saved.endpointPath).toBe("");
  });
});

describe("group and app changes", () => {
  test("a new group drops plain models, keeps aliases and restores the saved route on return", () => {
    const before = preset({
      clientType: "codex",
      defaultModel: "kimi-k2",
      modelMappings: [
        { requestModel: "kimi-k2", targetModel: "kimi-k2" },
        { requestModel: "gpt-5.4", targetModel: "deepseek-v4-flash" },
      ],
    });
    const moved = setChannelGroup(before, "other", before.routePath);
    expect(moved.allowedChannelGroups).toEqual(["other"]);
    expect(moved.routePath).toBe("/other/cs_abcdef");
    expect(moved.modelMappings).toEqual([
      { requestModel: "gpt-5.4", targetModel: "deepseek-v4-flash" },
    ]);
    expect(moved.defaultModel).toBe("");
    expect(setChannelGroup(moved, "team", before.routePath).routePath).toBe("/team/cs_saved1");
  });

  test("seeding fills the route with every model and picks a default only when there is one", () => {
    const empty = preset({ clientType: "codex", modelMappings: [] });
    const many = seedModels(empty, ["a", "b"]);
    expect(getRouteModels(many)).toEqual(["a", "b"]);
    expect(many.defaultModel).toBe("");
    expect(seedModels(empty, ["only"]).defaultModel).toBe("only");
    const claude = seedModels(preset({ clientType: "claude", modelMappings: [] }), ["only"]);
    expect(getPrimaryModel(claude)).toBe("only");
  });

  test("switching apps follows the default name and resets models across Claude Code", () => {
    const codex = preset({
      clientType: "codex",
      providerName: "CliProxy Codex",
      defaultModel: "kimi-k2",
      modelMappings: [{ requestModel: "kimi-k2", targetModel: "kimi-k2" }],
    });
    const opencode = setClientType(codex, "opencode");
    expect(opencode.providerName).toBe("CliProxy OpenCode");
    expect(getRouteModels(opencode)).toEqual(["kimi-k2"]);
    const claude = setClientType(opencode, "claude");
    expect(claude.modelMappings).toEqual([]);
    expect(setClientType({ ...codex, providerName: "Team relay" }, "gemini").providerName).toBe(
      "Team relay",
    );
  });
});
