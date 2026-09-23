import { describe, expect, test } from "vitest";
import {
  channelGroupAllowListHas,
  channelGroupExcludesModel,
  channelGroupServesModel,
  filterModelsServedByChannelGroup,
  matchesModelWildcard,
} from "../channelGroupModelGate";

// These cases mirror TestChannelGroupExcludesModel in CliRelay
// (sdk/routing/group_models_test.go). The panel filters candidate models with
// this function, so any drift from the backend puts a model on screen that the
// backend then refuses with a 403.
describe("channelGroupExcludesModel", () => {
  test.each<[string, string[], string, boolean]>([
    ["exact id", ["grok-4.7"], "grok-4.7", true],
    ["case and spacing", [" GROK-4.7 "], "grok-4.7", true],
    ["another model", ["grok-4.7"], "grok-4.6", false],
    ["no exclusions", [], "grok-4.7", false],
    ["blank request", ["*"], "  ", false],
    ["blank entries are ignored", ["", "  "], "grok-4.7", false],
    // The panel lists a prefixed credential's models with the prefix, while a
    // client routed by group path asks without it, and the reverse.
    ["prefixed entry, bare request", ["xai/grok-imagine-video-1.5"], "grok-imagine-video-1.5", true],
    ["bare entry, prefixed request", ["grok-imagine-video-1.5"], "xai/grok-imagine-video-1.5", true],
    ["different prefix on each side", ["xai/grok-4.7"], "team/grok-4.7", true],
    ["a prefix is not a partial match", ["grok-4"], "xai/grok-4.7", false],
    ["whole group", ["*"], "xai/grok-4.7", true],
    ["family wildcard", ["grok-imagine-*"], "grok-imagine-video-1.5", true],
    ["family wildcard through a prefix", ["grok-imagine-*"], "xai/grok-imagine-image", true],
    ["family wildcard leaves the rest", ["grok-imagine-*"], "grok-4.7", false],
    ["suffix wildcard", ["*-thinking"], "claude-opus-4-6-thinking", true],
    ["infix wildcard", ["*flash*"], "gemini-3-flash-preview", true],
    // Loose on purpose: blocking one model too many is the safe way to be wrong.
    ["vendor namespace counts as the bare id", ["claude-3.5-sonnet"], "anthropic/claude-3.5-sonnet", true],
    ["a prefixed wildcard still covers every model", ["xai/*"], "grok-4.7", true],
    ["a leading slash is not a route prefix", ["/grok-4.7"], "grok-4.7", false],
  ])("%s", (_name, excluded, model, expected) => {
    expect(channelGroupExcludesModel(excluded, model)).toBe(expected);
  });
});

// Mirrors TestMatchWildcard in CliRelay.
describe("matchesModelWildcard", () => {
  test.each<[string, string, boolean]>([
    ["", "", false],
    ["a", "a", true],
    ["a", "b", false],
    ["*", "", true],
    ["*", "anything", true],
    ["a*", "abc", true],
    ["a*", "bac", false],
    ["*c", "abc", true],
    ["a*c", "ac", true],
    ["ab*bc", "abc", false], // prefix and suffix may not overlap
    ["ab*bc", "abbc", true],
    ["a*b*c", "axxbyyc", true],
    ["a*b*c", "axxcyyb", false],
    ["A*", "abc", false], // case-sensitive: callers lower-case first
  ])("%s against %s", (pattern, value, expected) => {
    expect(matchesModelWildcard(pattern, value)).toBe(expected);
  });
});

describe("channel group allow list", () => {
  test("matches exact ids regardless of case, and nothing else", () => {
    expect(channelGroupAllowListHas(["Grok-4.7"], "grok-4.7")).toBe(true);
    expect(channelGroupAllowListHas(["grok-4.7"], "xai/grok-4.7")).toBe(false);
    expect(channelGroupAllowListHas(["grok-*"], "grok-4.7")).toBe(false);
  });

  test("gives '*' no special meaning", () => {
    expect(channelGroupAllowListHas(["*"], "grok-4.7")).toBe(false);
    expect(channelGroupServesModel({ allowedModels: ["*"] }, "grok-4.7")).toBe(false);
  });
});

describe("channelGroupServesModel", () => {
  test("serves everything when both lists are empty", () => {
    expect(channelGroupServesModel({}, "grok-5")).toBe(true);
    expect(channelGroupServesModel({ allowedModels: [" "], excludedModels: [""] }, "grok-5")).toBe(
      true,
    );
  });

  test("lets an exclusion win over an allow entry", () => {
    const gate = { allowedModels: ["grok-4.6", "grok-4.7"], excludedModels: ["xai/grok-4.7"] };
    expect(channelGroupServesModel(gate, "grok-4.6")).toBe(true);
    expect(channelGroupServesModel(gate, "grok-4.7")).toBe(false);
  });

  test("rejects a later model under an allow list but not under exclusions", () => {
    expect(channelGroupServesModel({ allowedModels: ["grok-4.6"] }, "grok-5")).toBe(false);
    expect(channelGroupServesModel({ excludedModels: ["grok-4.6"] }, "grok-5")).toBe(true);
  });

  test("filters a candidate list and keeps its order", () => {
    expect(
      filterModelsServedByChannelGroup(
        ["grok-4.7", "grok-imagine-video-1.5", "grok-4.6", "grok-imagine-image"],
        { excludedModels: ["grok-imagine-*"] },
      ),
    ).toEqual(["grok-4.7", "grok-4.6"]);
  });
});
