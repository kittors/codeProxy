import { describe, expect, test } from "vitest";
import {
  clearAllModels,
  createModelSelectionDraft,
  lockedModelRules,
  modelRulesOutsideList,
  modelSelectionFromEntry,
  modelSelectionSaveError,
  removeModelRule,
  selectAllModels,
  selectedModelIds,
  serializeModelSelection,
  setAutoAllowNewModels,
  toggleModelSelection,
} from "./modelSelectionDraft";

const CATALOG = ["grok-4.5", "grok-4.6", "grok-4.7", "grok-imagine-video-1.5"];

describe("modelSelectionDraft", () => {
  test("a fresh draft allows everything and follows the upstream", () => {
    const selection = createModelSelectionDraft(true);
    expect(selection.autoAllowNewModels).toBe(true);
    expect(selectedModelIds(selection, CATALOG)).toEqual(new Set(CATALOG));
    expect(serializeModelSelection(selection)).toEqual({
      allowedModels: [],
      excludedModels: [],
    });
  });

  test("unchecking one model saves an exclusion, not a snapshot of the rest", () => {
    const selection = toggleModelSelection(
      createModelSelectionDraft(true),
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
    const narrowed = toggleModelSelection(createModelSelectionDraft(true), CATALOG, "grok-4.5", false);
    const restored = toggleModelSelection(narrowed, CATALOG, "grok-4.5", true);
    expect(serializeModelSelection(restored)).toEqual({
      allowedModels: [],
      excludedModels: [],
    });
  });

  test("clearing every model saves the exclude-all wildcard", () => {
    // An empty allow list means "everything" on the backend, so "nothing" needs
    // the wildcard instead.
    const selection = clearAllModels(createModelSelectionDraft(true), CATALOG);
    expect(serializeModelSelection(selection)).toEqual({
      allowedModels: [],
      excludedModels: ["*"],
    });
    expect(selectedModelIds(selection, CATALOG).size).toBe(0);
  });

  test("turning the switch off freezes the current selection as an allow list", () => {
    const narrowed = toggleModelSelection(createModelSelectionDraft(true), CATALOG, "grok-4.7", false);
    const frozen = setAutoAllowNewModels(narrowed, CATALOG, false);
    expect(serializeModelSelection(frozen)).toEqual({
      allowedModels: ["grok-4.5", "grok-4.6", "grok-imagine-video-1.5"],
      excludedModels: [],
    });
    // The visible checkboxes are unchanged by flipping the switch.
    expect(selectedModelIds(frozen, CATALOG)).toEqual(selectedModelIds(narrowed, CATALOG));
  });

  test("a saved exclusion list reopens in automatic mode", () => {
    const selection = modelSelectionFromEntry({ excludedModels: ["grok-4.5"] }, true);
    expect(selection.autoAllowNewModels).toBe(true);
    expect(selectedModelIds(selection, CATALOG).has("grok-4.5")).toBe(false);
  });

  // Replaces "a saved allow list is kept verbatim until the catalog is known" and
  // "migrating a saved allow list keeps the same models and reports the gap":
  // both locked in an automatic conversion, which opened the group to every
  // model the list did not show as soon as someone opened the Models tab.
  test("a saved allow list reopens as a fixed list and stays one through edits", () => {
    const saved = modelSelectionFromEntry(
      { allowedModels: ["grok-4.5", "grok-4.6", "grok-imagine-video-1.5"] },
      true,
    );
    expect(saved.autoAllowNewModels).toBe(false);
    expect(serializeModelSelection(saved)).toEqual({
      allowedModels: ["grok-4.5", "grok-4.6", "grok-imagine-video-1.5"],
      excludedModels: [],
    });

    const edited = toggleModelSelection(saved, CATALOG, "grok-4.5", false);
    expect(serializeModelSelection(edited)).toEqual({
      allowedModels: ["grok-4.6", "grok-imagine-video-1.5"],
      excludedModels: [],
    });
  });

  test("only turning the switch on converts an allow list, keeping the checked set", () => {
    // The reported case: the list was saved before grok-4.7 existed.
    const saved = modelSelectionFromEntry(
      { allowedModels: ["grok-4.5", "grok-4.6", "grok-imagine-video-1.5"] },
      true,
    );
    const converted = setAutoAllowNewModels(saved, CATALOG, true);
    expect(converted.autoAllowNewModels).toBe(true);
    expect(serializeModelSelection(converted)).toEqual({
      allowedModels: [],
      excludedModels: ["grok-4.7"],
    });
    expect(selectedModelIds(converted, CATALOG)).toEqual(selectedModelIds(saved, CATALOG));
  });

  test("the switch cannot move without a loaded model list", () => {
    // With no list every model reads as unchecked, so a flip would store the
    // group as excluding everything (or keep a stale allow list under "on").
    const fixed = modelSelectionFromEntry({ allowedModels: ["grok-4.5"] }, true);
    expect(setAutoAllowNewModels(fixed, [], true)).toBe(fixed);
    const automatic = modelSelectionFromEntry({ excludedModels: ["grok-4.5"] }, true);
    expect(setAutoAllowNewModels(automatic, [], false)).toBe(automatic);
  });

  // Replaces "pruning drops entries for models the channels no longer serve": the
  // list is a filtered view (disabled or cooling accounts, catalog switches,
  // owner mappings), so dropping what it does not show deleted exclusions and
  // could leave the group serving everything.
  test("exclusions the list cannot show are kept through every edit", () => {
    const saved = modelSelectionFromEntry(
      { excludedModels: ["grok-4.5", "retired-model"] },
      true,
    );
    expect(modelRulesOutsideList(saved, CATALOG).unlistedExclusions).toEqual(["retired-model"]);

    const toggled = toggleModelSelection(saved, CATALOG, "grok-4.6", false);
    expect(serializeModelSelection(toggled).excludedModels).toEqual([
      "grok-4.5",
      "retired-model",
      "grok-4.6",
    ]);

    const all = selectAllModels(toggled, CATALOG);
    expect(serializeModelSelection(all).excludedModels).toEqual(["retired-model"]);

    const none = clearAllModels(all, CATALOG);
    expect(serializeModelSelection(none).excludedModels).toEqual(["*", "retired-model"]);

    // Leaving "exclude everything" through one checkbox must not forget it either.
    const reopened = toggleModelSelection(none, CATALOG, "grok-4.5", true);
    expect(serializeModelSelection(reopened).excludedModels).toEqual([
      "retired-model",
      "grok-4.6",
      "grok-4.7",
      "grok-imagine-video-1.5",
    ]);
  });

  test("allow entries the list cannot show are kept and reported", () => {
    const saved = modelSelectionFromEntry({ allowedModels: ["grok-4.5", "grok-3-legacy"] }, true);
    expect(modelRulesOutsideList(saved, CATALOG).unlistedAllowed).toEqual(["grok-3-legacy"]);
    const edited = toggleModelSelection(saved, CATALOG, "grok-4.6", true);
    expect(serializeModelSelection(edited).allowedModels).toEqual([
      "grok-4.5",
      "grok-4.6",
      "grok-3-legacy",
    ]);
  });

  test("a group with both lists keeps both and opens as a fixed list", () => {
    const saved = modelSelectionFromEntry(
      { allowedModels: ["grok-4.5", "grok-4.6"], excludedModels: ["grok-4.6"] },
      true,
    );
    expect(saved.autoAllowNewModels).toBe(false);
    expect(serializeModelSelection(saved)).toEqual({
      allowedModels: ["grok-4.5", "grok-4.6"],
      excludedModels: ["grok-4.6"],
    });
    // The backend serves the allow list minus the exclusions.
    expect(selectedModelIds(saved, CATALOG)).toEqual(new Set(["grok-4.5"]));

    const edited = toggleModelSelection(saved, CATALOG, "grok-4.7", true);
    expect(serializeModelSelection(edited)).toEqual({
      allowedModels: ["grok-4.5", "grok-4.7"],
      excludedModels: ["grok-4.6"],
    });
  });

  test("an exclude-all group reopens as a fixed list, so one check opens one model", () => {
    const blocked = modelSelectionFromEntry({ excludedModels: ["*"] }, true);
    expect(blocked.autoAllowNewModels).toBe(false);
    const opened = toggleModelSelection(blocked, CATALOG, "grok-4.5", true);
    expect(serializeModelSelection(opened)).toEqual({
      allowedModels: ["grok-4.5"],
      excludedModels: [],
    });
  });

  test("a wildcard exclusion locks the rows it covers until the rule is removed", () => {
    const saved = modelSelectionFromEntry({ excludedModels: ["grok-imagine-*"] }, true);
    expect(lockedModelRules(saved, CATALOG)).toEqual(
      new Map([["grok-imagine-video-1.5", "grok-imagine-*"]]),
    );
    expect(modelRulesOutsideList(saved, CATALOG).wildcardExclusions).toEqual(["grok-imagine-*"]);
    // Re-checking one member would delete a rule that also blocks future ones.
    expect(toggleModelSelection(saved, CATALOG, "grok-imagine-video-1.5", true)).toBe(saved);
    expect(serializeModelSelection(selectAllModels(saved, CATALOG)).excludedModels).toEqual([
      "grok-imagine-*",
    ]);

    const removed = removeModelRule(saved, "excluded", "grok-imagine-*");
    expect(selectedModelIds(removed, CATALOG)).toEqual(new Set(CATALOG));
  });

  test("an exclusion covers every spelling of a model, so those rows move together", () => {
    const listed = ["grok-4.6", "grok-4.7", "xai/grok-4.7"];
    const narrowed = toggleModelSelection(createModelSelectionDraft(true), listed, "xai/grok-4.7", false);
    expect(selectedModelIds(narrowed, listed)).toEqual(new Set(["grok-4.6"]));

    const restored = toggleModelSelection(narrowed, listed, "grok-4.7", true);
    expect(serializeModelSelection(restored).excludedModels).toEqual([]);
    expect(selectedModelIds(restored, listed)).toEqual(new Set(listed));
  });

  test("removing the last allow entry does not open the group to everything", () => {
    const saved = modelSelectionFromEntry({ allowedModels: ["grok-3-legacy"] }, true);
    const removed = removeModelRule(saved, "allowed", "grok-3-legacy");
    expect(serializeModelSelection(removed)).toEqual({ allowedModels: [], excludedModels: ["*"] });
  });

  test("edits that change nothing return the same draft", () => {
    const selection = createModelSelectionDraft(true);
    expect(toggleModelSelection(selection, CATALOG, "grok-4.5", true)).toBe(selection);
    expect(selectAllModels(selection, CATALOG)).toBe(selection);
    expect(toggleModelSelection(selection, CATALOG, "not-listed", false)).toBe(selection);
  });

  describe("on a backend without exclusion support", () => {
    test("everything opens and is saved as a fixed allow list", () => {
      const selection = createModelSelectionDraft(false);
      expect(selection.autoAllowNewModels).toBe(false);
      expect(modelSelectionFromEntry({}, false).autoAllowNewModels).toBe(false);
      expect(modelSelectionFromEntry({ excludedModels: ["grok-4.5"] }, false).autoAllowNewModels).toBe(
        false,
      );

      const edited = toggleModelSelection(selection, CATALOG, "grok-4.7", false);
      expect(serializeModelSelection(edited)).toEqual({
        allowedModels: ["grok-4.5", "grok-4.6", "grok-imagine-video-1.5"],
        excludedModels: [],
      });
      expect(modelSelectionSaveError(edited)).toBe("");
      // The switch cannot be turned on at all.
      expect(setAutoAllowNewModels(edited, CATALOG, true)).toBe(edited);
    });

    test("an edit that relies on exclusions alone cannot be saved", () => {
      // The backend would drop ["*"] and store a group that serves every model.
      const cleared = clearAllModels(createModelSelectionDraft(false), CATALOG);
      expect(serializeModelSelection(cleared)).toEqual({ allowedModels: [], excludedModels: ["*"] });
      expect(modelSelectionSaveError(cleared)).toBe(
        "channel_groups_page.models_save_needs_exclusions",
      );
    });

    test("exclusions the backend itself returned are written back untouched", () => {
      const saved = modelSelectionFromEntry({ excludedModels: ["grok-4.5"] }, false);
      expect(modelSelectionSaveError(saved)).toBe("");
      expect(serializeModelSelection(saved)).toEqual({
        allowedModels: [],
        excludedModels: ["grok-4.5"],
      });
    });
  });
});
