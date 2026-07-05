import {
  getCcSwitchClientConfig,
  type CcSwitchClaudeModelRole,
  type CcSwitchClientType,
} from "./ccswitchImport";
import {
  DEFAULT_CC_SWITCH_IMPORT_SETTINGS,
  normalizeCcSwitchClaudeAuthField,
  normalizeCcSwitchEndpointPath,
  normalizeCcSwitchImportSettings,
  type CcSwitchClaudeAuthField,
} from "./ccswitchImportSettings";

export interface CcSwitchModelMapping {
  requestModel: string;
  targetModel: string;
  role?: CcSwitchClaudeModelRole;
}

export interface CcSwitchImportCodexModelCatalog {
  models: Array<Record<string, unknown>>;
}

export interface CcSwitchImportConfigListItem {
  id: string;
  clientType: CcSwitchClientType;
  providerName: string;
  note: string;
  defaultModel: string;
  modelMappings: CcSwitchModelMapping[];
  allowedChannelGroups: string[];
  routePath: string;
  endpointPath: string;
  usageAutoInterval: number;
  apiKeyField?: CcSwitchClaudeAuthField;
  codexModelCatalogFilename?: string;
  codexModelCatalog?: CcSwitchImportCodexModelCatalog;
}

const CLIENT_TYPES: CcSwitchClientType[] = ["claude", "codex", "gemini"];

const defaultProviderName = (clientType: CcSwitchClientType) =>
  `CliProxy ${getCcSwitchClientConfig(clientType).fallbackLabel}`;

const normalizeChannelGroups = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];

  value.forEach((entry) => {
    const normalized = String(entry ?? "")
      .trim()
      .toLowerCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    items.push(normalized);
  });

  return items;
};

const normalizeClaudeRole = (value: unknown): CcSwitchClaudeModelRole | undefined => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "main" ||
    normalized === "haiku" ||
    normalized === "sonnet" ||
    normalized === "opus"
    ? normalized
    : undefined;
};

