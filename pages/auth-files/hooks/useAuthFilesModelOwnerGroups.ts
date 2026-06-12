import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { modelsApi } from "@code-proxy/api-client";
import type {
  ModelConfigItem,
  ModelOwnerPresetItem,
} from "@code-proxy/api-client/endpoints/models";
import { invalidateConfiguredModelAvailability } from "@features/model-availability";
import { useToast } from "@code-proxy/ui";
import {
  normalizeProviderKey,
  type AuthFileModelOwnerGroup,
  type AuthFilesModelOwnerGroupMap,
} from "@code-proxy/domain";

const normalizeOwnerValue = (value: string): string =>
  value.trim().replace(/\s+/g, "-").toLowerCase();

const buildModelOwnerGroups = (
  models: ModelConfigItem[],
  presets: ModelOwnerPresetItem[],
): AuthFileModelOwnerGroup[] => {
  const groups = new Map<string, AuthFileModelOwnerGroup>();

  for (const preset of presets) {
    const value = normalizeOwnerValue(preset.value);
    if (!value) continue;
    groups.set(value, {
      value,
      label: preset.label || value,
      description: preset.description,
      models: [],
    });
  }

  for (const model of models) {
    const value = normalizeOwnerValue(model.owned_by);
    if (!value) continue;
    const group =
      groups.get(value) ??
      ({
        value,
        label: model.owned_by || value,
        description: "",
        models: [],
      } satisfies AuthFileModelOwnerGroup);
    group.models.push({
      id: model.id,
      display_name: model.description || undefined,
      owned_by: model.owned_by || value,
    });
    groups.set(value, group);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      models: group.models.sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const sameMap = (a: AuthFilesModelOwnerGroupMap, b: AuthFilesModelOwnerGroupMap): boolean => {
  const aEntries = Object.entries(a);
  const bEntries = Object.entries(b);
  if (aEntries.length !== bEntries.length) return false;
  return aEntries.every(([key, value]) => b[key] === value);
};

export function useAuthFilesModelOwnerGroups() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [modelOwnerGroupsLoading, setModelOwnerGroupsLoading] = useState(false);
  const [modelOwnerGroups, setModelOwnerGroups] = useState<AuthFileModelOwnerGroup[]>([]);
  const [modelOwnerByAuthGroup, setModelOwnerByAuthGroup] = useState<AuthFilesModelOwnerGroupMap>(
    {},
  );

  const loadModelOwnerGroups = useCallback(async () => {
    setModelOwnerGroupsLoading(true);
    try {
      const [models, presets, mappings] = await Promise.all([
        modelsApi.getModelConfigs("library"),
        modelsApi.getModelOwnerPresets(),
        modelsApi.getAuthGroupModelOwnerMappingMap(),
      ]);
      const groups = buildModelOwnerGroups(models, presets);
      setModelOwnerGroups(groups);
      setModelOwnerByAuthGroup((current) => (sameMap(current, mappings) ? current : mappings));
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.failed_get_model_owners"),
      });
    } finally {
      setModelOwnerGroupsLoading(false);
    }
  }, [notify, t]);

  const setModelOwnerForAuthGroup = useCallback(
    async (authGroup: string, ownerValue: string) => {
      const key = normalizeProviderKey(authGroup);
      const owner = normalizeOwnerValue(ownerValue);
      if (!key || key === "all") return;
      try {
        await modelsApi.saveAuthGroupModelOwnerMapping(key, owner);
        invalidateConfiguredModelAvailability();
        setModelOwnerByAuthGroup((current) => {
          const next = { ...current };
          if (owner) next[key] = owner;
          else delete next[key];
          return sameMap(current, next) ? current : next;
        });
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.failed_get_model_owners"),
        });
        throw err;
      }
    },
    [notify, t],
  );

  return {
    modelOwnerGroupsLoading,
    modelOwnerGroups,
    modelOwnerByAuthGroup,
    setModelOwnerForAuthGroup,
    loadModelOwnerGroups,
  };
}
