import type { ApiKeyEntry } from "@/lib/http/apis/api-keys";
import { apiClient } from "@/lib/http/client";

export const CUSTOM_PERMISSION_PROFILE_ID = "__custom__";

export interface ApiKeyPermissionProfile {
  id: string;
  name: string;
  "daily-limit": number;
  "total-quota": number;
  "concurrency-limit": number;
  "rpm-limit": number;
  "tpm-limit": number;
  "allowed-models": string[];
  "allowed-channels": string[];
  "allowed-channel-groups": string[];
  "system-prompt": string;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeString = (value: unknown): string => String(value ?? "").trim();

const normalizeLimit = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

const normalizeSpendingLimit = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  value.forEach((item) => {
    const text = normalizeString(item);
    if (!text || seen.has(text)) return;
    seen.add(text);
    list.push(text);
  });
  return list;
};

export const makePermissionProfileId = (name = "profile") => {
  const slug = normalizeString(name)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "profile"}-${Date.now().toString(36)}`;
};

export function normalizeApiKeyPermissionProfiles(raw: unknown): ApiKeyPermissionProfile[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;
      const name = normalizeString(record.name);
      const id = normalizeString(record.id) || `profile-${index + 1}`;
      if (!name) return null;

      return {
        id,
        name,
        "daily-limit": normalizeLimit(record["daily-limit"] ?? record.dailyLimit),
        "total-quota": normalizeLimit(record["total-quota"] ?? record.totalQuota),
        "concurrency-limit": normalizeLimit(record["concurrency-limit"] ?? record.concurrencyLimit),
        "rpm-limit": normalizeLimit(record["rpm-limit"] ?? record.rpmLimit),
        "tpm-limit": normalizeLimit(record["tpm-limit"] ?? record.tpmLimit),
        "allowed-models": normalizeStringList(record["allowed-models"] ?? record.allowedModels),
        "allowed-channels": normalizeStringList(
          record["allowed-channels"] ?? record.allowedChannels,
        ),
        "allowed-channel-groups": normalizeStringList(
          record["allowed-channel-groups"] ?? record.allowedChannelGroups,
        ),
        "system-prompt": normalizeString(record["system-prompt"] ?? record.systemPrompt),
      };
    })
    .filter((profile): profile is ApiKeyPermissionProfile => profile !== null);
}

export const serializeApiKeyPermissionProfile = (profile: ApiKeyPermissionProfile) => ({
  id: profile.id,
  name: profile.name,
  "daily-limit": normalizeLimit(profile["daily-limit"]),
  "total-quota": normalizeLimit(profile["total-quota"]),
  "concurrency-limit": normalizeLimit(profile["concurrency-limit"]),
  "rpm-limit": normalizeLimit(profile["rpm-limit"]),
  "tpm-limit": normalizeLimit(profile["tpm-limit"]),
  "allowed-channel-groups": normalizeStringList(profile["allowed-channel-groups"]),
  "allowed-channels": normalizeStringList(profile["allowed-channels"]),
  "allowed-models": normalizeStringList(profile["allowed-models"]),
  "system-prompt": normalizeString(profile["system-prompt"]),
});

export function applyApiKeyPermissionProfile(
  entry: ApiKeyEntry,
  profile: ApiKeyPermissionProfile | null,
): ApiKeyEntry {
  if (!profile) {
    return {
      ...entry,
      "permission-profile-id": "",
      "daily-limit": 0,
      "total-quota": 0,
      "spending-limit": 0,
      "concurrency-limit": 0,
      "rpm-limit": 0,
      "tpm-limit": 0,
      "allowed-channel-groups": [],
      "allowed-channels": [],
      "allowed-models": [],
      "system-prompt": "",
    };
  }

  return {
    ...entry,
    "permission-profile-id": profile.id,
    "daily-limit": profile["daily-limit"],
    "total-quota": profile["total-quota"],
    "spending-limit": 0,
    "concurrency-limit": profile["concurrency-limit"],
    "rpm-limit": profile["rpm-limit"],
    "tpm-limit": profile["tpm-limit"],
    "allowed-channel-groups": [...profile["allowed-channel-groups"]],
    "allowed-channels": [...profile["allowed-channels"]],
    "allowed-models": [...profile["allowed-models"]],
    "system-prompt": profile["system-prompt"],
  };
}

export function hasApiKeyPermissionSettings(entry: ApiKeyEntry): boolean {
  return Boolean(
    (entry["daily-limit"] ?? 0) > 0 ||
    (entry["total-quota"] ?? 0) > 0 ||
    normalizeSpendingLimit(entry["spending-limit"]) > 0 ||
    (entry["concurrency-limit"] ?? 0) > 0 ||
    (entry["rpm-limit"] ?? 0) > 0 ||
    (entry["tpm-limit"] ?? 0) > 0 ||
    (entry["allowed-channel-groups"] ?? []).length > 0 ||
    (entry["allowed-channels"] ?? []).length > 0 ||
    (entry["allowed-models"] ?? []).length > 0 ||
    normalizeString(entry["system-prompt"]),
  );
}

const sameStringList = (a: string[] | undefined, b: string[]) => {
  const left = [...(a ?? [])].sort();
  const right = [...b].sort();
  return JSON.stringify(left) === JSON.stringify(right);
};

export function findMatchingPermissionProfile(
  entry: ApiKeyEntry,
  profiles: ApiKeyPermissionProfile[],
): ApiKeyPermissionProfile | null {
  return (
    profiles.find(
      (profile) =>
        normalizeLimit(entry["daily-limit"]) === profile["daily-limit"] &&
        normalizeLimit(entry["total-quota"]) === profile["total-quota"] &&
        normalizeSpendingLimit(entry["spending-limit"]) === 0 &&
        normalizeLimit(entry["concurrency-limit"]) === profile["concurrency-limit"] &&
        normalizeLimit(entry["rpm-limit"]) === profile["rpm-limit"] &&
        normalizeLimit(entry["tpm-limit"]) === profile["tpm-limit"] &&
        sameStringList(entry["allowed-channel-groups"], profile["allowed-channel-groups"]) &&
        sameStringList(entry["allowed-channels"], profile["allowed-channels"]) &&
        sameStringList(entry["allowed-models"], profile["allowed-models"]) &&
        normalizeString(entry["system-prompt"]) === profile["system-prompt"],
    ) ?? null
  );
}

export function resolveEntryPermissionProfileId(
  entry: ApiKeyEntry,
  profiles: ApiKeyPermissionProfile[],
): string {
  const explicit = normalizeString(entry["permission-profile-id"]);
  if (explicit && profiles.some((profile) => profile.id === explicit)) return explicit;
  const match = findMatchingPermissionProfile(entry, profiles);
  if (match) return match.id;
  return hasApiKeyPermissionSettings(entry) ? CUSTOM_PERMISSION_PROFILE_ID : "";
}

export const apiKeyPermissionProfilesApi = {
  async list(): Promise<ApiKeyPermissionProfile[]> {
    const data = await apiClient.get<Record<string, unknown>>("/api-key-permission-profiles");
    return normalizeApiKeyPermissionProfiles(
      data["api-key-permission-profiles"] ?? data.items ?? data,
    );
  },

  async replace(profiles: ApiKeyPermissionProfile[]): Promise<void> {
    await apiClient.put(
      "/api-key-permission-profiles",
      profiles.map(serializeApiKeyPermissionProfile),
    );
  },
};
