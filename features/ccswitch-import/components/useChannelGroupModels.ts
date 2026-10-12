import { useEffect, useState } from "react";
import { modelsApi } from "@code-proxy/api-client";
import {
  filterModelsServedByChannelGroup,
  type ChannelGroupModelGate,
} from "@code-proxy/domain/models/channelGroupModelGate";
import {
  filterByConfiguredModelAvailability,
  loadConfiguredModelAvailability,
} from "@features/model-availability";

export interface CcSwitchChannelGroupOption {
  value: string;
  label: string;
  description?: string;
  routePath?: string;
  allowedModels?: string[];
  excludedModels?: string[];
  channels?: string[];
  modelOwnerKeys?: string[];
  authoritativeModelOwnerKeys?: string[];
}

export type ModelMetadataLike = {
  id: string;
  owned_by?: string;
  source?: string;
  enabled?: boolean;
};

const GENERIC_MODEL_CONFIG_OWNER_KEYS = new Set([
  "all",
  "default",
  "openai",
  "openai-api",
  "openai-compat",
  "openai-compatible",
  "provider",
  "registry",
]);

export function dedupeModels(models: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  models.forEach((model) => {
    const normalized = String(model ?? "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result.sort((a, b) => a.localeCompare(b));
}

/**
 * The models out of `models` that a channel group actually serves, deduplicated.
 * A group refuses what it excludes — loosely, across route prefixes and "*"
 * wildcards, the same way the backend does — so offering one of those as a
 * preset model saves a config whose requests are rejected with a 403.
 */
export function modelsServedByChannelGroup(
  models: Iterable<string>,
  group: ChannelGroupModelGate | undefined,
): string[] {
  return filterModelsServedByChannelGroup(dedupeModels(Array.from(models)), group ?? {});
}

export const normalizeModelOwnerKey = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

export const isSpecificModelConfigOwnerKey = (value: string): boolean => {
  const key = normalizeModelOwnerKey(value);
  return Boolean(key && !GENERIC_MODEL_CONFIG_OWNER_KEYS.has(key));
};

export const modelMetadataMatchesOwnerKeys = (
  model: ModelMetadataLike,
  ownerKeys: ReadonlySet<string>,
): boolean =>
  model.enabled !== false &&
  (ownerKeys.has(normalizeModelOwnerKey(model.owned_by)) ||
    ownerKeys.has(normalizeModelOwnerKey(model.source)));

/**
 * The models a channel group can serve, for the preset editor's model pickers.
 *
 * A group with an allow list is authoritative and needs no request. Otherwise the group's
 * resolved channels (or the group itself) are asked for their models, narrowed by the
 * configured model availability, then widened with the model-config entries owned by the
 * group's channels: an owner mapped from an auth group is authoritative, a specific tag
 * (not a generic one like "openai") only adds its own models.
 */
export function useChannelGroupModels(
  open: boolean,
  selectedGroup: string,
  selectedGroupOption: CcSwitchChannelGroupOption | undefined,
): { models: string[]; loading: boolean; loadedGroup: string } {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // The group `models` belongs to. Right after a group change the previous group's list is
  // still here for a render; callers that act on a finished load compare against this.
  const [loadedGroup, setLoadedGroup] = useState("");

  const allowedModelsKey = (selectedGroupOption?.allowedModels ?? []).join("\n");
  const excludedModelsKey = (selectedGroupOption?.excludedModels ?? []).join("\n");
  const channelsKey = (selectedGroupOption?.channels ?? []).join("\n");
  const authoritativeOwnerKey = (selectedGroupOption?.authoritativeModelOwnerKeys ?? []).join("\n");
  const ownerKey = (selectedGroupOption?.modelOwnerKeys ?? []).join("\n");

  useEffect(() => {
    if (!open || !selectedGroup) {
      setModels([]);
      setLoadedGroup("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const groupAllowedModels = dedupeModels(selectedGroupOption?.allowedModels ?? []);
    if (groupAllowedModels.length > 0) {
      setModels(modelsServedByChannelGroup(groupAllowedModels, selectedGroupOption));
      setLoadedGroup(selectedGroup);
      setLoading(false);
      return;
    }

    const authoritativeModelOwnerKeys = new Set(
      (selectedGroupOption?.authoritativeModelOwnerKeys ?? [])
        .map(normalizeModelOwnerKey)
        .filter(Boolean),
    );
    const lookupChannels = dedupeModels(selectedGroupOption?.channels ?? []);
    const modelOwnerKeys = new Set(
      (selectedGroupOption?.modelOwnerKeys ?? []).map(normalizeModelOwnerKey).filter(Boolean),
    );
    const useResolvedChannels = lookupChannels.length > 0;
    const lookupParams = useResolvedChannels
      ? { allowedChannels: lookupChannels }
      : { allowedChannelGroups: [selectedGroup] };

    setLoading(true);
    modelsApi
      .listAvailableModels(lookupParams)
      .then(async (available) => {
        if (cancelled) return;
        const availability = useResolvedChannels
          ? await loadConfiguredModelAvailability()
          : await loadConfiguredModelAvailability({ allowedChannelGroups: [selectedGroup] });
        if (cancelled) return;
        let visibleModels = filterByConfiguredModelAvailability(available, availability);
        const optionMap = new Map<string, string>();
        const addModelId = (id: string) => {
          const normalized = String(id ?? "").trim();
          if (!normalized) return;
          const key = normalized.toLowerCase();
          if (!optionMap.has(key)) optionMap.set(key, normalized);
        };
        const needsModelConfigs = authoritativeModelOwnerKeys.size > 0 || modelOwnerKeys.size > 0;
        if (needsModelConfigs) {
          const modelConfigs: ModelMetadataLike[] = [
            ...(availability.metadataItems ?? []),
            ...availability.items,
          ];
          if (modelOwnerKeys.size > 0 && authoritativeModelOwnerKeys.size === 0) {
            const allowedModelIds = new Set(
              modelConfigs
                .filter((model) => modelMetadataMatchesOwnerKeys(model, modelOwnerKeys))
                .map((model) => model.id.toLowerCase()),
            );
            if (allowedModelIds.size > 0) {
              visibleModels = visibleModels.filter((model) =>
                allowedModelIds.has(model.id.toLowerCase()),
              );
            }
          }
          if (authoritativeModelOwnerKeys.size > 0) {
            for (const model of modelConfigs) {
              if (modelMetadataMatchesOwnerKeys(model, authoritativeModelOwnerKeys)) {
                addModelId(model.id);
              }
            }
          } else if (modelOwnerKeys.size > 0) {
            const expandableOwnerKeys = new Set(
              Array.from(modelOwnerKeys).filter(isSpecificModelConfigOwnerKey),
            );
            if (expandableOwnerKeys.size > 0) {
              for (const model of modelConfigs) {
                if (modelMetadataMatchesOwnerKeys(model, expandableOwnerKeys)) {
                  addModelId(model.id);
                }
              }
            }
          }
        }
        for (const model of visibleModels) addModelId(model.id);
        setModels(modelsServedByChannelGroup(optionMap.values(), selectedGroupOption));
        setLoadedGroup(selectedGroup);
      })
      .catch(() => {
        if (cancelled) return;
        setModels([]);
        setLoadedGroup(selectedGroup);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // The option's arrays are compared by content: a reloaded group list that serves the
    // same models must not trigger another fetch.
  }, [
    open,
    selectedGroup,
    allowedModelsKey,
    excludedModelsKey,
    channelsKey,
    authoritativeOwnerKey,
    ownerKey,
  ]);

  return { models, loading, loadedGroup };
}
