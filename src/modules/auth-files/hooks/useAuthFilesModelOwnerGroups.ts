import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { modelsApi } from "@/lib/http/apis";
import type { ModelConfigItem, ModelOwnerPresetItem } from "@/lib/http/apis/models";
import { useToast } from "@/modules/ui/ToastProvider";
import {
  normalizeProviderKey,
  readAuthFilesModelOwnerGroupMap,
  writeAuthFilesModelOwnerGroupMap,
  type AuthFileModelOwnerGroup,
  type AuthFilesModelOwnerGroupMap,
} from "@/modules/auth-files/helpers/authFilesPageUtils";

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
    () => readAuthFilesModelOwnerGroupMap(),
  );

  const loadModelOwnerGroups = useCallback(async () => {
    setModelOwnerGroupsLoading(true);
    try {
      const [models, presets] = await Promise.all([
        modelsApi.getModelConfigs("library"),
        modelsApi.getModelOwnerPresets(),
      ]);
      const groups = buildModelOwnerGroups(models, presets);
      const validOwners = new Set(groups.map((group) => group.value));
      setModelOwnerGroups(groups);
      setModelOwnerByAuthGroup((current) => {
        const next = Object.fromEntries(
          Object.entries(current).filter(([, owner]) => validOwners.has(owner)),
        ) as AuthFilesModelOwnerGroupMap;
        if (sameMap(current, next)) return current;
        writeAuthFilesModelOwnerGroupMap(next);
        return next;
      });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.failed_get_model_owners"),
      });
    } finally {
      setModelOwnerGroupsLoading(false);
    }
  }, [notify, t]);

  const setModelOwnerForAuthGroup = useCallback((authGroup: string, ownerValue: string) => {
    const key = normalizeProviderKey(authGroup);
    const owner = normalizeOwnerValue(ownerValue);
    if (!key || key === "all") return;
    setModelOwnerByAuthGroup((current) => {
      const next = { ...current };
      if (owner) next[key] = owner;
      else delete next[key];
      if (sameMap(current, next)) return current;
      writeAuthFilesModelOwnerGroupMap(next);
      return next;
    });
  }, []);

  return {
    modelOwnerGroupsLoading,
    modelOwnerGroups,
    modelOwnerByAuthGroup,
    setModelOwnerForAuthGroup,
    loadModelOwnerGroups,
  };
}
