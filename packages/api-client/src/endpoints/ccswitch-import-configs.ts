import { apiClient } from "../client/client";
import {
  parseCcSwitchClientTypes,
  isCcSwitchClientType,
  type CcSwitchClientType,
} from "@code-proxy/domain/ccswitch/ccswitchClients";
import {
  ccSwitchCodexReasoningEffortsFromCatalog,
  createCcSwitchImportConfig,
  normalizeCcSwitchModelMappings,
  type CcSwitchImportConfigListItem,
} from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeString = (value: unknown): string | undefined => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
};

const normalizeNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
};

/**
 * Backend rows → presets. Rows for apps this panel does not know are skipped. The
 * backend's generated Codex catalog only contributes each model's default reasoning
 * effort; `api-key-field` is not read at all (CC Switch always writes
 * ANTHROPIC_AUTH_TOKEN and ignores the old `apiKeyField` link parameter).
 */
export function normalizeCcSwitchImportConfigs(raw: unknown): CcSwitchImportConfigListItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const clientType = normalizeString(record["client-type"])?.toLowerCase();
      if (!isCcSwitchClientType(clientType)) return null;

      return createCcSwitchImportConfig({
        id: normalizeString(record.id),
        clientType,
        providerName: normalizeString(record["provider-name"]),
        note: normalizeString(record.note),
        defaultModel: normalizeString(record["default-model"]),
        modelMappings: normalizeCcSwitchModelMappings(
          record["model-mappings"] ?? record.modelMappings,
        ),
        allowedChannelGroups: normalizeStringList(
          record["allowed-channel-groups"] ?? record.allowedChannelGroups,
        ),
        routePath: normalizeString(record["route-path"] ?? record.routePath),
        endpointPath: normalizeString(record["endpoint-path"]),
        usageAutoInterval: normalizeNumber(record["usage-auto-interval"]),
        codexReasoningEfforts:
          ccSwitchCodexReasoningEffortsFromCatalog(
            record["codex-model-catalog"] ?? record.codexModelCatalog,
          ) ??
          // Rows the portal cached itself carry the efforts directly.
          (asRecord(record.codexReasoningEfforts) as Record<string, string> | null) ??
          undefined,
      });
    })
    .filter((item): item is CcSwitchImportConfigListItem => Boolean(item));
}

/**
 * Preset → backend row. The Codex catalog is never sent: the backend regenerates it on
 * every GET and drops it on PUT.
 */
export function serializeCcSwitchImportConfig(config: CcSwitchImportConfigListItem) {
  return {
    id: config.id,
    "client-type": config.clientType,
    "provider-name": config.providerName,
    note: config.note,
    "default-model": config.defaultModel,
    "model-mappings": config.modelMappings.map((mapping) => ({
      ...(mapping.role ? { role: mapping.role } : {}),
      "request-model": mapping.requestModel,
      "target-model": mapping.targetModel,
      ...(mapping.contextWindow ? { "context-window": mapping.contextWindow } : {}),
    })),
    "allowed-channel-groups": [...config.allowedChannelGroups],
    "route-path": config.routePath,
    "endpoint-path": config.endpointPath,
    "usage-auto-interval": config.usageAutoInterval,
  };
}

export interface CcSwitchImportConfigsSnapshot {
  configs: CcSwitchImportConfigListItem[];
  /**
   * The apps the backend accepts (`client-types`), or null for a backend that predates
   * the field — that one only accepts claude, codex and gemini.
   */
  clientTypes: CcSwitchClientType[] | null;
}

const configsFromResponse = (data: Record<string, unknown>) =>
  normalizeCcSwitchImportConfigs(data["ccswitch-import-configs"] ?? data.items ?? data);

export const ccSwitchImportConfigsApi = {
  async list(): Promise<CcSwitchImportConfigListItem[]> {
    const data = await apiClient.get<Record<string, unknown>>("/ccswitch-import-configs");
    return configsFromResponse(data);
  },

  async snapshot(): Promise<CcSwitchImportConfigsSnapshot> {
    const data = await apiClient.get<Record<string, unknown>>("/ccswitch-import-configs");
    return {
      configs: configsFromResponse(data),
      clientTypes: parseCcSwitchClientTypes(asRecord(data)?.["client-types"]),
    };
  },

  async replace(configs: CcSwitchImportConfigListItem[]): Promise<void> {
    await apiClient.put(
      "/ccswitch-import-configs",
      configs.map((config) => serializeCcSwitchImportConfig(createCcSwitchImportConfig(config))),
    );
  },
};
