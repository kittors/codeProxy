import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi } from "@/lib/http/apis";
import type { AuthFileItem } from "@/lib/http/types";
import { useToast } from "@/modules/ui/ToastProvider";
import {
  dateLikeToDateTimeLocalInput,
  dateTimeLocalInputToIso,
  formatFileSize,
  MAX_AUTH_FILE_SIZE,
  normalizeAuthFileSubscriptionPeriod,
  readAuthFileChannelName,
  resolveFileType,
  type AuthFileModelItem,
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
  subscriptionStartedAt: "",
  subscriptionPeriod: "monthly",
});

const createChannelEditorState = (): ChannelEditorState => ({
  open: false,
  fileName: "",
  label: "",
  saving: false,
  error: null,
});

const readSubscriptionStartValue = (json: Record<string, unknown>): unknown =>
  json.subscription_started_at ??
  json.subscriptionStartedAt ??
  json.subscription_start_at ??
  json.subscriptionStartAt;

const removeSubscriptionFields = (json: Record<string, unknown>) => {
  delete json.subscription_started_at;
  delete json.subscriptionStartedAt;
  delete json.subscription_start_at;
  delete json.subscriptionStartAt;
  delete json.subscription_started_at_ms;
  delete json.subscriptionStartedAtMs;
  delete json.subscription_period;
  delete json.subscriptionPeriod;
  delete json.subscription_expires_at;
  delete json.subscriptionExpiresAt;
  delete json.subscription_expires_at_ms;
  delete json.subscriptionExpiresAtMs;
  delete json.subscription_remaining_minutes;
  delete json.subscriptionRemainingMinutes;
  delete json.subscription_expired;
  delete json.subscriptionExpired;
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

  const [prefixProxyEditor, setPrefixProxyEditor] = useState<PrefixProxyEditorState>(() =>
    createPrefixProxyEditorState(),
  );
  const [channelEditor, setChannelEditor] = useState<ChannelEditorState>(() =>
    createChannelEditorState(),
  );

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
        subscriptionStartedAt: "",
        subscriptionPeriod: "monthly",
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
        const subscriptionStartedAt = dateLikeToDateTimeLocalInput(
          readSubscriptionStartValue(json),
        );
        const subscriptionPeriod = normalizeAuthFileSubscriptionPeriod(
          json.subscription_period ?? json.subscriptionPeriod,
        );

        setPrefixProxyEditor((prev) => ({
          ...prev,
          loading: false,
          json,
          prefix,
          proxyUrl,
          proxyId,
          subscriptionStartedAt,
          subscriptionPeriod,
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
    const originalSubscriptionStartedAt = dateLikeToDateTimeLocalInput(
      readSubscriptionStartValue(prefixProxyEditor.json),
    );
    const originalSubscriptionPeriod = normalizeAuthFileSubscriptionPeriod(
      prefixProxyEditor.json.subscription_period ?? prefixProxyEditor.json.subscriptionPeriod,
    );
    return (
      originalPrefix !== prefixProxyEditor.prefix ||
      originalProxyUrl !== prefixProxyEditor.proxyUrl ||
      originalProxyId !== prefixProxyEditor.proxyId ||
      originalSubscriptionStartedAt !== prefixProxyEditor.subscriptionStartedAt ||
      originalSubscriptionPeriod !== prefixProxyEditor.subscriptionPeriod
    );
  }, [
    prefixProxyEditor.json,
    prefixProxyEditor.prefix,
    prefixProxyEditor.proxyId,
    prefixProxyEditor.proxyUrl,
    prefixProxyEditor.subscriptionPeriod,
    prefixProxyEditor.subscriptionStartedAt,
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

    removeSubscriptionFields(next);
    const subscriptionStartedAt = prefixProxyEditor.subscriptionStartedAt.trim();
    if (subscriptionStartedAt) {
      const isoValue = dateTimeLocalInputToIso(subscriptionStartedAt);
      if (isoValue) {
        next.subscription_started_at = isoValue;
        next.subscription_period = prefixProxyEditor.subscriptionPeriod;
      }
    }

    return JSON.stringify(next, null, 2);
  }, [
    prefixProxyEditor.json,
    prefixProxyEditor.prefix,
    prefixProxyEditor.proxyId,
    prefixProxyEditor.proxyUrl,
    prefixProxyEditor.subscriptionPeriod,
    prefixProxyEditor.subscriptionStartedAt,
  ]);

  const savePrefixProxy = useCallback(async () => {
    if (!prefixProxyEditor.json) return;
    if (!prefixProxyDirty) return;
    if (
      prefixProxyEditor.subscriptionStartedAt.trim() &&
      dateTimeLocalInputToIso(prefixProxyEditor.subscriptionStartedAt) === null
    ) {
      notify({ type: "error", message: t("auth_files.subscription_started_at_invalid") });
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
    prefixProxyEditor.subscriptionStartedAt,
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
    prefixProxyEditor,
    setPrefixProxyEditor,
    channelEditor,
    setChannelEditor,
    loadModelsForDetail,
    openDetail,
    prefixProxyDirty,
    prefixProxyUpdatedText,
    savePrefixProxy,
    saveChannelEditor,
  };
}
