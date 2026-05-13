import type { ApiKeyEntry } from "@/lib/http/apis/api-keys";
import type { CcSwitchImportConfigListItem } from "@/modules/ccswitch/ccswitchImportConfigList";

export function normalizeCcSwitchPermissionList(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const text = String(value ?? "").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    normalized.push(text);
  });

  return normalized;
}

export function getCcSwitchImportTargetModels(config: CcSwitchImportConfigListItem): string[] {
  const mappedTargets = normalizeCcSwitchPermissionList(
    config.modelMappings.map((mapping) => mapping.targetModel),
  );
  if (mappedTargets.length > 0) return mappedTargets;
  return normalizeCcSwitchPermissionList([config.defaultModel]);
}

export function ccSwitchConfigMatchesAllowedModels(
  config: CcSwitchImportConfigListItem,
  allowedModels: readonly string[],
): boolean {
  if (allowedModels.length === 0) return true;
  const allowed = new Set(allowedModels);
  const targetModels = getCcSwitchImportTargetModels(config);
  if (targetModels.length === 0) return true;
  return targetModels.every((model) => allowed.has(model));
}

export function ccSwitchConfigMatchesApiKeyPermissions(
  config: CcSwitchImportConfigListItem,
  entry: Pick<ApiKeyEntry, "allowed-channel-groups" | "allowed-models"> | null | undefined,
): boolean {
  if (!entry) return true;

  const entryGroups = normalizeCcSwitchPermissionList(entry["allowed-channel-groups"]).map((group) =>
    group.toLowerCase(),
  );
  const entryModels = normalizeCcSwitchPermissionList(entry["allowed-models"]);
  const matchesGroups =
    entryGroups.length === 0 ||
    config.allowedChannelGroups.some((group) => entryGroups.includes(group.toLowerCase()));

  return matchesGroups && ccSwitchConfigMatchesAllowedModels(config, entryModels);
}
