/**
 * Model selection state for the channel-group editor.
 *
 * The backend gate (config.RoutingChannelGroup in CliRelay; its matching rules
 * are mirrored in @code-proxy/domain channelGroupModelGate):
 *
 *   both lists empty    → every model the group's channels serve, now and later
 *   allowed-models set  → an allow list; models the upstream adds later are
 *                         rejected until an operator edits the group, unless
 *                         the group follows upstream (see below)
 *   excluded-models set → everything except these, so new upstream models stay
 *                         usable untouched
 *   both set            → the allow list minus the exclusions
 *
 * `follow-upstream-models` only matters with an allow list: the list then also
 * admits what Codex discovery lists later, so a curated group gets new OpenAI
 * models without opening up to every model its channels serve. Unset means on
 * for the default group and off for every other one, as the backend reads it.
 *
 * The "auto-allow new models" switch only decides which list an edit writes:
 * on → exclusions, off → a fixed allow list. Two rules keep the editor from
 * widening a group behind the operator's back:
 *
 * - Nothing is rewritten on load. The switch position is read off the stored
 *   lists, and an allow list becomes exclusions only when the operator turns
 *   the switch on. (It used to convert as soon as the model list loaded, so
 *   opening the Models tab and saving opened the group to every model that
 *   list did not happen to show, and to every later one.)
 * - An entry goes only through an action on a model it names, or when the
 *   operator removes it. The model list is a filtered, point-in-time view —
 *   accounts disabled or cooling down, catalog switches, owner mappings — so an
 *   entry it cannot show is kept and surfaced as "not currently offered".
 */
import {
  channelGroupAllowListHas,
  channelGroupExcludesModel,
  channelGroupServesModel,
  exclusionEntryMatchesModel,
} from "@code-proxy/domain/models/channelGroupModelGate";

/**
 * What the backend stores for a group's model gate, read off the routing-config
 * capabilities (RoutingConfigSupport in the api-client has this shape).
 */
export type ModelGateSupport = {
  channelGroupExcludedModels: boolean;
  channelGroupFollowUpstreamModels: boolean;
};

export type ModelSelectionDraft = {
  /** On: edits are saved as exclusions, so models the upstream adds later stay allowed. */
  autoAllowNewModels: boolean;
  allowedModels: string[];
  excludedModels: string[];
  /**
   * The backend advertises `channel-group-excluded-models`. An older one drops
   * `excluded-models` without an error, so without it only fixed allow lists
   * are written.
   */
  exclusionsSupported: boolean;
  /**
   * `follow-upstream-models` as stored or as the operator set it; undefined when
   * never set. Kept as read so a save leaves an unset group unset.
   */
  followUpstreamModels?: boolean;
  /** What an unset setting means for this group: on only for the default group. */
  followsByDefault: boolean;
  /** The backend advertises `channel-group-follow-upstream-models`; an older one drops it. */
  followUpstreamSupported: boolean;
  /**
   * What following upstream admits beyond the allow list, as the backend worked
   * it out for the saved group (GET /channel-groups). Read-only.
   */
  upstreamModels: string[];
  /** The operator changed the model gate during this edit. */
  touched: boolean;
};

export type ModelListName = "allowed" | "excluded";

/** Stored entries that the current model list cannot show as a row of their own. */
export type ModelRulesOutsideList = {
  /** Exclusions naming no listed model; kept so the model stays blocked when it returns. */
  unlistedExclusions: string[];
  /** Family rules such as "grok-imagine-*", which also cover models not listed yet. */
  wildcardExclusions: string[];
  /** Allow entries naming no listed model. */
  unlistedAllowed: string[];
};

/** Exclusion entry meaning "no model at all", matching the backend wildcard. */
const EXCLUDE_ALL = "*";

/** The root group behind /v1, the one group that follows upstream when unset. */
const ROOT_GROUP_NAME = "default";

const normalizeList = (models: readonly string[]): string[] =>
  Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));

