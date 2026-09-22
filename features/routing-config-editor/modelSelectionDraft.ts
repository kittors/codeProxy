/**
 * Model selection state for the channel-group editor.
 *
 * The backend gate has two halves (see RoutingChannelGroup in Go):
 *
 *   both lists empty   → every model the group's channels serve, now and later
 *   allowed-models set → a frozen allow list; models the upstream adds later are
 *                        rejected until an operator edits the group
 *   excluded-models set→ everything except these, so new upstream models stay
 *                        usable untouched
 *
 * The editor used to write an allow list, snapshotting whatever models existed
 * on the day someone unchecked a box. That silently blocked every model the
 * upstream shipped afterwards. `autoAllowNewModels` (on by default) makes the
 * editor write exclusions instead, which is the only form that can express
 * "all but these" without freezing today's catalog.
 */

export type ModelSelectionDraft = {
  /** On: serialize as exclusions, so models added upstream later stay allowed. */
  autoAllowNewModels: boolean;
  /** Frozen allow list; non-empty only while a saved allow list awaits migration. */
  allowedModels: string[];
  excludedModels: string[];
  /**
   * A saved allow list cannot be turned into exclusions until the full model
   * list is known, and that list only loads once the Models tab is opened. Until
   * then the draft keeps the allow list verbatim so saving from another tab
   * cannot widen or narrow the group by accident.
   */
  pendingAllowListMigration: boolean;
};

/** Exclusion entry meaning "no model at all", matching the backend wildcard. */
const EXCLUDE_ALL = "*";

const normalizeList = (models: readonly string[]): string[] =>
  Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));

const lowerSet = (models: readonly string[]): Set<string> =>
  new Set(models.map((model) => model.trim().toLowerCase()).filter(Boolean));

export function createModelSelectionDraft(): ModelSelectionDraft {
  return {
    autoAllowNewModels: true,
    allowedModels: [],
    excludedModels: [],
    pendingAllowListMigration: false,
  };
}

export function excludesEveryModel(selection: ModelSelectionDraft): boolean {
  return selection.excludedModels.some((model) => model.trim() === EXCLUDE_ALL);
}

/**
 * Builds the draft for a saved group. A stored allow list opens in automatic
 * mode — an operator who narrowed a group once should not have to re-discover
 * that new models are being dropped — but stays verbatim until the Models tab
 * supplies the full list it has to be subtracted from.
 */
export function modelSelectionFromEntry(entry: {
  allowedModels?: readonly string[];
  excludedModels?: readonly string[];
}): ModelSelectionDraft {
  const allowedModels = normalizeList(entry.allowedModels ?? []);
  const excludedModels = normalizeList(entry.excludedModels ?? []);
  if (excludedModels.length > 0) {
    return {
      autoAllowNewModels: true,
      allowedModels: [],
      excludedModels,
      pendingAllowListMigration: false,
    };
  }
  return {
    autoAllowNewModels: true,
    allowedModels,
    excludedModels: [],
    pendingAllowListMigration: allowedModels.length > 0,
  };
}

/**
 * Turns a pending allow list into the equivalent exclusion list now that the
 * full model list is known. Returns the draft unchanged when there is nothing to
 * migrate or the model list has not loaded, so an empty list never reads as
 * "exclude everything".
 */
export function migrateAllowListToExclusions(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
): ModelSelectionDraft {
  if (!selection.pendingAllowListMigration || modelOptionIds.length === 0) return selection;
  const allowed = lowerSet(selection.allowedModels);
  const excludedModels = modelOptionIds.filter((model) => !allowed.has(model.trim().toLowerCase()));
  return {
    autoAllowNewModels: true,
    allowedModels: [],
    excludedModels: normalizeList(excludedModels),
    pendingAllowListMigration: false,
  };
}

/** Model ids to render as checked. */
export function selectedModelIds(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
): Set<string> {
  if (excludesEveryModel(selection)) return new Set();
  if (selection.pendingAllowListMigration || selection.allowedModels.length > 0) {
    return new Set(normalizeList(selection.allowedModels));
  }
  const excluded = lowerSet(selection.excludedModels);
  return new Set(modelOptionIds.filter((model) => !excluded.has(model.trim().toLowerCase())));
}

