import { describe, expect, test } from "vitest";
import {
  addAvailabilityModel,
  mergeAvailabilityItemList,
  mergeAvailabilityItems,
} from "./modelAvailabilityMerge";
import type { ModelAvailabilityItem } from "./modelAvailability";

const item = (
  id: string,
  ownedBy: string,
  extra: Partial<ModelAvailabilityItem> = {},
): ModelAvailabilityItem => ({
  id,
  owned_by: ownedBy,
  source: "provider",
  ...extra,
});

describe("mergeAvailabilityItems", () => {
  test("keeps both providers when the same alias arrives twice", () => {
    const merged = mergeAvailabilityItems(
      item("kimi", "kimi"),
      item("kimi", "opencode-go"),
    );

    expect(merged.owned_by).toBe("kimi");
    expect(merged.sources).toEqual([
      { label: "kimi", provider: "kimi", source: "provider" },
      { label: "opencode-go", provider: "opencode-go", source: "provider" },
    ]);
  });

  test("does not duplicate an identical source", () => {
    const first = item("kimi", "kimi", {
      sources: [{ label: "Kimi Official", provider: "kimi" }],
    });
    const merged = mergeAvailabilityItems(first, first);

    expect(merged.sources).toEqual([
      { label: "Kimi Official", provider: "kimi" },
    ]);
  });
});

describe("addAvailabilityModel", () => {
  test("merges duplicate alias ids instead of first-wins", () => {
    const map = new Map<string, ModelAvailabilityItem>();
    addAvailabilityModel(map, item("kimi", "kimi"));
    addAvailabilityModel(map, item("Kimi", "opencode-go"));

    expect(map.size).toBe(1);
    expect(map.get("kimi")?.sources?.map((source) => source.provider)).toEqual([
      "kimi",
      "opencode-go",
    ]);
  });
});

describe("mergeAvailabilityItemList", () => {
  test("collapses duplicate backend rows onto one model with combined sources", () => {
    const items = mergeAvailabilityItemList([
      item("kimi", "kimi", {
        sources: [{ label: "Kimi Official", provider: "kimi" }],
      }),
      item("kimi", "opencode-go", {
        sources: [{ label: "OpenCode Go", provider: "opencode-go" }],
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.sources?.map((source) => source.label)).toEqual([
      "Kimi Official",
      "OpenCode Go",
    ]);
  });
});