const normalizeModelMappings = (value: unknown): CcSwitchModelMapping[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const mappings: CcSwitchModelMapping[] = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const record = entry as Record<string, unknown>;
    const role = normalizeClaudeRole(record.role);
    const targetModel = String(
      record["target-model"] ?? record.targetModel ?? record.target ?? record.name ?? "",
    ).trim();
    const requestModel = String(
      record["request-model"] ??
        record.requestModel ??
        record.request ??
        record.alias ??
        record.from ??
        (role ? role : targetModel),
    ).trim();
    if (!targetModel || (!role && !requestModel)) return;
    const key = role
      ? `role:${role}`
      : `${requestModel.toLowerCase()}::${targetModel.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    mappings.push({
      ...(role ? { role } : {}),
      requestModel,
      targetModel,
    });
  });

  return mappings;
};

const normalizeUsageAutoInterval = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
};

const normalizeCodexModelCatalog = (
  value: unknown,
): CcSwitchImportCodexModelCatalog | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  if (!("models" in value)) return undefined;
  const { models } = value;
  if (!Array.isArray(models)) return undefined;

  const entries = models.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === "object" && !Array.isArray(entry),
  );
  const hasModelId = entries.some((entry) => {
    const slug = typeof entry.slug === "string" ? entry.slug.trim() : "";
    const model = typeof entry.model === "string" ? entry.model.trim() : "";
    return slug || model;
  });
  return hasModelId ? { models: entries.map((entry) => ({ ...entry })) } : undefined;
};

const createConfigId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ccswitch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeRouteSegment = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

const routeTokenFromSeed = (seed: string): string => {
  const parts = seed
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const normalized = parts.join("");
  const suffix = parts.at(-1) ?? "";
  const tokenSource = suffix.length >= 6 ? suffix : normalized;
  const token = tokenSource.slice(-12);
  if (token) return token;
  return Math.random().toString(36).slice(2, 14) || "route";
};

export function createCcSwitchRoutePath(group: string, seed: string = createConfigId()): string {
  const groupSegment = normalizeRouteSegment(group);
  if (!groupSegment) return "";
  return `/${groupSegment}/cs_${routeTokenFromSeed(seed)}`;
}

export function ensureCcSwitchRoutePath(
  routePath: string | undefined,
  group: string,
  seed: string,
): string {
  const groupSegment = normalizeRouteSegment(group);
  if (!groupSegment) return "";
  const normalizedRoutePath = normalizeCcSwitchEndpointPath(routePath);
  if (normalizedRoutePath.toLowerCase().startsWith(`/${groupSegment}/`)) {
    return normalizedRoutePath;
  }
  return createCcSwitchRoutePath(groupSegment, seed);
}

export function deriveCcSwitchImportSettingsFromConfigList(
  configs: readonly CcSwitchImportConfigListItem[],
) {
  return normalizeCcSwitchImportSettings({
    claude: {
      endpointPath:
        configs.find((item) => item.clientType === "claude")?.endpointPath ??
        DEFAULT_CC_SWITCH_IMPORT_SETTINGS.claude.endpointPath,
      defaultModel:
        configs.find((item) => item.clientType === "claude")?.defaultModel ??
        DEFAULT_CC_SWITCH_IMPORT_SETTINGS.claude.defaultModel,
      usageAutoInterval:
        configs.find((item) => item.clientType === "claude")?.usageAutoInterval ??
        DEFAULT_CC_SWITCH_IMPORT_SETTINGS.claude.usageAutoInterval,
      apiKeyField:
        configs.find((item) => item.clientType === "claude")?.apiKeyField ??
        DEFAULT_CC_SWITCH_IMPORT_SETTINGS.claude.apiKeyField,
    },
    codex: {
      endpointPath:
        configs.find((item) => item.clientType === "codex")?.endpointPath ??
        DEFAULT_CC_SWITCH_IMPORT_SETTINGS.codex.endpointPath,
      defaultModel:
        configs.find((item) => item.clientType === "codex")?.defaultModel ??
        DEFAULT_CC_SWITCH_IMPORT_SETTINGS.codex.defaultModel,
      usageAutoInterval:
        configs.find((item) => item.clientType === "codex")?.usageAutoInterval ??
        DEFAULT_CC_SWITCH_IMPORT_SETTINGS.codex.usageAutoInterval,
    },
    gemini: {
      endpointPath:
        configs.find((item) => item.clientType === "gemini")?.endpointPath ??
        DEFAULT_CC_SWITCH_IMPORT_SETTINGS.gemini.endpointPath,
      defaultModel:
        configs.find((item) => item.clientType === "gemini")?.defaultModel ??
        DEFAULT_CC_SWITCH_IMPORT_SETTINGS.gemini.defaultModel,
      usageAutoInterval:
        configs.find((item) => item.clientType === "gemini")?.usageAutoInterval ??
        DEFAULT_CC_SWITCH_IMPORT_SETTINGS.gemini.usageAutoInterval,
    },
  });
}

export function createCcSwitchImportConfig(
  input: Partial<CcSwitchImportConfigListItem> & Pick<CcSwitchImportConfigListItem, "clientType">,
): CcSwitchImportConfigListItem {
  const defaults = DEFAULT_CC_SWITCH_IMPORT_SETTINGS[input.clientType];
  const modelMappings = normalizeModelMappings(input.modelMappings);
  const codexModelCatalog =
    input.clientType === "codex" ? normalizeCodexModelCatalog(input.codexModelCatalog) : undefined;
  const mappedDefaultModel =
    input.clientType === "claude"
      ? modelMappings.find((mapping) => mapping.role === "main")?.targetModel
      : modelMappings.find((mapping) => mapping.requestModel)?.requestModel;

  const id = String(input.id ?? "").trim() || createConfigId();

  return {
    id,
    clientType: input.clientType,
    providerName: String(input.providerName ?? "").trim() || defaultProviderName(input.clientType),
    note: String(input.note ?? "").trim(),
    defaultModel:
      String(input.defaultModel ?? "").trim() ||
      String(mappedDefaultModel ?? "").trim() ||
      String(defaults.defaultModel ?? "").trim(),
    modelMappings,
    allowedChannelGroups: normalizeChannelGroups(input.allowedChannelGroups),
    routePath: normalizeCcSwitchEndpointPath(input.routePath),
    endpointPath: normalizeCcSwitchEndpointPath(input.endpointPath ?? defaults.endpointPath),
    usageAutoInterval: normalizeUsageAutoInterval(
      input.usageAutoInterval,
      defaults.usageAutoInterval,
    ),
    ...(input.clientType === "claude"
      ? {
          apiKeyField: normalizeCcSwitchClaudeAuthField(input.apiKeyField ?? defaults.apiKeyField),
        }
      : {}),
    ...(input.clientType === "codex" && codexModelCatalog
      ? {
          codexModelCatalogFilename: String(input.codexModelCatalogFilename ?? "").trim(),
          codexModelCatalog,
        }
      : {}),
  };
}

export function normalizeCcSwitchImportConfigList(
  configs: readonly Partial<CcSwitchImportConfigListItem>[],
): CcSwitchImportConfigListItem[] {
  return configs
    .map((item) => {
      const clientType = item.clientType;
      if (!clientType || !CLIENT_TYPES.includes(clientType)) return null;
      return createCcSwitchImportConfig({
        ...item,
        clientType,
      });
    })
    .filter((item): item is CcSwitchImportConfigListItem => Boolean(item));
}
