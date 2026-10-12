import {
  getCcSwitchClientConfig,
  type CcSwitchClaudeModelRole,
  type CcSwitchClientType,
} from "@code-proxy/domain/ccswitch/ccswitchClients";
import {
  createCcSwitchImportConfig,
  defaultCcSwitchProviderName,
  ensureCcSwitchRoutePath,
  normalizeCcSwitchContextWindow,
  type CcSwitchImportConfigListItem,
  type CcSwitchModelMapping,
} from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";

/**
 * Editing operations for a preset, as pure functions on the preset itself.
 *
 * The route behind a preset is a table of request name → target model. The editor only
 * lets an admin pick target models; request names follow these rules so links that are
 * already imported keep working:
 * - a mapping whose request name equals its target ("identity") changes both;
 * - a mapping whose request name differs ("alias", saved by earlier editors) keeps its
 *   request name and only changes the target — every mapping sharing that request name
 *   moves with it, since the route can only send one name to one model;
 * - new mappings are identities;
 * - nothing here drops an alias unless the admin deletes it.
 */
export type ConfigDraft = CcSwitchImportConfigListItem;

export type ClaudeTierRole = Exclude<CcSwitchClaudeModelRole, "main">;

const sameModel = (left: string, right: string) =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

export const isAliasMapping = (mapping: CcSwitchModelMapping) =>
  !sameModel(mapping.requestModel, mapping.targetModel);

export function createConfigDraft(clientType: CcSwitchClientType = "claude"): ConfigDraft {
  return createCcSwitchImportConfig({ clientType });
}

export const getRoleMapping = (draft: ConfigDraft, role: CcSwitchClaudeModelRole) =>
  draft.modelMappings.find((mapping) => mapping.role === role);

/** Non-Claude presets: the role-less mapping that carries the link's `model`. */
export function getDefaultMapping(draft: ConfigDraft): CcSwitchModelMapping | undefined {
  const model = draft.defaultModel.trim();
  if (!model || draft.clientType === "claude") return undefined;
  return draft.modelMappings.find(
    (mapping) => !mapping.role && sameModel(mapping.requestModel, model),
  );
}

/** The model the main / default picker shows: the target the route sends it to. */
export function getPrimaryModel(draft: ConfigDraft): string {
  if (draft.clientType === "claude") return getRoleMapping(draft, "main")?.targetModel ?? "";
  return getDefaultMapping(draft)?.targetModel ?? draft.defaultModel.trim();
}

/** Non-Claude presets: the models the route serves under their own names. */
export function getRouteModels(draft: ConfigDraft): string[] {
  return draft.modelMappings
    .filter((mapping) => !mapping.role && !isAliasMapping(mapping))
    .map((mapping) => mapping.targetModel);
}

/** Role-less aliases: names imported clients may still send, rewritten to another model. */
export function getAliasMappings(draft: ConfigDraft): CcSwitchModelMapping[] {
  return draft.modelMappings.filter((mapping) => !mapping.role && isAliasMapping(mapping));
}

/**
 * Request names an alias already owns. Offering one of them as a model would put a second
 * target behind the same name, and the route can only follow one.
 */
export function getAliasRequestNames(
  draft: ConfigDraft,
  except?: CcSwitchModelMapping,
): Set<string> {
  return new Set(
    draft.modelMappings
      .filter((mapping) => mapping !== except && isAliasMapping(mapping))
      .map((mapping) => mapping.requestModel.trim().toLowerCase()),
  );
}

const ownedByAlias = (draft: ConfigDraft, model: string, except?: CcSwitchModelMapping) =>
  getAliasRequestNames(draft, except).has(model.trim().toLowerCase());

/** Points every mapping that answers to `requestModel` at `target`. */
const retarget = (
  mappings: readonly CcSwitchModelMapping[],
  requestModel: string,
  target: string,
): CcSwitchModelMapping[] =>
  mappings.map((mapping) =>
    sameModel(mapping.requestModel, requestModel) ? { ...mapping, targetModel: target } : mapping,
  );

/** Claude Code keeps storing the main model's target as default-model, as earlier panels did. */
const withClaudeDefault = (draft: ConfigDraft): ConfigDraft =>
  draft.clientType === "claude"
    ? { ...draft, defaultModel: getRoleMapping(draft, "main")?.targetModel ?? "" }
    : draft;

/**
 * Sets a Claude Code role. Clearing a tier lets it follow the main model again; a tier that
 * was an alias stays on the route as a role-less mapping, because clients imported with it
 * still send that name.
 */
