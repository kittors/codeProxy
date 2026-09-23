import { describe, expect, test } from "vitest";
import {
  clearAllModels,
  createModelSelectionDraft,
  migrateAllowListToExclusions,
  modelSelectionFromEntry,
  pruneModelSelection,
  selectAllModels,
  selectedModelIds,
  serializeModelSelection,
  setAutoAllowNewModels,
  toggleModelSelection,
  unselectedModelCount,
} from "./modelSelectionDraft";

const CATALOG = ["grok-4.5", "grok-4.6", "grok-4.7", "grok-imagine-video-1.5"];

describe("modelSelectionDraft", () => {
  test("a fresh draft allows everything and follows the upstream", () => {
    const selection = createModelSelectionDraft();
    expect(selection.autoAllowNewModels).toBe(true);
    expect(selectedModelIds(selection, CATALOG)).toEqual(new Set(CATALOG));
    expect(serializeModelSelection(selection)).toEqual({
      allowedModels: [],
      excludedModels: [],
    });
  });

  test("unchecking one model saves an exclusion, not a snapshot of the rest", () => {
    const selection = toggleModelSelection(
      createModelSelectionDraft(),
      CATALOG,
      "grok-imagine-video-1.5",
      false,
    );
    expect(serializeModelSelection(selection)).toEqual({
      allowedModels: [],
      excludedModels: ["grok-imagine-video-1.5"],
    });
    // The exclusion form says nothing about models that do not exist yet, so a
    // model the upstream adds tomorrow arrives checked.
    const withNewModel = [...CATALOG, "grok-5"];
    expect(selectedModelIds(selection, withNewModel).has("grok-5")).toBe(true);
  });

  test("re-checking the last exclusion returns the group to pure follow-upstream", () => {
    const narrowed = toggleModelSelection(createModelSelectionDraft(), CATALOG, "grok-4.5", false);
    const restored = toggleModelSelection(narrowed, CATALOG, "grok-4.5", true);
    expect(serializeModelSelection(restored)).toEqual({
      allowedModels: [],
      excludedModels: [],
    });
  });

  test("clearing every model saves the exclude-all wildcard", () => {
    // An empty allow list means "everything" on the backend, so "nothing" needs
    // the wildcard instead.
    const selection = clearAllModels(createModelSelectionDraft());
    expect(serializeModelSelection(selection)).toEqual({
      allowedModels: [],
      excludedModels: ["*"],
    });
    expect(selectedModelIds(selection, CATALOG).size).toBe(0);
  });

  test("turning the switch off freezes the current selection as an allow list", () => {
    const narrowed = toggleModelSelection(createModelSelectionDraft(), CATALOG, "grok-4.7", false);
    const frozen = setAutoAllowNewModels(narrowed, CATALOG, false);
    expect(serializeModelSelection(frozen)).toEqual({
      allowedModels: ["grok-4.5", "grok-4.6", "grok-imagine-video-1.5"],
      excludedModels: [],
    });
    // The visible checkboxes are unchanged by flipping the switch.
    expect(selectedModelIds(frozen, CATALOG)).toEqual(selectedModelIds(narrowed, CATALOG));
  });

  test("a saved exclusion list reopens in automatic mode", () => {
    const selection = modelSelectionFromEntry({ excludedModels: ["grok-4.5"] });
    expect(selection.autoAllowNewModels).toBe(true);
    expect(selection.pendingAllowListMigration).toBe(false);
    expect(selectedModelIds(selection, CATALOG).has("grok-4.5")).toBe(false);
  });

  test("a saved allow list is kept verbatim until the catalog is known", () => {
    const selection = modelSelectionFromEntry({ allowedModels: ["grok-4.5", "grok-4.6"] });
    expect(selection.pendingAllowListMigration).toBe(true);
    // Saving from another tab, before the model list loads, must not widen or
    // narrow the group.
    expect(serializeModelSelection(selection)).toEqual({
      allowedModels: ["grok-4.5", "grok-4.6"],
      excludedModels: [],
    });
    expect(migrateAllowListToExclusions(selection, [])).toBe(selection);
  });

  test("migrating a saved allow list keeps the same models and reports the gap", () => {
    // The reported scenario: the group was saved when grok-4.7 did not exist, so
    // the frozen allow list silently blocks it.
    const saved = modelSelectionFromEntry({
      allowedModels: ["grok-4.5", "grok-4.6", "grok-imagine-video-1.5"],
    });
    const migrated = migrateAllowListToExclusions(saved, CATALOG);
    expect(serializeModelSelection(migrated)).toEqual({
      allowedModels: [],
      excludedModels: ["grok-4.7"],
    });
    expect(unselectedModelCount(migrated, CATALOG)).toBe(1);

    // One click on "include all models" makes the group follow the upstream for good.
    const includeAll = selectAllModels(migrated, CATALOG);
    expect(serializeModelSelection(includeAll)).toEqual({
      allowedModels: [],
      excludedModels: [],
    });
  });

  test("migrating an allow list that already covers the catalog clears both lists", () => {
    const saved = modelSelectionFromEntry({ allowedModels: CATALOG });
    expect(serializeModelSelection(migrateAllowListToExclusions(saved, CATALOG))).toEqual({
      allowedModels: [],
      excludedModels: [],
    });
  });

  test("pruning drops entries for models the channels no longer serve", () => {
    const selection = modelSelectionFromEntry({ excludedModels: ["grok-4.5", "retired-model"] });
    expect(serializeModelSelection(pruneModelSelection(selection, CATALOG))).toEqual({
      allowedModels: [],
      excludedModels: ["grok-4.5"],
    });
  });

  test("pruning leaves the exclude-all wildcard and an unloaded catalog alone", () => {
    const blocked = clearAllModels(createModelSelectionDraft());
    expect(pruneModelSelection(blocked, CATALOG)).toBe(blocked);
    const pending = modelSelectionFromEntry({ allowedModels: ["grok-4.5"] });
    expect(pruneModelSelection(pending, [])).toBe(pending);
  });
});
