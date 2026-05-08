import {
  getCcSwitchClientConfig,
  type CcSwitchClientType,
} from "@/modules/ccswitch/ccswitchImport";
import {
  DEFAULT_CC_SWITCH_IMPORT_SETTINGS,
  normalizeCcSwitchClaudeAuthField,
  normalizeCcSwitchEndpointPath,
  normalizeCcSwitchImportSettings,
  type CcSwitchClaudeAuthField,
} from "@/modules/ccswitch/ccswitchImportSettings";

export interface CcSwitchImportConfigListItem {
  id: string;
  clientType: CcSwitchClientType;
  providerName: string;
  note: string;
  defaultModel: string;
  allowedChannelGroups: string[];
  endpointPath: string;
  usageAutoInterval: number;
  apiKeyField?: CcSwitchClaudeAuthField;
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

const normalizeUsageAutoInterval = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.round(parsed);
};

const createConfigId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ccswitch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

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

  return {
    id: String(input.id ?? "").trim() || createConfigId(),
    clientType: input.clientType,
    providerName: String(input.providerName ?? "").trim() || defaultProviderName(input.clientType),
    note: String(input.note ?? "").trim(),
    defaultModel:
      String(input.defaultModel ?? "").trim() || String(defaults.defaultModel ?? "").trim(),
    allowedChannelGroups: normalizeChannelGroups(input.allowedChannelGroups),
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
