import { apiClient } from "../client/client";
import {
  createCcSwitchImportConfig,
  type CcSwitchImportCodexModelCatalog,
  type CcSwitchModelMapping,
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

const normalizeModelMappings = (value: unknown): CcSwitchModelMapping[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): CcSwitchModelMapping | null => {
      const record = asRecord(entry);
      if (!record) return null;
      const role = normalizeString(record.role)?.toLowerCase();
      const normalizedRole =
        role === "main" || role === "haiku" || role === "sonnet" || role === "opus"
          ? role
          : undefined;
      const targetModel = normalizeString(
        record["target-model"] ?? record.targetModel ?? record.target ?? record.name,
      );
      const requestModel =
        normalizeString(
          record["request-model"] ?? record.requestModel ?? record.request ?? record.alias,
        ) ?? (normalizedRole ? normalizedRole : targetModel);
      if (!targetModel || !requestModel) return null;
      return {
        ...(normalizedRole ? { role: normalizedRole } : {}),
        requestModel,
        targetModel,
      };
    })
    .filter((item): item is CcSwitchModelMapping => Boolean(item));
};

const normalizeCodexModelCatalog = (
  value: unknown,
): CcSwitchImportCodexModelCatalog | undefined => {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.models)) return undefined;

  const models = record.models.filter(
    (entry): entry is Record<string, unknown> => asRecord(entry) !== null,
  );
  const hasSlug = models.some((entry) => normalizeString(entry.slug));
  return hasSlug ? { models: models.map((entry) => ({ ...entry })) } : undefined;
};

export function normalizeCcSwitchImportConfigs(raw: unknown): CcSwitchImportConfigListItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const clientType = record["client-type"];
      if (clientType !== "claude" && clientType !== "codex" && clientType !== "gemini") {
        return null;
      }

      return createCcSwitchImportConfig({
        id: normalizeString(record.id),
        clientType,
        providerName: normalizeString(record["provider-name"]),
        note: normalizeString(record.note),
        defaultModel: normalizeString(record["default-model"]),
        modelMappings: normalizeModelMappings(record["model-mappings"] ?? record.modelMappings),
        allowedChannelGroups: normalizeStringList(
          record["allowed-channel-groups"] ?? record.allowedChannelGroups,
        ),
        routePath: normalizeString(record["route-path"] ?? record.routePath),
        endpointPath: normalizeString(record["endpoint-path"]),
        usageAutoInterval: normalizeNumber(record["usage-auto-interval"]),
        codexModelCatalogFilename: normalizeString(
          record["codex-model-catalog-filename"] ?? record.codexModelCatalogFilename,
        ),
        codexModelCatalog: normalizeCodexModelCatalog(
          record["codex-model-catalog"] ?? record.codexModelCatalog,
        ),
        apiKeyField:
          record["api-key-field"] === "ANTHROPIC_AUTH_TOKEN"
            ? "ANTHROPIC_AUTH_TOKEN"
            : record["api-key-field"] === "ANTHROPIC_API_KEY"
              ? "ANTHROPIC_API_KEY"
              : undefined,
      });
    })
    .filter((item): item is CcSwitchImportConfigListItem => Boolean(item));
}

const serializeCcSwitchImportConfig = (config: CcSwitchImportConfigListItem) => ({
  id: config.id,
  "client-type": config.clientType,
  "provider-name": config.providerName,
  note: config.note,
  "default-model": config.defaultModel,
  "model-mappings": config.modelMappings.map((mapping) => ({
    ...(mapping.role ? { role: mapping.role } : {}),
    "request-model": mapping.requestModel,
    "target-model": mapping.targetModel,
  })),
  "allowed-channel-groups": [...config.allowedChannelGroups],
  "route-path": config.routePath,
  "endpoint-path": config.endpointPath,
  "usage-auto-interval": config.usageAutoInterval,
  ...(config.clientType === "claude" && config.apiKeyField
    ? { "api-key-field": config.apiKeyField }
    : {}),
});

export const ccSwitchImportConfigsApi = {
  async list(): Promise<CcSwitchImportConfigListItem[]> {
    const data = await apiClient.get<Record<string, unknown>>("/ccswitch-import-configs");
    return normalizeCcSwitchImportConfigs(data["ccswitch-import-configs"] ?? data.items ?? data);
  },

  async replace(configs: CcSwitchImportConfigListItem[]): Promise<void> {
    await apiClient.put(
      "/ccswitch-import-configs",
      configs.map((config) => serializeCcSwitchImportConfig(createCcSwitchImportConfig(config))),
    );
  },
};
