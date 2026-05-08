import { apiClient } from "@/lib/http/client";
import {
  createCcSwitchImportConfig,
  type CcSwitchImportConfigListItem,
} from "@/modules/ccswitch/ccswitchImportConfigList";

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
        allowedChannelGroups: normalizeStringList(
          record["allowed-channel-groups"] ?? record.allowedChannelGroups,
        ),
        endpointPath: normalizeString(record["endpoint-path"]),
        usageAutoInterval: normalizeNumber(record["usage-auto-interval"]),
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
  "allowed-channel-groups": [...config.allowedChannelGroups],
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
