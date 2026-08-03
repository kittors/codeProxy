import {
  CC_SWITCH_CODEX_MODEL_CATALOG_FILENAME,
  buildCcSwitchCodexModelCatalog,
  getCcSwitchClientConfig,
  type CcSwitchClaudeModelRole,
  type CcSwitchClientType,
} from "@code-proxy/domain/ccswitch/ccswitchImport";
import { DEFAULT_CC_SWITCH_IMPORT_SETTINGS } from "@code-proxy/domain/ccswitch/ccswitchImportSettings";
import {
  ensureCcSwitchRoutePath,
  type CcSwitchImportCodexModelCatalog,
  type CcSwitchImportConfigListItem,
  type CcSwitchModelMapping,
} from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";

export type ConfigDraft = CcSwitchImportConfigListItem;

export type ModelMetadataLike = {
  id: string;
  owned_by?: string;
  source?: string;
  enabled?: boolean;
};

export const CLAUDE_ROLE_ORDER: CcSwitchClaudeModelRole[] = [
  "main",
  "haiku",
  "sonnet",
  "opus",
  "fable",
];

export const DEFAULT_CODEX_CONTEXT_WINDOW = 128_000;

const rolePriority: Record<CcSwitchClaudeModelRole, string[]> = {
  main: ["sonnet", "opus", "haiku", "claude"],
  haiku: ["haiku", "sonnet", "claude"],
  sonnet: ["sonnet", "claude"],
  opus: ["opus", "sonnet", "claude"],
  // fable → opus fallback mirrors cc-switch / Claude Code official downgrade
  fable: ["fable", "opus", "sonnet", "claude"],
};

const GENERIC_MODEL_CONFIG_OWNER_KEYS = new Set([
  "all",
  "default",
  "openai",
  "openai-api",
  "openai-compat",
  "openai-compatible",
  "provider",
  "registry",
]);

export const normalizeRoutePath = (path: string | undefined): string => {
  const trimmed = String(path ?? "").trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
};

export const appendUrlPath = (baseUrl: string, path: string): string => {
  const normalizedBase = String(baseUrl ?? "")
    .trim()
    .replace(/\/+$/, "");
  const normalizedPath = normalizeRoutePath(path);
  if (!normalizedBase) return normalizedPath;
  if (!normalizedPath) return normalizedBase;
  if (normalizedBase.toLowerCase().endsWith(normalizedPath.toLowerCase())) {
    return normalizedBase;
  }
  return `${normalizedBase}${normalizedPath}`;
};

export const routeLabel = (routePath: string | undefined): string =>
  normalizeRoutePath(routePath) || "/";

export function defaultProviderName(clientType: CcSwitchClientType) {
  return `CliProxy ${getCcSwitchClientConfig(clientType).fallbackLabel}`;
}

