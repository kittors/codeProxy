import {
  buildCcSwitchCodexModelCatalogJson,
  buildCcSwitchImportUrl,
  CC_SWITCH_CODEX_MODEL_CATALOG_FILENAME,
  type CcSwitchClientType,
  type CcSwitchCodexCatalogModel,
} from "./ccswitchImport";
import {
  normalizeCcSwitchClaudeAuthField,
  normalizeCcSwitchImportSettings,
  type CcSwitchImportSettingsInput,
} from "./ccswitchImportSettings";
import {
  deriveCcSwitchImportSettingsFromConfigList,
  type CcSwitchImportConfigListItem,
} from "./ccswitchImportConfigList";

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
  usageBaseUrl,
  usageLanguage,
}: {
  apiKey: string;
  baseUrl: string;
  config: CcSwitchImportConfigListItem;
  configs: readonly CcSwitchImportConfigListItem[];
  providerName?: string;
  usageBaseUrl?: string;
  usageLanguage?: string;
}): string {
  return buildCcSwitchImportUrl({
    apiKey,
    baseUrl,
    clientType: config.clientType,
    enabled: true,
    note: config.note,
    providerName: config.providerName || providerName || "CliProxy",
    model: config.defaultModel,
    modelMappings: config.modelMappings,
    models: [],
    codexModelCatalog: config.codexModelCatalog,
    settings: buildCcSwitchSettingsForConfig(config, configs),
    usageBaseUrl,
    usageLanguage,
  });
}

export function getCcSwitchCodexModelCatalogFilenameForConfig(
  config: CcSwitchImportConfigListItem,
): string {
  return config.codexModelCatalogFilename?.trim() || CC_SWITCH_CODEX_MODEL_CATALOG_FILENAME;
}

export function buildCcSwitchCodexModelCatalogJsonForConfig(
  config: CcSwitchImportConfigListItem,
): string {
  if (config.clientType !== "codex") return "";
  if (config.codexModelCatalog?.models.length) {
    return `${JSON.stringify(config.codexModelCatalog, null, 2)}\n`;
  }

  const models: CcSwitchCodexCatalogModel[] = [];
  const defaultModel = config.defaultModel.trim();
  if (defaultModel) {
    models.push({ model: defaultModel });
  }
  for (const mapping of config.modelMappings) {
    if (mapping.role) continue;
    const model = (mapping.requestModel || mapping.targetModel).trim();
    if (model) {
      models.push({ model });
    }
  }
  if (models.length === 0) return "";
  return `${buildCcSwitchCodexModelCatalogJson(models)}\n`;
}