const isExcludeAll = (entry: string) => entry.trim() === EXCLUDE_ALL;

const isWildcardRule = (entry: string) => entry.includes("*") && !isExcludeAll(entry);

const sameEntries = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((entry) => b.includes(entry));

export function createModelSelectionDraft(support: ModelGateSupport): ModelSelectionDraft {
  return {
    autoAllowNewModels: support.channelGroupExcludedModels,
    allowedModels: [],
    excludedModels: [],
    exclusionsSupported: support.channelGroupExcludedModels,
    // A new group is never the default one, which always exists already.
    followsByDefault: false,
    followUpstreamSupported: support.channelGroupFollowUpstreamModels,
    upstreamModels: [],
    touched: false,
  };
}

export function excludesEveryModel(selection: ModelSelectionDraft): boolean {
  return selection.excludedModels.some(isExcludeAll);
}

/**
 * Builds the draft for a saved group without rewriting either list. The switch
 * follows what is stored: an allow list (alone or with exclusions) is a fixed
 * list, and exclusions alone or no lists at all follow the upstream.
 */
export function modelSelectionFromEntry(
  entry: {
    name?: string;
    allowedModels?: readonly string[];
    excludedModels?: readonly string[];
    followUpstreamModels?: boolean;
    discoveredModels?: readonly string[];
  },
  support: ModelGateSupport,
): ModelSelectionDraft {
  const allowedModels = normalizeList(entry.allowedModels ?? []);
  const excludedModels = normalizeList(entry.excludedModels ?? []);
  const exclusionsSupported = support.channelGroupExcludedModels;
  return {
    // "*" blocks every model, so it implies neither reading; the fixed one makes
    // the next checkbox open that model alone instead of everything but the list.
    autoAllowNewModels:
      exclusionsSupported && allowedModels.length === 0 && !excludedModels.some(isExcludeAll),
    allowedModels,
    excludedModels,
    exclusionsSupported,
    followUpstreamModels: entry.followUpstreamModels,
    followsByDefault: (entry.name ?? "").trim().toLowerCase() === ROOT_GROUP_NAME,
    followUpstreamSupported: support.channelGroupFollowUpstreamModels,
    upstreamModels: normalizeList(entry.discoveredModels ?? []),
    touched: false,
  };
}

/** Whether the group's allow list also admits models Codex discovery lists later. */
export function followsUpstreamModels(selection: ModelSelectionDraft): boolean {
  return selection.followUpstreamModels ?? selection.followsByDefault;
}

/**
 * The models following upstream adds to this draft's allow list: what the
 * backend reported for the saved group, minus what the draft now checks or
 * excludes, since an edit can take a model off that list either way.
 */
export function upstreamModelsBeyondList(selection: ModelSelectionDraft): string[] {
  return selection.upstreamModels.filter(
    (model) =>
      !channelGroupAllowListHas(selection.allowedModels, model) &&
      !channelGroupExcludesModel(selection.excludedModels, model),
  );
}

/**
 * Sets whether the allow list also admits what Codex discovery lists later.
 * Unlike the auto-allow switch it rewrites neither list, so it needs no loaded
 * model list. Turning it on still widens the group, to every model discovery
 * lists from now on, which the panel spells out next to the switch.
 */
export function setFollowUpstreamModels(
  selection: ModelSelectionDraft,
  follow: boolean,
): ModelSelectionDraft {
  if (!selection.followUpstreamSupported || followsUpstreamModels(selection) === follow) {
    return selection;
  }
  return { ...selection, followUpstreamModels: follow, touched: true };
}

/** Model ids to render as checked: exactly the listed ones the backend would serve. */
export function selectedModelIds(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
): Set<string> {
  return new Set(modelOptionIds.filter((id) => channelGroupServesModel(selection, id)));
}

/**
 * Listed models blocked by a wildcard exclusion, mapped to that rule. Checking
 * one would mean deleting a rule that also covers unlisted and future models,
 * so the row stays locked until the operator removes the rule itself.
 */