export function dedupeModels(models: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  models.forEach((model) => {
    const normalized = String(model ?? "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result.sort((a, b) => a.localeCompare(b));
}

export const normalizeModelOwnerKey = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

export const isSpecificModelConfigOwnerKey = (value: string): boolean => {
  const key = normalizeModelOwnerKey(value);
  return Boolean(key && !GENERIC_MODEL_CONFIG_OWNER_KEYS.has(key));
};

export const modelMetadataMatchesOwnerKeys = (
  model: ModelMetadataLike,
  ownerKeys: ReadonlySet<string>,
): boolean =>
  model.enabled !== false &&
  (ownerKeys.has(normalizeModelOwnerKey(model.owned_by)) ||
    ownerKeys.has(normalizeModelOwnerKey(model.source)));

export function pickClaudeRoleModel(
  role: CcSwitchClaudeModelRole,
  models: readonly string[],
): string {
  const normalized = dedupeModels(models);
  const priorities = rolePriority[role];
  for (const priority of priorities) {
    const match = normalized.find((model) => model.toLowerCase().includes(priority));
    if (match) return match;
  }
  return normalized[0] ?? "";
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeOptionalContextWindow = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
};

export const normalizeContextWindow = (value: unknown): number =>
  normalizeOptionalContextWindow(value) ?? DEFAULT_CODEX_CONTEXT_WINDOW;

function reconcileGenericMappings(
  currentMappings: readonly CcSwitchModelMapping[],
  models: readonly string[],
  fallbackModel: string,
): CcSwitchModelMapping[] {
  const currentNonRole = currentMappings.filter((mapping) => !mapping.role);
  if (currentNonRole.length > 0) {
    return currentNonRole.map((mapping) => ({
      ...mapping,
      contextWindow: normalizeContextWindow(mapping.contextWindow),
    }));
  }

  const autoMappings = dedupeModels(models).map((targetModel) => ({
    requestModel: targetModel,
    targetModel,
    contextWindow: DEFAULT_CODEX_CONTEXT_WINDOW,
  }));
  if (autoMappings.length > 0) return autoMappings;

  return dedupeModels([fallbackModel]).map((targetModel) => ({
    requestModel: targetModel,
    targetModel,
    contextWindow: DEFAULT_CODEX_CONTEXT_WINDOW,
  }));
}

function reconcileClaudeMappings(
  currentMappings: readonly CcSwitchModelMapping[],
  models: readonly string[],
  fallbackModel: string,
): CcSwitchModelMapping[] {
  const currentByRole = new Map(
    currentMappings.filter((mapping) => mapping.role).map((mapping) => [mapping.role, mapping]),
  );
  const seenRoles = new Set<CcSwitchClaudeModelRole>();
  const orderedRoles: CcSwitchClaudeModelRole[] = [];
  for (const mapping of currentMappings) {
    if (!mapping.role || seenRoles.has(mapping.role)) continue;
    seenRoles.add(mapping.role);
    orderedRoles.push(mapping.role);
  }
  for (const role of CLAUDE_ROLE_ORDER) {
    if (seenRoles.has(role)) continue;
    seenRoles.add(role);
    orderedRoles.push(role);
  }

  return orderedRoles.map((role) => {
    const existing = currentByRole.get(role);
    const targetModel =
      existing?.targetModel.trim() ||
      pickClaudeRoleModel(role, models) ||
      (role === "main" ? fallbackModel.trim() : "");
    const existingRequestModel = existing?.requestModel.trim() ?? "";
    // Claude Code sends claude-fable-5; cc-switch deeplink still ignores fableModel, so default request id for rewrite.
    const defaultRequestModel = role === "fable" ? "claude-fable-5" : targetModel;
    return {
      role,
      requestModel:
        existingRequestModel && existingRequestModel !== role
          ? existingRequestModel
          : defaultRequestModel,
      targetModel,
    };
  });
}

export function resolveGenericDefaultModel(
  modelMappings: readonly CcSwitchModelMapping[],
  fallbackModel: string,
): string {
  const normalizedFallback = fallbackModel.trim();
  if (
    normalizedFallback &&
    modelMappings.some(
      (mapping) =>
        !mapping.role &&
        mapping.requestModel.trim().toLowerCase() === normalizedFallback.toLowerCase(),
    )
  ) {
    return normalizedFallback;
  }
  return (
    modelMappings
      .find((mapping) => !mapping.role && mapping.requestModel.trim())
      ?.requestModel.trim() || ""
  );
}

export function reconcileModelMappings(
  draft: ConfigDraft,
  models: readonly string[],
): ConfigDraft {
  const modelMappings =
    draft.clientType === "claude"
      ? reconcileClaudeMappings(draft.modelMappings, models, draft.defaultModel)
      : reconcileGenericMappings(draft.modelMappings, models, draft.defaultModel);
  const defaultModel =
    draft.clientType === "claude"
      ? modelMappings.find((mapping) => mapping.role === "main")?.targetModel || ""
      : resolveGenericDefaultModel(modelMappings, draft.defaultModel);

  return {
    ...draft,
    modelMappings,
    defaultModel,
  };
}

export function getDuplicateGenericRequestModels(
  modelMappings: readonly CcSwitchModelMapping[],
): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const mapping of modelMappings) {
    if (mapping.role) continue;
    const requestModel = mapping.requestModel.trim();
    if (!requestModel) continue;
    const key = requestModel.toLowerCase();
    const current = counts.get(key);
    counts.set(key, { label: current?.label ?? requestModel, count: (current?.count ?? 0) + 1 });
  }
  return Array.from(counts.values())
    .filter((item) => item.count > 1)
    .map((item) => item.label);
}

function getCodexCatalogContextWindow(draft: ConfigDraft, modelId: string): number | undefined {
  const normalizedModelId = modelId.trim().toLowerCase();
  if (!normalizedModelId) return undefined;
  for (const model of draft.codexModelCatalog?.models ?? []) {
    const id = String(model.slug ?? model.model ?? "")
      .trim()
      .toLowerCase();
    if (id !== normalizedModelId) continue;
    const topLevel = normalizeOptionalContextWindow(model.context_window ?? model.contextWindow);
    if (topLevel) return topLevel;
    const messages = asRecord(model.model_messages);
    if (messages) {
      const nested = normalizeOptionalContextWindow(
        messages.context_window ?? messages.contextWindow,
      );
      if (nested) return nested;
    }
  }
  return undefined;
}

export function withCodexMappingContextWindows(draft: ConfigDraft): CcSwitchModelMapping[] {
  if (draft.clientType !== "codex") return draft.modelMappings;
  return draft.modelMappings.map((mapping) => {
    if (mapping.role) return mapping;
    return {
      ...mapping,
      contextWindow: normalizeContextWindow(
        mapping.contextWindow ??
          getCodexCatalogContextWindow(draft, mapping.requestModel || mapping.targetModel),
      ),
    };
  });
}

function buildDraftCodexModelCatalog(
  draft: ConfigDraft,
): CcSwitchImportCodexModelCatalog | undefined {
  if (draft.clientType !== "codex") return undefined;

  const existingByModel = new Map<string, Record<string, unknown>>();
  for (const entry of draft.codexModelCatalog?.models ?? []) {
    const modelId = String(entry.slug ?? entry.model ?? "")
      .trim()
      .toLowerCase();
    if (modelId) existingByModel.set(modelId, entry);
  }

  const models: Array<{ model: string; contextWindow?: number }> = [];
  const addModel = (model: string, contextWindow?: number) => {
    const normalized = model.trim();
    if (normalized) models.push({ model: normalized, contextWindow });
  };
  for (const mapping of draft.modelMappings) {
    if (mapping.role) continue;
    addModel(
      mapping.requestModel || mapping.targetModel,
      normalizeContextWindow(mapping.contextWindow),
    );
  }
  addModel(draft.defaultModel);
  if (models.length === 0) return undefined;

  const seen = new Set<string>();
  const entries: Array<Record<string, unknown>> = [];
  for (const model of models) {
    const key = model.model.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const existing = existingByModel.get(key);
    if (!existing) {
      const generated = buildCcSwitchCodexModelCatalog([model]).models[0];
      if (generated) entries.push({ ...generated, priority: 1000 + entries.length });
      continue;
    }

    const entry = { ...existing };
    if (model.contextWindow) {
      entry.context_window = model.contextWindow;
      const messages = asRecord(entry.model_messages);
      if (messages) {
        entry.model_messages = { ...messages, context_window: model.contextWindow };
      }
    }
    entries.push(entry);
  }
  return entries.length > 0 ? { models: entries } : undefined;
}

export function prepareDraftForSave(draft: ConfigDraft): ConfigDraft {
  const endpointPath = DEFAULT_CC_SWITCH_IMPORT_SETTINGS[draft.clientType].endpointPath;
  const selectedGroup = draft.allowedChannelGroups[0] ?? "";
  const routePath = ensureCcSwitchRoutePath(draft.routePath, selectedGroup, draft.id);
  const normalizedMappings = draft.modelMappings
    .map((mapping) => {
      const targetModel = mapping.targetModel.trim();
      const requestModel = mapping.requestModel.trim() || targetModel;
      return {
        ...(mapping.role ? { role: mapping.role } : {}),
        requestModel,
        targetModel,
        ...(!mapping.role ? { contextWindow: normalizeContextWindow(mapping.contextWindow) } : {}),
      };
    })
    .filter((mapping) => mapping.targetModel && (mapping.role || mapping.requestModel));
  const defaultModel =
    draft.clientType === "claude"
      ? normalizedMappings.find((mapping) => mapping.role === "main")?.targetModel || ""
      : resolveGenericDefaultModel(normalizedMappings, draft.defaultModel);
  const normalizedDraft = {
    ...draft,
    defaultModel,
    modelMappings: normalizedMappings,
  };
  const codexModelCatalog = buildDraftCodexModelCatalog(normalizedDraft);

  return {
    ...normalizedDraft,
    allowedChannelGroups: selectedGroup ? [selectedGroup] : [],
    routePath,
    endpointPath,
    codexModelCatalogFilename:
      draft.clientType === "codex" && codexModelCatalog
        ? draft.codexModelCatalogFilename || CC_SWITCH_CODEX_MODEL_CATALOG_FILENAME
        : undefined,
    codexModelCatalog,
  };
}
