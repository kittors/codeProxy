import {
  buildCcSwitchImportUrl,
  type CcSwitchClientType,
} from "@/modules/ccswitch/ccswitchImport";
import {
  normalizeCcSwitchClaudeAuthField,
  normalizeCcSwitchImportSettings,
  type CcSwitchImportSettingsInput,
} from "@/modules/ccswitch/ccswitchImportSettings";
import {
  deriveCcSwitchImportSettingsFromConfigList,
  type CcSwitchImportConfigListItem,
} from "@/modules/ccswitch/ccswitchImportConfigList";

function normalizeRoutePath(path: string): string {
  const trimmed = String(path ?? "").trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

export function appendCcSwitchRoutePath(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = normalizeRoutePath(path);
  if (!normalizedPath) return normalizedBase;
  if (normalizedBase.toLowerCase().endsWith(normalizedPath.toLowerCase())) {
    return normalizedBase;
  }
  return `${normalizedBase}${normalizedPath}`;
}

export function buildCcSwitchSettingsForConfig(
  config: CcSwitchImportConfigListItem,
  configs: readonly CcSwitchImportConfigListItem[],
): CcSwitchImportSettingsInput {
  const settings =
    configs.length > 0
      ? deriveCcSwitchImportSettingsFromConfigList(configs)
      : normalizeCcSwitchImportSettings();
  const clientSettings = {
    ...settings[config.clientType],
    endpointPath: config.endpointPath ?? settings[config.clientType].endpointPath,
    usageAutoInterval: config.usageAutoInterval ?? settings[config.clientType].usageAutoInterval,
    defaultModel: config.defaultModel ?? settings[config.clientType].defaultModel,
  };

  if (config.clientType === "claude") {
    return {
      ...settings,
      claude: {
        ...clientSettings,
        apiKeyField: normalizeCcSwitchClaudeAuthField(config.apiKeyField),
      },
    };
  }

  return {
    ...settings,
    [config.clientType as CcSwitchClientType]: clientSettings,
  };
}

export function buildCcSwitchImportUrlForConfig({
  apiKey,
  baseUrl,
  config,
  configs,
  providerName,
}: {
  apiKey: string;
  baseUrl: string;
  config: CcSwitchImportConfigListItem;
  configs: readonly CcSwitchImportConfigListItem[];
  providerName?: string;
}): string {
  return buildCcSwitchImportUrl({
    apiKey,
    baseUrl,
    clientType: config.clientType,
    enabled: true,
    providerName: config.providerName || providerName || "CliProxy",
    model: config.defaultModel,
    modelMappings: config.modelMappings,
    models: [],
    settings: buildCcSwitchSettingsForConfig(config, configs),
  });
}