export function setClaudeRoleModel(
  draft: ConfigDraft,
  role: CcSwitchClaudeModelRole,
  model: string,
): ConfigDraft {
  const next = model.trim();
  const existing = getRoleMapping(draft, role);
  let mappings: CcSwitchModelMapping[];

  if (!next) {
    if (role === "main" || !existing) return draft;
    mappings = draft.modelMappings.filter((mapping) => mapping !== existing);
    const stillServed = mappings.some((mapping) =>
      sameModel(mapping.requestModel, existing.requestModel),
    );
    if (isAliasMapping(existing) && !stillServed) {
      mappings.push({ requestModel: existing.requestModel, targetModel: existing.targetModel });
    }
  } else if (existing && isAliasMapping(existing)) {
    mappings = retarget(draft.modelMappings, existing.requestModel, next);
  } else {
    if (ownedByAlias(draft, next, existing)) return draft;
    mappings = existing
      ? draft.modelMappings.map((mapping) =>
          mapping === existing ? { ...mapping, requestModel: next, targetModel: next } : mapping,
        )
      : [...draft.modelMappings, { role, requestModel: next, targetModel: next }];
  }

  return withClaudeDefault({ ...draft, modelMappings: mappings });
}

/** Non-Claude presets: picks the model the link sends as `model`. */
export function setDefaultModel(draft: ConfigDraft, model: string): ConfigDraft {
  const next = model.trim();
  if (!next) return { ...draft, defaultModel: "" };
  const current = getDefaultMapping(draft);
  if (current && isAliasMapping(current)) {
    return { ...draft, modelMappings: retarget(draft.modelMappings, current.requestModel, next) };
  }
  if (ownedByAlias(draft, next)) return draft;
  const served = draft.modelMappings.some(
    (mapping) => !mapping.role && sameModel(mapping.requestModel, next),
  );
  return {
    ...draft,
    defaultModel: next,
    modelMappings: served
      ? draft.modelMappings
      : [...draft.modelMappings, { requestModel: next, targetModel: next }],
  };
}

/**
 * Non-Claude presets: the models the route serves (and lists on /v1/models). The default
 * model always stays; aliases are untouched.
 */
export function setRouteModels(draft: ConfigDraft, models: readonly string[]): ConfigDraft {
  const wanted: string[] = [];
  const wantedKeys = new Set<string>();
  const add = (model: string) => {
    const name = model.trim();
    const key = name.toLowerCase();
    if (!name || wantedKeys.has(key) || ownedByAlias(draft, name)) return;
    wantedKeys.add(key);
    wanted.push(name);
  };
  models.forEach(add);
  const defaultMapping = getDefaultMapping(draft);
  if (defaultMapping && !isAliasMapping(defaultMapping)) add(defaultMapping.targetModel);

  const kept = draft.modelMappings.filter(
    (mapping) =>
      mapping.role || isAliasMapping(mapping) || wantedKeys.has(mapping.targetModel.toLowerCase()),
  );
  const present = new Set(
    kept.filter((mapping) => !mapping.role).map((mapping) => mapping.requestModel.toLowerCase()),
  );
  const added = wanted
    .filter((model) => !present.has(model.toLowerCase()))
    .map((model) => ({ requestModel: model, targetModel: model }));
  return { ...draft, modelMappings: [...kept, ...added] };
}

/**
 * Deletes a role-less alias. When it was the default model, the default keeps pointing at
 * the same model, now under the model's own name.
 */
export function removeAliasMapping(draft: ConfigDraft, requestModel: string): ConfigDraft {
  const alias = draft.modelMappings.find(
    (mapping) =>
      !mapping.role && isAliasMapping(mapping) && sameModel(mapping.requestModel, requestModel),
  );
  if (!alias) return draft;
  let mappings = draft.modelMappings.filter((mapping) => mapping !== alias);
  let defaultModel = draft.defaultModel;
  if (draft.clientType !== "claude" && sameModel(draft.defaultModel, alias.requestModel)) {
    defaultModel = alias.targetModel;
    const served = mappings.some(
      (mapping) => !mapping.role && sameModel(mapping.requestModel, alias.targetModel),
    );
    if (!served) {
      mappings = [
        ...mappings,
        {
          requestModel: alias.targetModel,
          targetModel: alias.targetModel,
          ...(alias.contextWindow ? { contextWindow: alias.contextWindow } : {}),
        },
      ];
    }
  }
  return { ...draft, defaultModel, modelMappings: mappings };
}

