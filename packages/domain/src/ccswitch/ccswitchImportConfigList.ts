import {
  CC_SWITCH_CLAUDE_ROLES,
  getCcSwitchClientConfig,
  isCcSwitchClientType,
  type CcSwitchClaudeModelRole,
  type CcSwitchClientType,
} from "./ccswitchClients";

/**
 * One model the preset's route serves.
 *
 * The desktop app sends `requestModel`; the backend rewrites it to `targetModel` on this
 * preset's route (Claude in the Claude handler, the OpenAI-protocol apps in middleware) and
 * only lets the route reach the models listed here. Links that are already imported keep
 * sending the request names they were given, so a mapping whose request name differs from
 * its target must survive edits.
 */
export interface CcSwitchModelMapping {
  role?: CcSwitchClaudeModelRole;
  requestModel: string;
  targetModel: string;
  /** Codex: becomes `model_context_window` when this mapping is the default model. */
  contextWindow?: number;
}

export interface CcSwitchImportConfigListItem {
  id: string;
  clientType: CcSwitchClientType;
  providerName: string;
  note: string;
  /**
   * Claude Code: the main model's target, as earlier panels stored it. Other apps: the
   * request name of the default model, which the link sends as `model`.
   */
  defaultModel: string;
  modelMappings: CcSwitchModelMapping[];
  allowedChannelGroups: string[];
  routePath: string;
  /**
   * Older panels join this onto the route path when they build a link, so saves keep it
   * equal to the app's suffix. The current link derives the suffix from the app instead.
   */
  endpointPath: string;
  usageAutoInterval: number;
  /**
   * Codex: each request model's default reasoning effort, lower-cased id → effort, read from
   * the catalog the backend generates on GET. Never saved back.
   */
  codexReasoningEfforts?: Record<string, string>;
}

export const DEFAULT_CC_SWITCH_USAGE_AUTO_INTERVAL = 30;

export function defaultCcSwitchProviderName(clientType: CcSwitchClientType): string {
  return `CliProxy ${getCcSwitchClientConfig(clientType).fallbackLabel}`;
}

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

export function normalizeCcSwitchClaudeRole(value: unknown): CcSwitchClaudeModelRole | undefined {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return (CC_SWITCH_CLAUDE_ROLES as readonly string[]).includes(normalized)
    ? (normalized as CcSwitchClaudeModelRole)
    : undefined;
}

export function normalizeCcSwitchContextWindow(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return "";
};

/**
 * Accepts the backend's kebab-case rows and the panel's camelCase objects.
 *
 * A missing request name means "the target itself", as the backend stores it. A Claude
 * request name equal to its role ("haiku") is treated the same way: earlier panels filled
 * the role in as a placeholder and never sent it in a link.
 */
