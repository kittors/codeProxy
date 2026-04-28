import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi, modelsApi } from "@/lib/http/apis";
import type { ModelConfigItem, ModelOwnerPresetItem } from "@/lib/http/apis/models";
import type { AuthFileItem } from "@/lib/http/types";
import { useToast } from "@/modules/ui/ToastProvider";
import {
  dateLikeToDateTimeLocalInput,
  dateTimeLocalInputToIso,
  formatFileSize,
  MAX_AUTH_FILE_SIZE,
  readAuthFileChannelName,
  resolveFileType,
  type AuthFileModelItem,
  type AuthFileModelOwnerGroup,
  type ChannelEditorState,
  type PrefixProxyEditorState,
} from "@/modules/auth-files/helpers/authFilesPageUtils";

type DetailTab = "json" | "models" | "fields" | "channel";

const createPrefixProxyEditorState = (): PrefixProxyEditorState => ({
  open: false,
  fileName: "",
  loading: false,
  saving: false,
  error: null,
  json: null,
  prefix: "",
  proxyUrl: "",
  proxyId: "",
  subscriptionExpiresAt: "",
});

const createChannelEditorState = (): ChannelEditorState => ({
  open: false,
  fileName: "",
  label: "",
  saving: false,
  error: null,
});

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

export function useAuthFilesDetailEditors(loadAll: () => Promise<void>) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const modelsCacheRef = useRef<Map<string, AuthFileModelItem[]>>(new Map());

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailFile, setDetailFile] = useState<AuthFileItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailText, setDetailText] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("json");

  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsFileType, setModelsFileType] = useState("");
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelOwnerGroupsLoading, setModelOwnerGroupsLoading] = useState(false);
  const [modelOwnerGroups, setModelOwnerGroups] = useState<AuthFileModelOwnerGroup[]>([]);
  const [selectedModelOwner, setSelectedModelOwner] = useState("");

  const [prefixProxyEditor, setPrefixProxyEditor] = useState<PrefixProxyEditorState>(() =>
    createPrefixProxyEditorState(),
  );
  const [channelEditor, setChannelEditor] = useState<ChannelEditorState>(() =>
    createChannelEditorState(),
  );

  const loadModelOwnerGroups = useCallback(async () => {
    setModelOwnerGroupsLoading(true);
    try {
      const [models, presets] = await Promise.all([
        modelsApi.getModelConfigs("library"),
        modelsApi.getModelOwnerPresets(),
      ]);
      const groups = buildModelOwnerGroups(models, presets);
      setModelOwnerGroups(groups);
      setSelectedModelOwner((current) =>
        current && !groups.some((group) => group.value === current) ? "" : current,
      );
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.failed_get_model_owners"),
      });
    } finally {
      setModelOwnerGroupsLoading(false);
    }
  }, [notify, t]);

  const loadModelsForDetail = useCallback(
    async (file: AuthFileItem, options?: { force?: boolean }) => {
      const force = Boolean(options?.force);
      setModelsFileType(resolveFileType(file));
      setModelsLoading(true);
      setModelsList([]);
      setModelsError(null);

      if (!force) {
        const cached = modelsCacheRef.current.get(file.name);
        if (cached) {
          setModelsList(cached);
          setModelsLoading(false);
          return;
        }
      }

      try {
        const list = await authFilesApi.getModelsForAuthFile(file.name);
        modelsCacheRef.current.set(file.name, list);
        setModelsList(list);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "";
        if (/404|not found/i.test(message)) {
          setModelsError("unsupported");
          return;
        }
        notify({ type: "error", message: message || t("auth_files.failed_get_models") });
      } finally {
        setModelsLoading(false);
      }
    },
    [notify, t],
  );

  const openDetail = useCallback(
    async (file: AuthFileItem) => {
      setDetailOpen(true);
      setDetailTab("json");
      setDetailFile(file);
      setDetailLoading(true);
      setDetailText("");
      setSelectedModelOwner("");
      try {
        const text = await authFilesApi.downloadText(file.name);
        setDetailText(text);
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.read_failed"),
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [notify, t],
  );

  const openPrefixProxyEditor = useCallback(
    async (file: AuthFileItem) => {
      setPrefixProxyEditor({
        open: true,
        fileName: file.name,
        loading: true,
        saving: false,
        error: null,
        json: null,
        prefix: "",
        proxyUrl: "",
        proxyId: "",
        subscriptionExpiresAt: "",
      });

      try {
        const rawText = await authFilesApi.downloadText(file.name);
        const trimmed = rawText.trim();

        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed) as unknown;
        } catch {
          setPrefixProxyEditor((prev) => ({
            ...prev,
            loading: false,
            error: t("auth_files.not_valid_json"),
          }));
          return;
        }

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setPrefixProxyEditor((prev) => ({
            ...prev,
            loading: false,
            error: t("auth_files.not_json_object"),
          }));
          return;
        }

        const json = parsed as Record<string, unknown>;
        const prefix = typeof json.prefix === "string" ? json.prefix : "";
        const proxyUrl = typeof json.proxy_url === "string" ? json.proxy_url : "";
        const proxyId = typeof json.proxy_id === "string" ? json.proxy_id : "";
        const subscriptionExpiresAt = dateLikeToDateTimeLocalInput(
          json.subscription_expires_at ?? json.subscriptionExpiresAt,
        );

        setPrefixProxyEditor((prev) => ({
          ...prev,
          loading: false,
          json,
          prefix,
          proxyUrl,
          proxyId,
          subscriptionExpiresAt,
          error: null,
        }));
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.read_failed"),
        });
        setPrefixProxyEditor((prev) => ({
          ...prev,
          loading: false,
          error: t("auth_files.read_failed"),
        }));
      }
    },
    [notify, t],
  );

  const openChannelEditor = useCallback((file: AuthFileItem) => {
    setChannelEditor({
      open: true,
      fileName: file.name,
      label: readAuthFileChannelName(file),
      saving: false,
      error: null,
    });
  }, []);

  const saveChannelEditor = useCallback(async () => {
    const fileName = channelEditor.fileName.trim();
    const label = channelEditor.label.trim();
    if (!fileName) return;
    if (!label) {
      setChannelEditor((prev) => ({ ...prev, error: t("auth_files.channel_name_required") }));
      return;
    }

    setChannelEditor((prev) => ({ ...prev, saving: true, error: null }));
    try {
      await authFilesApi.patchFields({ name: fileName, label });
      notify({ type: "success", message: t("auth_files.saved") });
      await loadAll();
      setChannelEditor((prev) => ({ ...prev, saving: false, error: null }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("auth_files.save_failed");
      setChannelEditor((prev) => ({ ...prev, saving: false, error: message }));
      notify({ type: "error", message });
    }
  }, [channelEditor.fileName, channelEditor.label, loadAll, notify, t]);

  useEffect(() => {
    if (!detailOpen || !detailFile) return;
    if (detailTab === "models") {
      void loadModelsForDetail(detailFile);
      void loadModelOwnerGroups();
      return;
    }
    if (detailTab === "fields") {
      if (prefixProxyEditor.fileName !== detailFile.name) {
        void openPrefixProxyEditor(detailFile);
      }
      return;
    }
    if (detailTab === "channel") {
      if (channelEditor.fileName !== detailFile.name) {
        openChannelEditor(detailFile);
      }
    }
  }, [
    channelEditor.fileName,
    detailFile,
    detailOpen,
    detailTab,
    loadModelOwnerGroups,
    loadModelsForDetail,
    openChannelEditor,
    openPrefixProxyEditor,
    prefixProxyEditor.fileName,
  ]);

  const prefixProxyDirty = useMemo(() => {
    if (!prefixProxyEditor.json) return false;
    const originalPrefix =
      typeof prefixProxyEditor.json.prefix === "string" ? prefixProxyEditor.json.prefix : "";
    const originalProxyUrl =
      typeof prefixProxyEditor.json.proxy_url === "string" ? prefixProxyEditor.json.proxy_url : "";
    const originalProxyId =
      typeof prefixProxyEditor.json.proxy_id === "string" ? prefixProxyEditor.json.proxy_id : "";
    const originalSubscriptionExpiresAt = dateLikeToDateTimeLocalInput(
      prefixProxyEditor.json.subscription_expires_at ??
        prefixProxyEditor.json.subscriptionExpiresAt,
    );
    return (
      originalPrefix !== prefixProxyEditor.prefix ||
      originalProxyUrl !== prefixProxyEditor.proxyUrl ||
      originalProxyId !== prefixProxyEditor.proxyId ||
      originalSubscriptionExpiresAt !== prefixProxyEditor.subscriptionExpiresAt
    );
  }, [
    prefixProxyEditor.json,
    prefixProxyEditor.prefix,
    prefixProxyEditor.proxyId,
    prefixProxyEditor.proxyUrl,
    prefixProxyEditor.subscriptionExpiresAt,
  ]);

  const prefixProxyUpdatedText = useMemo(() => {
    if (!prefixProxyEditor.json) return "";
    const next = { ...prefixProxyEditor.json };

    const prefix = prefixProxyEditor.prefix.trim();
    if (prefix) next.prefix = prefix;
    else delete next.prefix;

    const proxyUrl = prefixProxyEditor.proxyUrl.trim();
    if (proxyUrl) next.proxy_url = proxyUrl;
    else delete next.proxy_url;

    const proxyId = prefixProxyEditor.proxyId.trim();
    if (proxyId) next.proxy_id = proxyId;
    else delete next.proxy_id;

    const subscriptionExpiresAt = prefixProxyEditor.subscriptionExpiresAt.trim();
    if (subscriptionExpiresAt) {
      const isoValue = dateTimeLocalInputToIso(subscriptionExpiresAt);
      if (isoValue) next.subscription_expires_at = isoValue;
    } else {
      delete next.subscription_expires_at;
      delete next.subscriptionExpiresAt;
    }

    return JSON.stringify(next, null, 2);
  }, [
    prefixProxyEditor.json,
    prefixProxyEditor.prefix,
    prefixProxyEditor.proxyId,
    prefixProxyEditor.proxyUrl,
    prefixProxyEditor.subscriptionExpiresAt,
  ]);

  const savePrefixProxy = useCallback(async () => {
    if (!prefixProxyEditor.json) return;
    if (!prefixProxyDirty) return;
    if (
      prefixProxyEditor.subscriptionExpiresAt.trim() &&
      dateTimeLocalInputToIso(prefixProxyEditor.subscriptionExpiresAt) === null
    ) {
      notify({ type: "error", message: t("auth_files.subscription_expires_at_invalid") });
      return;
    }

    const payload = prefixProxyUpdatedText;
    const fileSize = new Blob([payload]).size;
    if (fileSize > MAX_AUTH_FILE_SIZE) {
      notify({
        type: "error",
        message: t("auth_files.save_too_large", { size: formatFileSize(fileSize) }),
      });
      return;
    }

    const name = prefixProxyEditor.fileName;
    setPrefixProxyEditor((prev) => ({ ...prev, saving: true }));
    try {
      const file = new File([payload], name, { type: "application/json" });
      await authFilesApi.upload(file);
      notify({ type: "success", message: t("auth_files.saved") });
      await loadAll();
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        setPrefixProxyEditor((prev) => ({
          ...prev,
          loading: false,
          saving: false,
          error: null,
          json: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : prev.json,
        }));
      } catch {
        setPrefixProxyEditor((prev) => ({ ...prev, saving: false, error: null }));
      }
      setDetailText((prev) => (name && detailFile?.name === name ? payload : prev));
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.save_failed"),
      });
      setPrefixProxyEditor((prev) => ({ ...prev, saving: false }));
    }
  }, [
    detailFile?.name,
    loadAll,
    notify,
    prefixProxyDirty,
    prefixProxyEditor.fileName,
    prefixProxyEditor.json,
    prefixProxyEditor.subscriptionExpiresAt,
    prefixProxyUpdatedText,
    t,
  ]);

  return {
    detailOpen,
    setDetailOpen,
    detailFile,
    setDetailFile,
    detailLoading,
    detailText,
    detailTab,
    setDetailTab,
    modelsLoading,
    modelsFileType,
    modelsList,
    modelsError,
    modelOwnerGroupsLoading,
    modelOwnerGroups,
    selectedModelOwner,
    setSelectedModelOwner,
    prefixProxyEditor,
    setPrefixProxyEditor,
    channelEditor,
    setChannelEditor,
    loadModelsForDetail,
    loadModelOwnerGroups,
    openDetail,
    prefixProxyDirty,
    prefixProxyUpdatedText,
    savePrefixProxy,
    saveChannelEditor,
  };
}
