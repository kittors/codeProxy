import {
  DEFAULT_CC_SWITCH_IMPORT_SETTINGS,
  normalizeCcSwitchEndpointPath,
  normalizeCcSwitchImportSettings,
  type CcSwitchImportSettingsInput,
} from "./ccswitchImportSettings";

export type CcSwitchClientType = "claude" | "codex" | "gemini";
export type CcSwitchClaudeModelRole = "main" | "haiku" | "sonnet" | "opus";

export interface CcSwitchModelMappingInput {
  requestModel: string;
  targetModel: string;
  role?: CcSwitchClaudeModelRole;
}

export const CC_SWITCH_CODEX_MODEL_CATALOG_FILENAME = "cc-switch-model-catalog.json";

export interface CcSwitchCodexCatalogModel {
  model: string;
  displayName?: string;
  contextWindow?: number;
}

export interface CcSwitchCodexModelCatalog {
  models: CcSwitchCodexModelCatalogEntry[];
}

export interface CcSwitchCodexInlineModelCatalog {
  models: Array<Record<string, unknown>>;
}

export interface CcSwitchCodexModelCatalogEntry {
  slug: string;
  display_name: string;
  description: string;
  default_reasoning_level: "medium";
  supported_reasoning_levels: Array<{
    effort: "low" | "medium" | "high" | "xhigh";
    description: string;
  }>;
  shell_type: "shell_command";
  visibility: "list";
  supported_in_api: true;
  priority: number;
  additional_speed_tiers: string[];
  service_tiers: Array<{ id: string; name: string; description: string }>;
  availability_nux: null;
  upgrade: null;
  base_instructions: string;
  model_messages: {
    instructions_template: string;
    instructions_variables: Record<string, never>;
    supports_reasoning_summaries: true;
    default_reasoning_summary: "none";
    support_verbosity: true;
    default_verbosity: "low";
    apply_patch_tool_type: "freeform";
    web_search_tool_type: "text_and_image";
    truncation_policy: { mode: "tokens"; limit: number };
    supports_parallel_tool_calls: true;
    supports_image_detail_original: true;
    context_window: number;
    max_context_window: number;
    effective_context_window_percent: number;
    experimental_supported_tools: never[];
    input_modalities: Array<"text" | "image">;
    supports_search_tool: true;
    use_responses_lite: false;
  };
  supports_reasoning_summaries: true;
  default_reasoning_summary: "none";
  support_verbosity: true;
  default_verbosity: "low";
  apply_patch_tool_type: "freeform";
  web_search_tool_type: "text_and_image";
  truncation_policy: { mode: "tokens"; limit: number };
  supports_parallel_tool_calls: true;
  supports_image_detail_original: true;
  context_window: number;
  max_context_window: number;
  effective_context_window_percent: number;
  experimental_supported_tools: never[];
  input_modalities: Array<"text" | "image">;
  supports_search_tool: true;
  use_responses_lite: false;
}

export const CC_SWITCH_CODEX_API_FORMAT = "openai_responses";
export interface CcSwitchClientConfig {
  type: CcSwitchClientType;
  app: string;
  icon: string;
  labelKey: string;
  descriptionKey: string;
  fallbackLabel: string;
}

type CcSwitchUsageScriptLanguage = "zh-CN" | "en";

export const CC_SWITCH_CLIENTS: CcSwitchClientConfig[] = [
  {
    type: "claude",
    app: "claude",
    icon: "claude",
    labelKey: "ccswitch.client_claude_code",
    descriptionKey: "ccswitch.client_claude_code_desc",
    fallbackLabel: "Claude Code",
  },
  {
    type: "codex",
    app: "codex",
    icon: "codex",
    labelKey: "ccswitch.client_codex",
    descriptionKey: "ccswitch.client_codex_desc",
    fallbackLabel: "Codex",
  },
  {
    type: "gemini",
    app: "gemini",
    icon: "gemini",
    labelKey: "ccswitch.client_gemini_cli",
    descriptionKey: "ccswitch.client_gemini_cli_desc",
    fallbackLabel: "Gemini CLI",
  },
];

const CLIENT_BY_TYPE = new Map(CC_SWITCH_CLIENTS.map((client) => [client.type, client]));