export function lockedModelRules(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
): Map<string, string> {
  const rules = selection.excludedModels.filter(isWildcardRule);
  const locked = new Map<string, string>();
  for (const id of modelOptionIds) {
    const rule = rules.find((entry) => exclusionEntryMatchesModel(entry, id));
    if (rule) locked.set(id, rule);
  }
  return locked;
}

export function modelRulesOutsideList(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
): ModelRulesOutsideList {
  const exclusions = selection.excludedModels.filter((entry) => !isExcludeAll(entry));
  return {
    unlistedExclusions: exclusions.filter(
      (entry) =>
        !isWildcardRule(entry) &&
        !modelOptionIds.some((id) => exclusionEntryMatchesModel(entry, id)),
    ),
    wildcardExclusions: exclusions.filter(isWildcardRule),
    // Under "*" the allow list serves nothing, and the next edit drops it.
    unlistedAllowed: excludesEveryModel(selection)
      ? []
      : selection.allowedModels.filter((entry) => !channelGroupAllowListHas(modelOptionIds, entry)),
  };
}

/**
 * Stores `checked` — the listed models that should be served — in the form the
 * switch asks for, keeping every entry the list cannot show. A plain exclusion
 * naming a model that is now checked goes, since it would still block it.
 */
function withCheckedModels(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
  checked: ReadonlySet<string>,
): ModelSelectionDraft {
  const checkedIds = modelOptionIds.filter((id) => checked.has(id));
  const kept = selection.excludedModels.filter(
    (entry) =>
      !isExcludeAll(entry) &&
      (isWildcardRule(entry) || !checkedIds.some((id) => exclusionEntryMatchesModel(entry, id))),
  );
  let allowedModels: string[] = [];
  let excludedModels = kept;
  if (selection.autoAllowNewModels) {
    const uncovered = modelOptionIds.filter(
      (id) => !checked.has(id) && !channelGroupExcludesModel(kept, id),
    );
    excludedModels = [...kept, ...uncovered];
  } else {
    // An allow list that "*" was overriding served nothing, so carrying its
    // unlisted entries over would open them up.
    const unlisted = excludesEveryModel(selection)
      ? []
      : selection.allowedModels.filter((entry) => !channelGroupAllowListHas(modelOptionIds, entry));
    allowedModels = [...checkedIds, ...unlisted];
  }
  if (checkedIds.length === 0 && allowedModels.length === 0) {
    // Empty lists read as "everything" on the backend, so "none of these" has to
    // be the exclude-all wildcard.
    excludedModels = [EXCLUDE_ALL, ...kept];
  }
  const next = {
    allowedModels: normalizeList(allowedModels),
    excludedModels: normalizeList(excludedModels),
  };
  if (
    sameEntries(next.allowedModels, selection.allowedModels) &&
    sameEntries(next.excludedModels, selection.excludedModels)
  ) {
    return selection;
  }
  return { ...selection, ...next, touched: true };
}

export function toggleModelSelection(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
  modelId: string,
  checked: boolean,
): ModelSelectionDraft {
  const id = modelOptionIds.find((option) => option === modelId.trim());
  if (!id || (checked && lockedModelRules(selection, [id]).size > 0)) return selection;
  const current = selectedModelIds(selection, modelOptionIds);
  if (current.has(id) === checked) return selection;
  // An exclusion covers every spelling of a model ("xai/grok-4.7" is also
  // "grok-4.7"), so under exclusions those rows can only move together.
  const affected = selection.autoAllowNewModels
    ? modelOptionIds.filter((option) => exclusionEntryMatchesModel(id, option))
    : [id];
  const next = new Set(current);
  for (const option of affected) {
    if (checked) next.add(option);
    else next.delete(option);
  }
  return withCheckedModels(selection, modelOptionIds, next);
}