/**
 * Count of models that a saved allow list leaves out. Surfaced as a hint so the
 * operator can see that a group carried over from the allow-list era is still
 * missing models the upstream has since added.
 */
export function unselectedModelCount(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
): number {
  const selected = selectedModelIds(selection, modelOptionIds);
  return modelOptionIds.filter((model) => !selected.has(model)).length;
}

function applySelection(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
  nextSelected: Set<string>,
): ModelSelectionDraft {
  const selectedList = modelOptionIds.filter((model) => nextSelected.has(model));
  if (selectedList.length === 0) {
    // An empty allow list reads as "everything" on the backend, so the only
    // faithful way to say "nothing" is the exclude-all wildcard.
    return {
      ...selection,
      allowedModels: [],
      excludedModels: [EXCLUDE_ALL],
      pendingAllowListMigration: false,
    };
  }
  if (selection.autoAllowNewModels) {
    return {
      ...selection,
      allowedModels: [],
      excludedModels: normalizeList(modelOptionIds.filter((model) => !nextSelected.has(model))),
      pendingAllowListMigration: false,
    };
  }
  return {
    ...selection,
    allowedModels: normalizeList(selectedList),
    excludedModels: [],
    pendingAllowListMigration: false,
  };
}

export function toggleModelSelection(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
  modelId: string,
  checked: boolean,
): ModelSelectionDraft {
  const normalized = modelId.trim();
  if (!normalized) return selection;
  const nextSelected = selectedModelIds(selection, modelOptionIds);
  if (checked) nextSelected.add(normalized);
  else nextSelected.delete(normalized);
  return applySelection(selection, modelOptionIds, nextSelected);
}

export function selectAllModels(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
): ModelSelectionDraft {
  return applySelection(selection, modelOptionIds, new Set(modelOptionIds));
}

export function clearAllModels(selection: ModelSelectionDraft): ModelSelectionDraft {
  return {
    ...selection,
    allowedModels: [],
    excludedModels: [EXCLUDE_ALL],
    pendingAllowListMigration: false,
  };
}

/**
 * Re-serializes the current checkbox state under a flipped switch, keeping the
 * visible selection identical while changing how it is stored.
 */
export function setAutoAllowNewModels(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
  autoAllowNewModels: boolean,
): ModelSelectionDraft {
  if (selection.autoAllowNewModels === autoAllowNewModels) return selection;
  const selected = selectedModelIds(selection, modelOptionIds);
  const next = { ...selection, autoAllowNewModels };
  // Without the full model list the selection cannot be re-expressed, so the
  // stored lists stay as they are until the Models tab loads.
  if (modelOptionIds.length === 0) return next;
  return applySelection(next, modelOptionIds, selected);
}

/**
 * Drops entries for models the group's channels no longer serve. A pending
 * allow list is left alone: it is still awaiting migration against a model list
 * that may not have loaded yet.
 */
export function pruneModelSelection(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
): ModelSelectionDraft {
  if (excludesEveryModel(selection) || modelOptionIds.length === 0) return selection;
  const available = lowerSet(modelOptionIds);
  const keep = (models: string[]) =>
    models.filter((model) => available.has(model.trim().toLowerCase()));
  const allowedModels = selection.pendingAllowListMigration
    ? selection.allowedModels
    : keep(selection.allowedModels);
  const excludedModels = keep(selection.excludedModels);
  if (
    allowedModels.length === selection.allowedModels.length &&
    excludedModels.length === selection.excludedModels.length
  ) {
    return selection;
  }
  return { ...selection, allowedModels, excludedModels };
}

/** The two lists to persist on the group entry. */
export function serializeModelSelection(selection: ModelSelectionDraft): {
  allowedModels: string[];
  excludedModels: string[];
} {
  if (excludesEveryModel(selection)) {
    return { allowedModels: [], excludedModels: [EXCLUDE_ALL] };
  }
  return {
    allowedModels: normalizeList(selection.allowedModels),
    excludedModels: normalizeList(selection.excludedModels),
  };
}