const MODEL_PRIORITY: Record<CcSwitchClientType, string[]> = {
  claude: ["claude-sonnet", "claude-opus", "claude-haiku", "claude"],
  codex: [
    "gpt-5.5",
    "gpt-5.3-codex",
    "gpt-5-codex",
    "codex",
    "gpt-5",
    "gpt-4.1",
    "gpt-4",
    "o4",
    "o3",
  ],
  gemini: ["gemini-3", "gemini-2.5-pro", "gemini-2.5-flash", "gemini"],
};

export function getCcSwitchClientConfig(type: CcSwitchClientType): CcSwitchClientConfig {
  return CLIENT_BY_TYPE.get(type) ?? CC_SWITCH_CLIENTS[0]!;
}

export function normalizeCcSwitchBaseUrl(input: string): string {
  let base = input.trim();
  if (!base) return "";

  base = base.replace(/\/?v0\/management\/?$/i, "");
  base = base.replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }

  return base.replace(/\/+$/, "");
}

function joinCcSwitchEndpoint(baseUrl: string, endpointPath: string): string {
  const normalizedBaseUrl = normalizeCcSwitchBaseUrl(baseUrl);
  const normalizedEndpointPath = normalizeCcSwitchEndpointPath(endpointPath);
  if (!normalizedEndpointPath) return normalizedBaseUrl;

  if (normalizedBaseUrl.toLowerCase().endsWith(normalizedEndpointPath.toLowerCase())) {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl}${normalizedEndpointPath}`;
}

const encodeBase64 = (value: string): string => {
  const buffer = (globalThis as { Buffer?: { from: (input: string, encoding: string) => unknown } })
    .Buffer;
  if (buffer?.from) {
    const bytes = buffer.from(value, "utf-8") as { toString: (encoding: string) => string };
    return bytes.toString("base64");
  }
  const TextEncoderCtor = (
    globalThis as { TextEncoder?: new () => { encode: (input: string) => Uint8Array } }
  ).TextEncoder;
  if (typeof btoa === "function" && TextEncoderCtor) {
    const utf8Bytes = new TextEncoderCtor().encode(value);
    let binary = "";
    for (const byte of utf8Bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  throw new Error("Base64 encoder is unavailable");
};

const normalizeModelMappings = (
  mappings: readonly CcSwitchModelMappingInput[] | undefined,
): CcSwitchModelMappingInput[] => {
  if (!Array.isArray(mappings)) return [];
  return mappings
    .map((mapping) => {
      const role =
        mapping.role === "main" ||
        mapping.role === "haiku" ||
        mapping.role === "sonnet" ||
        mapping.role === "opus"
          ? mapping.role
          : undefined;
      const requestModel = String(mapping.requestModel ?? "").trim();
      const targetModel = String(mapping.targetModel ?? "").trim();
      if (!targetModel || (!role && !requestModel)) return null;
      return {
        ...(role ? { role } : {}),
        requestModel: requestModel || targetModel,
        targetModel,
      };
    })
    .filter((mapping): mapping is CcSwitchModelMappingInput => Boolean(mapping));
};

const getRoleRequestModel = (
  mappings: readonly CcSwitchModelMappingInput[],
  role: CcSwitchClaudeModelRole,
): string => {
  const mapping = mappings.find((item) => item.role === role);
  const requestModel = mapping?.requestModel.trim() ?? "";
  const targetModel = mapping?.targetModel.trim() ?? "";
  if (!targetModel) return "";
  return !requestModel || requestModel === role ? targetModel : requestModel;
};

const getGenericRequestModel = (
  mappings: readonly CcSwitchModelMappingInput[],
  selectedModel: string,
): string => {
  const genericMappings = mappings.filter((mapping) => !mapping.role);
  if (genericMappings.length === 0) return "";
  const selected = selectedModel.trim();
  const exactMatch = selected
    ? genericMappings.find(
        (mapping) =>
          mapping.requestModel.trim().toLowerCase() === selected.toLowerCase() ||
          mapping.targetModel.trim().toLowerCase() === selected.toLowerCase(),
      )
    : undefined;
  return (exactMatch ?? genericMappings[0])?.requestModel.trim() ?? "";
};

const normalizeUsageScriptLanguage = (language: string | undefined): CcSwitchUsageScriptLanguage =>
  String(language ?? "")
    .trim()
    .toLowerCase()
    .startsWith("en")
    ? "en"
    : "zh-CN";

const DEFAULT_CODEX_CONTEXT_WINDOW = 128_000;
const CODEX_BASE_INSTRUCTIONS = "You are Codex, a coding agent.";
const CODEX_SUPPORTED_REASONING_LEVELS: CcSwitchCodexModelCatalogEntry["supported_reasoning_levels"] =
  [
    { effort: "low", description: "Fast responses with lighter reasoning" },
    { effort: "medium", description: "Balances speed and reasoning depth for everyday tasks" },
    { effort: "high", description: "Greater reasoning depth for complex problems" },
    { effort: "xhigh", description: "Extra high reasoning depth for complex problems" },
  ];

const normalizeCodexContextWindow = (value: number | undefined): number => {
  if (!Number.isFinite(value) || !value || value <= 0) return DEFAULT_CODEX_CONTEXT_WINDOW;
  return Math.round(value);
};

const buildCodexCatalogEntry = (
  model: CcSwitchCodexCatalogModel,
  priority: number,
): CcSwitchCodexModelCatalogEntry => {
  const slug = model.model.trim();
  const displayName = model.displayName?.trim() || slug;
  const contextWindow = normalizeCodexContextWindow(model.contextWindow);

  return {
    slug,
    display_name: displayName,
    description: displayName,
    default_reasoning_level: "medium",
    supported_reasoning_levels: CODEX_SUPPORTED_REASONING_LEVELS,
    shell_type: "shell_command",
    visibility: "list",
    supported_in_api: true,
    priority: 1000 + priority,
    additional_speed_tiers: [],
    service_tiers: [],
    availability_nux: null,
    upgrade: null,
    base_instructions: CODEX_BASE_INSTRUCTIONS,
    model_messages: {
      instructions_template: CODEX_BASE_INSTRUCTIONS,
      instructions_variables: {},
      supports_reasoning_summaries: true,
      default_reasoning_summary: "none",
      support_verbosity: true,
      default_verbosity: "low",
      apply_patch_tool_type: "freeform",
      web_search_tool_type: "text_and_image",
      truncation_policy: { mode: "tokens", limit: 10_000 },
      supports_parallel_tool_calls: true,
      supports_image_detail_original: true,
      context_window: contextWindow,
      max_context_window: contextWindow,
      effective_context_window_percent: 95,
      experimental_supported_tools: [],
      input_modalities: ["text", "image"],
      supports_search_tool: true,
      use_responses_lite: false,
    },
    supports_reasoning_summaries: true,
    default_reasoning_summary: "none",
    support_verbosity: true,
    default_verbosity: "low",
    apply_patch_tool_type: "freeform",
    web_search_tool_type: "text_and_image",
    truncation_policy: { mode: "tokens", limit: 10_000 },
    supports_parallel_tool_calls: true,
    supports_image_detail_original: true,
    context_window: contextWindow,
    max_context_window: contextWindow,
    effective_context_window_percent: 95,
    experimental_supported_tools: [],
    input_modalities: ["text", "image"],
    supports_search_tool: true,
    use_responses_lite: false,
  };
};

export const buildCcSwitchCodexModelCatalog = (
  models: readonly CcSwitchCodexCatalogModel[],
): CcSwitchCodexModelCatalog => {
  const seen = new Set<string>();
  const catalogModels: CcSwitchCodexModelCatalogEntry[] = [];

  for (const model of models) {
    const slug = model.model.trim();
    const key = slug.toLowerCase();
    if (!slug || seen.has(key)) continue;
    seen.add(key);
    catalogModels.push(buildCodexCatalogEntry({ ...model, model: slug }, catalogModels.length));
  }

  return { models: catalogModels };
};

export const buildCcSwitchCodexModelCatalogJson = (
  models: readonly CcSwitchCodexCatalogModel[],
): string => JSON.stringify(buildCcSwitchCodexModelCatalog(models), null, 2);

const buildCodexConfig = (input: {
  apiKey: string;
  endpoint: string;
  model: string;
  providerName: string;
  modelMappings: readonly CcSwitchModelMappingInput[];
  codexModelCatalog?: CcSwitchCodexInlineModelCatalog;
}): string => {
  const tomlString = (value: string) => JSON.stringify(value);
  const model = input.model.trim() || "gpt-5-codex";
  const catalogModels: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  const getCatalogModelId = (entry: Record<string, unknown>): string => {
    const slug = String(entry.slug ?? "").trim();
    if (slug) return slug;
    return String(entry.model ?? "").trim();
  };
  const addCatalogEntry = (entry: Record<string, unknown>) => {
    const normalized = getCatalogModelId(entry);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    catalogModels.push({ ...entry });
  };
  const addCatalogModel = (value: string) => {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    catalogModels.push({ model: normalized });
  };

  for (const entry of input.codexModelCatalog?.models ?? []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    addCatalogEntry(entry);
  }
  addCatalogModel(model);
  for (const mapping of input.modelMappings) {
    if (mapping.role) continue;
    addCatalogModel(mapping.requestModel);
  }

  const catalogPointer =
    catalogModels.length > 0
      ? `model_catalog_json = ${tomlString(CC_SWITCH_CODEX_MODEL_CATALOG_FILENAME)}\n`
      : "";
  const config = `model_provider = "custom"
model = ${tomlString(model)}
model_reasoning_effort = "high"
disable_response_storage = true
${catalogPointer}

[model_providers.custom]
name = ${tomlString(input.providerName.trim() || "CliProxy Codex")}
base_url = ${tomlString(input.endpoint)}
wire_api = "responses"
requires_openai_auth = true`;

  return JSON.stringify({
    auth: { OPENAI_API_KEY: input.apiKey.trim() },
    config,
    apiFormat: CC_SWITCH_CODEX_API_FORMAT,
    ...(catalogModels.length > 0 ? { modelCatalog: { models: catalogModels } } : {}),
  });
};

export function buildCcSwitchUsageScript(language?: string): string {
  const labels =
    normalizeUsageScriptLanguage(language) === "en"
      ? {
          planName: "Today's usage",
          invalidMessage: "API Key not found",
          unit: "times",
          costPrefix: "Today's cost:",
        }
      : {
          planName: "今日用量",
          invalidMessage: "API Key 未找到",
          unit: "次",
          costPrefix: "今日消耗：",
        };

  return `({
  request: {
    url: "{{baseUrl}}/v0/management/public/usage/summary",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: "{{apiKey}}", days: 1 })
  },
  extractor: function(response) {
    var stats = response && response.stats ? response.stats : {};
    var calls = Number(stats.total_calls || 0) || 0;
    var cost = Number(stats.quota_cost || 0) || 0;
    return {
      planName: "${labels.planName}",
      isValid: response && response.found === false ? false : true,
      invalidMessage: response && response.found === false ? "${labels.invalidMessage}" : null,
      used: calls,
      remaining: null,
      unit: "${labels.unit}",
      extra: "${labels.costPrefix}" + cost.toFixed(4) + "$"
    };
  }
})`;
}

export function pickCcSwitchDefaultModel(
  clientType: CcSwitchClientType,
  models: readonly string[] = [],
  settings?: CcSwitchImportSettingsInput,
): string | undefined {
  const configuredModel = normalizeCcSwitchImportSettings(
    settings ?? DEFAULT_CC_SWITCH_IMPORT_SETTINGS,
  )[clientType].defaultModel;
  if (configuredModel) return configuredModel;

  const normalized = models.map((model) => String(model ?? "").trim()).filter(Boolean);
  if (normalized.length === 0) return undefined;

  const priorities = MODEL_PRIORITY[clientType];
  for (const priority of priorities) {
    const match = normalized.find((model) => model.toLowerCase().includes(priority));
    if (match) return match;
  }

  return undefined;
}

export function resolveCcSwitchImportConfig(input: {
  baseUrl: string;
  clientType: CcSwitchClientType;
  models?: readonly string[];
  settings?: CcSwitchImportSettingsInput;
  usageBaseUrl?: string;
}): {
  homepage: string;
  endpoint: string;
  usageBaseUrl: string;
  usageAutoInterval: number;
  model?: string;
} {
  const settings = normalizeCcSwitchImportSettings(
    input.settings ?? DEFAULT_CC_SWITCH_IMPORT_SETTINGS,
  );
  const clientSettings = settings[input.clientType];
  const homepage = normalizeCcSwitchBaseUrl(input.baseUrl);
  const endpoint = joinCcSwitchEndpoint(homepage, clientSettings.endpointPath);

  return {
    homepage,
    endpoint,
    usageBaseUrl: input.usageBaseUrl ? normalizeCcSwitchBaseUrl(input.usageBaseUrl) : homepage,
    usageAutoInterval: clientSettings.usageAutoInterval,
    model: pickCcSwitchDefaultModel(input.clientType, input.models ?? [], settings),
  };
}

export function buildCcSwitchProviderName(input: {
  rawName?: string;
  clientType: CcSwitchClientType;
}): string {
  const baseName = String(input.rawName ?? "").trim() || "CliProxy";
  const clientLabel = getCcSwitchClientConfig(input.clientType).fallbackLabel;
  return baseName.toLowerCase().includes(clientLabel.toLowerCase())
    ? baseName
    : `${baseName} ${clientLabel}`;
}

export function buildCcSwitchImportUrl(input: {
  apiKey: string;
  baseUrl: string;
  clientType: CcSwitchClientType;
  enabled?: boolean;
  note?: string;
  providerName: string;
  model?: string;
  modelMappings?: readonly CcSwitchModelMappingInput[];
  models?: readonly string[];
  codexModelCatalog?: CcSwitchCodexInlineModelCatalog;
  settings?: CcSwitchImportSettingsInput;
  usageBaseUrl?: string;
  usageLanguage?: string;
}): string {
  const client = getCcSwitchClientConfig(input.clientType);
  const settings = normalizeCcSwitchImportSettings(
    input.settings ?? DEFAULT_CC_SWITCH_IMPORT_SETTINGS,
  );
  const importConfig = resolveCcSwitchImportConfig({
    baseUrl: input.baseUrl,
    clientType: input.clientType,
    models: input.models,
    settings,
    usageBaseUrl: input.usageBaseUrl,
  });
  const params = new URLSearchParams({
    resource: "provider",
    app: client.app,
    name: input.providerName.trim() || buildCcSwitchProviderName({ clientType: input.clientType }),
    homepage: importConfig.homepage,
    endpoint: importConfig.endpoint,
    apiKey: input.apiKey.trim(),
    icon: client.icon,
    configFormat: "json",
    enabled: String(input.enabled ?? true),
    usageEnabled: "true",
    usageBaseUrl: importConfig.usageBaseUrl,
    usageScript: encodeBase64(buildCcSwitchUsageScript(input.usageLanguage)),
    usageAutoInterval: String(importConfig.usageAutoInterval),
  });
  const note = String(input.note ?? "").trim();
  if (note) {
    params.set("notes", note);
  }

  const modelMappings = normalizeModelMappings(input.modelMappings);
  const genericMappedModel =
    input.clientType === "claude"
      ? ""
      : getGenericRequestModel(modelMappings, String(input.model ?? importConfig.model ?? ""));
  const claudeMainModel =
    input.clientType === "claude" ? getRoleRequestModel(modelMappings, "main") : "";
  const explicitModel = String(input.model ?? "").trim();
  const model = (
    (input.clientType === "claude" && modelMappings.length > 0 ? "" : explicitModel) ||
    claudeMainModel ||
    explicitModel ||
    genericMappedModel ||
    String(importConfig.model ?? "").trim()
  ).trim();
  if (model) {
    params.set("model", model);
  }

  if (input.clientType === "claude") {
    params.set("apiKeyField", settings.claude.apiKeyField ?? "ANTHROPIC_API_KEY");
    const haikuModel = getRoleRequestModel(modelMappings, "haiku");
    const sonnetModel = getRoleRequestModel(modelMappings, "sonnet");
    const opusModel = getRoleRequestModel(modelMappings, "opus");
    if (haikuModel) params.set("haikuModel", haikuModel);
    if (sonnetModel) params.set("sonnetModel", sonnetModel);
    if (opusModel) params.set("opusModel", opusModel);
  }
  if (input.clientType === "codex") {
    params.set("apiFormat", CC_SWITCH_CODEX_API_FORMAT);
    params.set(
      "config",
      encodeBase64(
        buildCodexConfig({
          apiKey: input.apiKey,
          endpoint: importConfig.endpoint,
          model,
          providerName: params.get("name") ?? input.providerName,
          modelMappings,
          codexModelCatalog: input.codexModelCatalog,
        }),
      ),
    );
  }

  return `ccswitch://v1/import?${params.toString()}`;
}

export function openCcSwitchImportUrl(
  url: string,
  options: { onProtocolUnavailable?: () => void } = {},
): void {
  try {
    window.open(url, "_self");
  } catch {
    options.onProtocolUnavailable?.();
  }
}