export function selectAllModels(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
): ModelSelectionDraft {
  const locked = lockedModelRules(selection, modelOptionIds);
  const selectable = modelOptionIds.filter((id) => !locked.has(id));
  return withCheckedModels(selection, modelOptionIds, new Set(selectable));
}

export function clearAllModels(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
): ModelSelectionDraft {
  if (modelOptionIds.length === 0) return selection;
  return withCheckedModels(selection, modelOptionIds, new Set());
}

/**
 * Flips the switch without changing which listed models are checked.
 *
 * On: the stored allow list becomes exclusions for the listed models it leaves
 * out. That is the one widening step here — every model the list does not
 * show, and every later one, becomes allowed — so the panel confirms it first.
 * Off: the checked models become the allow list; the exclusions have nothing
 * left to block once only named models pass.
 *
 * Both directions need a loaded model list: without one the checked set is
 * unknown, and an empty set would read as "exclude everything".
 */
export function setAutoAllowNewModels(
  selection: ModelSelectionDraft,
  modelOptionIds: readonly string[],
  autoAllowNewModels: boolean,
): ModelSelectionDraft {
  if (selection.autoAllowNewModels === autoAllowNewModels || modelOptionIds.length === 0) {
    return selection;
  }
  if (autoAllowNewModels && !selection.exclusionsSupported) return selection;
  const checked = selectedModelIds(selection, modelOptionIds);
  if (autoAllowNewModels) {
    const switched = { ...selection, autoAllowNewModels: true, allowedModels: [] };
    return { ...withCheckedModels(switched, modelOptionIds, checked), touched: true };
  }
  const allowedModels = modelOptionIds.filter((id) => checked.has(id));
  return {
    ...selection,
    autoAllowNewModels: false,
    allowedModels,
    excludedModels: allowedModels.length > 0 ? [] : [EXCLUDE_ALL],
    touched: true,
  };
}

/** Removes one stored entry because the operator asked to. */
export function removeModelRule(
  selection: ModelSelectionDraft,
  list: ModelListName,
  entry: string,
): ModelSelectionDraft {
  if (list === "excluded") {
    if (isExcludeAll(entry) || !selection.excludedModels.includes(entry)) return selection;
    return {
      ...selection,
      excludedModels: selection.excludedModels.filter((model) => model !== entry),
      touched: true,
    };
  }
  if (!selection.allowedModels.includes(entry)) return selection;
  const allowedModels = selection.allowedModels.filter((model) => model !== entry);
  return {
    ...selection,
    allowedModels,
    // An empty allow list admits every model, so removing the last entry must
    // not turn "only these" into "everything".
    excludedModels:
      allowedModels.length > 0
        ? selection.excludedModels
        : normalizeList([EXCLUDE_ALL, ...selection.excludedModels]),
    touched: true,
  };
}

/** The model gate to persist on the group entry, as it stands. */
export function serializeModelSelection(selection: ModelSelectionDraft): {
  allowedModels: string[];
  excludedModels: string[];
  followUpstreamModels?: boolean;
} {
  return {
    allowedModels: normalizeList(selection.allowedModels),
    excludedModels: normalizeList(selection.excludedModels),
    followUpstreamModels: selection.followUpstreamModels,
  };
}

/**
 * i18n key of a reason the draft cannot be saved, or "". A backend without the
 * exclusions capability drops `excluded-models`, so an edit that relies on it
 * alone — "no model at all" is `["*"]` with no allow list — would be stored as
 * a group that serves every model. Lists loaded from the backend are written
 * back as they came: a backend that returned them stores them.
 */
export function modelSelectionSaveError(selection: ModelSelectionDraft): string {
  if (selection.exclusionsSupported || !selection.touched) return "";
  const { allowedModels, excludedModels } = serializeModelSelection(selection);
  return allowedModels.length === 0 && excludedModels.length > 0
    ? "channel_groups_page.models_save_needs_exclusions"
    : "";
}
