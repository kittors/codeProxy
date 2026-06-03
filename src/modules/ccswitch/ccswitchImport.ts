import { normalizeApiBase } from "@/lib/connection";
import {
  DEFAULT_CC_SWITCH_IMPORT_SETTINGS,
  normalizeCcSwitchEndpointPath,
  normalizeCcSwitchImportSettings,
  type CcSwitchImportSettingsInput,
} from "@/modules/ccswitch/ccswitchImportSettings";

export type CcSwitchClientType = "claude" | "codex" | "gemini";
export type CcSwitchClaudeModelRole = "main" | "haiku" | "sonnet" | "opus";

export interface CcSwitchModelMappingInput {
  requestModel: string;
  targetModel: string;
  role?: CcSwitchClaudeModelRole;
}

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
  return normalizeApiBase(input).replace(/\/+$/, "");
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

export function buildCcSwitchUsageScript(language?: string): string {
  const labels =
    normalizeUsageScriptLanguage(language) === "en"
      ? {
          planName: "Used today",
          invalidMessage: "API Key not found",
          unit: "times",
          costPrefix: "Today's cost:",
        }
      : {
          planName: "今日已经使用",
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
      used: undefined,
      remaining: calls,
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