export function normalizeCcSwitchModelMappings(value: unknown): CcSwitchModelMapping[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const mappings: CcSwitchModelMapping[] = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const record = entry as Record<string, unknown>;
    const role = normalizeCcSwitchClaudeRole(record.role);
    const targetModel = firstText(
      record["target-model"],
      record.targetModel,
      record.target,
      record.name,
    );
    if (!targetModel) return;
    const rawRequestModel = firstText(
      record["request-model"],
      record.requestModel,
      record.request,
      record.alias,
    );
    const requestModel =
      !rawRequestModel || (role && rawRequestModel.toLowerCase() === role)
        ? targetModel
        : rawRequestModel;
    const key = role
      ? `role:${role}`
      : `${requestModel.toLowerCase()}::${targetModel.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const contextWindow = normalizeCcSwitchContextWindow(
      record["context-window"] ?? record.contextWindow,
    );
    mappings.push({
      ...(role ? { role } : {}),
      requestModel,
      targetModel,
      ...(contextWindow !== undefined ? { contextWindow } : {}),
    });
  });

  return mappings;
}

const normalizeReasoningEfforts = (value: unknown): Record<string, string> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const efforts: Record<string, string> = {};
  for (const [model, effort] of Object.entries(value as Record<string, unknown>)) {
    const key = model.trim().toLowerCase();
    const level = typeof effort === "string" ? effort.trim() : "";
    if (key && level) efforts[key] = level;
  }
  return Object.keys(efforts).length > 0 ? efforts : undefined;
};

/**
 * Pulls the per-model default reasoning effort out of the backend's Codex catalog
 * (`codex-model-catalog`, generated on GET from the model registry). The rest of the
 * catalog is not used: CC Switch keeps its own model catalog file and ignores one in a link.
 */
export function ccSwitchCodexReasoningEffortsFromCatalog(
  catalog: unknown,
): Record<string, string> | undefined {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) return undefined;
  const models = (catalog as { models?: unknown }).models;
  if (!Array.isArray(models)) return undefined;
  const efforts: Record<string, string> = {};
  for (const entry of models) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const model = firstText(record.slug, record.model).toLowerCase();
    const effort = firstText(record.default_reasoning_level, record.defaultReasoningLevel);
    if (model && effort && !(model in efforts)) efforts[model] = effort;
  }
  return Object.keys(efforts).length > 0 ? efforts : undefined;
}

const normalizeUsageAutoInterval = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CC_SWITCH_USAGE_AUTO_INTERVAL;
  return Math.round(parsed);
};

/** `/a/b` with no trailing slash, or "" for the root. */
export function normalizeCcSwitchRoutePath(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, "");
}

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

/**
 * Keeps an existing route path while it still starts with the group; otherwise derives a
 * new one. The token comes from the preset id, so it stays the same across group changes.
 */
export function ensureCcSwitchRoutePath(
  routePath: string | undefined,
  group: string,
  seed: string,
): string {
  const groupSegment = normalizeRouteSegment(group);
  if (!groupSegment) return "";
  const normalizedRoutePath = normalizeCcSwitchRoutePath(routePath);
  if (normalizedRoutePath.toLowerCase().startsWith(`/${groupSegment}/`)) {
    return normalizedRoutePath;
  }
  return createCcSwitchRoutePath(groupSegment, seed);
}

export function createCcSwitchImportConfig(
  input: Partial<CcSwitchImportConfigListItem> & Pick<CcSwitchImportConfigListItem, "clientType">,
): CcSwitchImportConfigListItem {
  const client = getCcSwitchClientConfig(input.clientType);
  const modelMappings = normalizeCcSwitchModelMappings(input.modelMappings);
  const mappedDefaultModel =
    input.clientType === "claude"
      ? modelMappings.find((mapping) => mapping.role === "main")?.targetModel
      : modelMappings.find((mapping) => !mapping.role)?.requestModel;
  const codexReasoningEfforts =
    input.clientType === "codex"
      ? normalizeReasoningEfforts(input.codexReasoningEfforts)
      : undefined;

  return {
    id: String(input.id ?? "").trim() || createConfigId(),
    clientType: input.clientType,
    providerName:
      String(input.providerName ?? "").trim() || defaultCcSwitchProviderName(input.clientType),
    note: String(input.note ?? "").trim(),
    defaultModel:
      String(input.defaultModel ?? "").trim() || String(mappedDefaultModel ?? "").trim(),
    modelMappings,
    allowedChannelGroups: normalizeChannelGroups(input.allowedChannelGroups),
    routePath: normalizeCcSwitchRoutePath(input.routePath),
    endpointPath: normalizeCcSwitchRoutePath(input.endpointPath ?? client.endpointSuffix),
    usageAutoInterval: normalizeUsageAutoInterval(input.usageAutoInterval),
    ...(codexReasoningEfforts ? { codexReasoningEfforts } : {}),
  };
}

export function normalizeCcSwitchImportConfigList(
  configs: readonly Partial<CcSwitchImportConfigListItem>[],
): CcSwitchImportConfigListItem[] {
  return configs
    .map((item) => {
      const clientType = item.clientType;
      if (!isCcSwitchClientType(clientType)) return null;
      return createCcSwitchImportConfig({ ...item, clientType });
    })
    .filter((item): item is CcSwitchImportConfigListItem => Boolean(item));
}