/** Codex: the default model's context window; empty clears it. */
export function setDefaultContextWindow(draft: ConfigDraft, value: unknown): ConfigDraft {
  const mapping = getDefaultMapping(draft);
  if (!mapping) return draft;
  const contextWindow = normalizeCcSwitchContextWindow(value);
  return {
    ...draft,
    modelMappings: draft.modelMappings.map((item) => {
      if (item !== mapping) return item;
      const { contextWindow: _previous, ...rest } = item;
      return contextWindow ? { ...rest, contextWindow } : rest;
    }),
  };
}

/**
 * Moves the preset to another channel group. The route path follows the group (restoring
 * the saved one when the admin switches back). The new group serves other models, so plain
 * models go and get re-seeded from its list; aliases stay.
 */
export function setChannelGroup(
  draft: ConfigDraft,
  group: string,
  savedRoutePath: string,
): ConfigDraft {
  const modelMappings = draft.modelMappings.filter(isAliasMapping);
  const keepsDefault =
    draft.clientType !== "claude" &&
    modelMappings.some(
      (mapping) => !mapping.role && sameModel(mapping.requestModel, draft.defaultModel),
    );
  return withClaudeDefault({
    ...draft,
    allowedChannelGroups: group ? [group] : [],
    routePath: group ? ensureCcSwitchRoutePath(savedRoutePath, group, draft.id) : "",
    modelMappings,
    defaultModel: keepsDefault ? draft.defaultModel : "",
  });
}

/** Fills a fresh model selection from the group's models (new presets, or a new group). */
export function seedModels(draft: ConfigDraft, models: readonly string[]): ConfigDraft {
  if (draft.clientType === "claude") {
    return !getRoleMapping(draft, "main") && models.length === 1
      ? setClaudeRoleModel(draft, "main", models[0]!)
      : draft;
  }
  const seeded = setRouteModels(draft, models);
  return !seeded.defaultModel && models.length === 1 ? setDefaultModel(seeded, models[0]!) : seeded;
}

/** New presets only: an existing preset's app is fixed, its imported clients depend on it. */
export function setClientType(draft: ConfigDraft, clientType: CcSwitchClientType): ConfigDraft {
  if (draft.clientType === clientType) return draft;
  const name = draft.providerName.trim();
  const keepsName = name && name !== defaultCcSwitchProviderName(draft.clientType);
  const crossesClaude = (draft.clientType === "claude") !== (clientType === "claude");
  return {
    ...draft,
    clientType,
    providerName: keepsName ? draft.providerName : defaultCcSwitchProviderName(clientType),
    endpointPath: getCcSwitchClientConfig(clientType).endpointSuffix,
    modelMappings: crossesClaude ? [] : draft.modelMappings,
    defaultModel: crossesClaude ? "" : draft.defaultModel,
  };
}

/**
 * The preset as saved: the route path settled for the group, the endpoint path kept in step
 * with the app (older panels read it), the default model on the route, and a context window
 * only where Codex reads one — the default model.
 */
export function prepareDraftForSave(draft: ConfigDraft): ConfigDraft {
  const group = draft.allowedChannelGroups[0] ?? "";
  let mappings = draft.modelMappings
    .map((mapping) => ({
      ...mapping,
      requestModel: mapping.requestModel.trim(),
      targetModel: mapping.targetModel.trim(),
    }))
    .filter((mapping) => mapping.targetModel && mapping.requestModel);

  let defaultModel = draft.defaultModel.trim();
  if (draft.clientType === "claude") {
    defaultModel = mappings.find((mapping) => mapping.role === "main")?.targetModel || defaultModel;
  } else if (
    defaultModel &&
    !mappings.some((mapping) => !mapping.role && sameModel(mapping.requestModel, defaultModel))
  ) {
    mappings.push({ requestModel: defaultModel, targetModel: defaultModel });
  }

  mappings = mappings.map((mapping) => {
    const isCodexDefault =
      draft.clientType === "codex" &&
      !mapping.role &&
      sameModel(mapping.requestModel, defaultModel);
    if (isCodexDefault || mapping.contextWindow === undefined) return mapping;
    const { contextWindow: _unused, ...rest } = mapping;
    return rest;
  });

  return {
    ...draft,
    providerName: draft.providerName.trim(),
    note: draft.note.trim(),
    defaultModel,
    modelMappings: mappings,
    allowedChannelGroups: group ? [group] : [],
    routePath: ensureCcSwitchRoutePath(draft.routePath, group, draft.id),
    endpointPath: getCcSwitchClientConfig(draft.clientType).endpointSuffix,
  };
}
