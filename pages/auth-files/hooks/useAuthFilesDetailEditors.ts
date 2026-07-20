import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi, identityFingerprintApi, usageApi } from "@code-proxy/api-client";
import type { AuthFileTrendResponse } from "@code-proxy/api-client/endpoints/usage";
import type { AuthFileItem, IdentityFingerprintAccountDetail } from "@code-proxy/api-client";
import { useToast } from "@code-proxy/ui";
import {
  dateLikeToDateTimeLocalInput,
  dateTimeLocalInputToIso,
  formatFileSize,
  MAX_AUTH_FILE_SIZE,
  canRenameAuthFileChannel,
  normalizeAuthIndexValue,
  normalizeProviderKey,
  normalizeAuthFileSubscriptionPeriod,
  readAuthFileChannelName,
  resolveFileType,
  type AuthFileModelItem,
  type ChannelEditorState,
  type CodexImageGenerationBridgeEditorState,
  type CodexOAuthAdmissionEditorState,
  type PrefixProxyEditorState,
  type XAIEndpointEditorState,
} from "@code-proxy/domain";

type DetailTab = "usage" | "identity" | "fields" | "models";
type DetailTrendWindow = "5h" | "week";
type RefreshDetailTrendOptions = { silent?: boolean };

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

const createCodexOAuthAdmissionEditorState = (): CodexOAuthAdmissionEditorState => ({
  fileName: "",
  supported: false,
  enabled: false,
  allowedClients: [],
  availableAllowedClients: [],
  saving: false,
  error: null,
});

const createCodexImageGenerationBridgeEditorState =
  (): CodexImageGenerationBridgeEditorState => ({
    fileName: "",
    supported: false,
    enabled: false,
    saving: false,
    error: null,
  });

const createXAIEndpointEditorState = (): XAIEndpointEditorState => ({
  fileName: "",
  supported: false,
  usingApi: false,
  saving: false,
  error: null,
});

const isXAIOauthAuthFile = (file: AuthFileItem): boolean => {
  const provider = normalizeProviderKey(resolveFileType(file));
  if (provider !== "xai" && provider !== "grok" && provider !== "x-ai") {
    return false;
  }
  const accountType = String(file.account_type ?? "").trim().toLowerCase();
  if (accountType === "oauth") return true;
  // List entries for OAuth usually expose email; API-key rows do not need this editor.
  return Boolean(String(file.email ?? "").trim());
};

const normalizeCodexAllowedClientId = (value: string): string => value.trim().toLowerCase();

const normalizeCodexAllowedClientIds = (values: string[] | undefined): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  (values ?? []).forEach((value) => {
    const id = normalizeCodexAllowedClientId(value);
    if (!id || seen.has(id)) return;
    seen.add(id);
    normalized.push(id);
  });
  return normalized;
};

const codexAllowedClientSetKey = (values: string[] | undefined): string =>
  [...normalizeCodexAllowedClientIds(values)].sort().join("\n");

const buildCodexOAuthAdmissionEditorState = (
  file: AuthFileItem,
): CodexOAuthAdmissionEditorState => {
  const admission = file.codex_oauth_admission;
  if (!admission) {
    return { ...createCodexOAuthAdmissionEditorState(), fileName: file.name };
  }

  return {
    fileName: file.name,
    supported: true,
    enabled: Boolean(admission.enabled),
    allowedClients: normalizeCodexAllowedClientIds(admission.allowed_clients),
    availableAllowedClients: (admission.available_allowed_clients ?? []).map((preset) => ({
      id: normalizeCodexAllowedClientId(preset.id),
      label: preset.label,
      description: preset.description,
    })),
    saving: false,
    error: null,
  };
};

const buildCodexImageGenerationBridgeEditorState = (
  file: AuthFileItem,
): CodexImageGenerationBridgeEditorState => {
  const bridge = file.codex_image_generation_bridge;
  if (!bridge) {
    return { ...createCodexImageGenerationBridgeEditorState(), fileName: file.name };
  }
  return {
    fileName: file.name,
    supported: true,
    enabled: Boolean(bridge.enabled),
    saving: false,
    error: null,
  };
};

const buildXAIEndpointEditorState = (file: AuthFileItem): XAIEndpointEditorState => {
  if (!isXAIOauthAuthFile(file)) {
    return { ...createXAIEndpointEditorState(), fileName: file.name };
  }
  return {
    fileName: file.name,
    supported: true,
    usingApi: file.using_api === true,
    saving: false,
    error: null,
  };
};

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

const mergeSavedSubscriptionFields = (
  file: AuthFileItem,
  json: Record<string, unknown>,
): AuthFileItem => {
  const next = { ...file };
  const startedAt = readSubscriptionStartValue(json);

  delete next.subscription_started_at;
  delete next.subscriptionStartedAt;
  delete next.subscription_start_at;
  delete next.subscriptionStartAt;
  delete next.subscription_started_at_ms;
  delete next.subscriptionStartedAtMs;
  delete next.subscription_period;
  delete next.subscriptionPeriod;
  delete next.subscription_expires_at;
  delete next.subscriptionExpiresAt;
  delete next.subscription_expires_at_ms;
  delete next.subscriptionExpiresAtMs;
  delete next.subscription_remaining_minutes;
  delete next.subscriptionRemainingMinutes;
  delete next.subscription_expired;
  delete next.subscriptionExpired;

  if (typeof startedAt === "string" && startedAt.trim()) {
    next.subscription_started_at = startedAt;
    next.subscription_period = normalizeAuthFileSubscriptionPeriod(
      json.subscription_period ?? json.subscriptionPeriod,
    );
  }

  return next;
};

const mergeSavedCodexOAuthAdmissionFields = (
  file: AuthFileItem,
  editor: CodexOAuthAdmissionEditorState,
): AuthFileItem => {
  if (file.name !== editor.fileName || !file.codex_oauth_admission) return file;
  const allowedClients = normalizeCodexAllowedClientIds(editor.allowedClients);
  return {
    ...file,
    codex_oauth_admission: {
      ...file.codex_oauth_admission,
      enabled: editor.enabled,
      allowed_clients: allowedClients,
      available_allowed_clients: editor.availableAllowedClients,
    },
    codex_cli_only: editor.enabled,
    codex_cli_only_allowed_clients: allowedClients,
  };
};

const mergeSavedCodexImageGenerationBridgeFields = (
  file: AuthFileItem,
  editor: CodexImageGenerationBridgeEditorState,
): AuthFileItem => {
  if (file.name !== editor.fileName || !file.codex_image_generation_bridge) return file;
  return {
    ...file,
    codex_image_generation_bridge: {
      ...file.codex_image_generation_bridge,
      enabled: editor.enabled,
    },
  };
};

const mergeSavedXAIEndpointFields = (
  file: AuthFileItem,
  editor: XAIEndpointEditorState,
): AuthFileItem => {
  if (file.name !== editor.fileName || !editor.supported) return file;
  return {
    ...file,
    using_api: editor.usingApi,
  };
};

const supportsAuthFileTrend = (file: AuthFileItem): boolean => {
  const provider = normalizeProviderKey(resolveFileType(file));
  return provider === "kimi" || provider === "codex" || provider === "xai";
};

const identityFingerprintDetailKey = (file: AuthFileItem): string => {
  const summary = file.identity_fingerprint_summary;
  if (!summary?.account_key) return "";
  return [summary.provider, summary.account_key, summary.auth_subject_id ?? ""].join("\n");
};

export function useAuthFilesDetailEditors(
  loadAll: () => Promise<AuthFileItem[]>,
  setFiles?: Dispatch<SetStateAction<AuthFileItem[]>>,
  identityFingerprintEnabled = true,
) {
  const { t } = useTranslation();
  const { notify } = useToast();
  // Per-auth-file list cache (any provider).
  const modelsCacheRef = useRef<Map<string, AuthFileModelItem[]>>(new Map());
  // Shared live discovery list for claude/codex/xai (same-type accounts reuse).
  const providerDiscoveryCacheRef = useRef<Map<string, AuthFileModelItem[]>>(
    new Map(),
  );
  const detailTrendInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const identityFingerprintDetailKeyRef = useRef("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailFile, setDetailFile] = useState<AuthFileItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailText, setDetailText] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("fields");
  const [detailTrendWindow, setDetailTrendWindow] = useState<DetailTrendWindow>("5h");
  const [detailTrend, setDetailTrend] = useState<AuthFileTrendResponse | null>(null);
  const [detailTrendLoading, setDetailTrendLoading] = useState(false);
  const [detailTrendError, setDetailTrendError] = useState<string | null>(null);
  const [identityFingerprintDetail, setIdentityFingerprintDetail] =
    useState<IdentityFingerprintAccountDetail | null>(null);
  const [identityFingerprintLoading, setIdentityFingerprintLoading] = useState(false);
  const [identityFingerprintSaving, setIdentityFingerprintSaving] = useState(false);
  const [identityFingerprintError, setIdentityFingerprintError] = useState<string | null>(null);

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
  const [codexOAuthAdmissionEditor, setCodexOAuthAdmissionEditor] =
    useState<CodexOAuthAdmissionEditorState>(() => createCodexOAuthAdmissionEditorState());
  const [codexImageGenerationBridgeEditor, setCodexImageGenerationBridgeEditor] =
    useState<CodexImageGenerationBridgeEditorState>(() =>
      createCodexImageGenerationBridgeEditorState(),
    );
  const [xaiEndpointEditor, setXAIEndpointEditor] = useState<XAIEndpointEditorState>(() =>
    createXAIEndpointEditorState(),
  );

  const applySavedAuthFilePatch = useCallback(
    (fileName: string, json: Record<string, unknown>) => {
      const applyPatch = (file: AuthFileItem): AuthFileItem =>
        file.name === fileName ? mergeSavedSubscriptionFields(file, json) : file;

      setFiles?.((prev) => prev.map(applyPatch));
      setDetailFile((prev) => (prev && prev.name === fileName ? applyPatch(prev) : prev));
    },
    [setFiles],
  );

  const loadModelsForDetail = useCallback(
    async (file: AuthFileItem, options?: { force?: boolean }) => {
      const force = Boolean(options?.force);
      const fileType = resolveFileType(file);
      const provider = normalizeProviderKey(fileType);
      // Align with backend normalizeDiscoveryProvider (x-ai/grok → xai).
      const discoveryProvider =
        provider === "x-ai" || provider === "grok" ? "xai" : provider;
      const sharedDiscovery =
        discoveryProvider === "claude" ||
        discoveryProvider === "codex" ||
        discoveryProvider === "xai";
      setModelsFileType(fileType);
      setModelsError(null);

      // Prefer shared provider discovery cache so reopening the modal keeps the
      // live list (not the static registry) after a successful warm/refresh.
      if (!force && sharedDiscovery) {
        const providerCached =
          providerDiscoveryCacheRef.current.get(discoveryProvider);
        if (providerCached && providerCached.length > 0) {
          setModelsList(providerCached);
          setModelsLoading(false);
          return;
        }
      }

      if (!force) {
        const cached = modelsCacheRef.current.get(file.name);
        if (cached && cached.length > 0) {
          setModelsList(cached);
          // For non-discovery providers, file cache is enough.
          // For claude/codex/xai, still call the API so backend can auto-warm the
          // shared provider cache; keep showing the file cache meanwhile.
          if (!sharedDiscovery) {
            setModelsLoading(false);
            return;
          }
        } else {
          setModelsList([]);
        }
      }

      setModelsLoading(true);

      try {
        const { models: list, source } = await authFilesApi.getModelsForAuthFile(
          file.name,
          { force },
        );
        modelsCacheRef.current.set(file.name, list);
        if (sharedDiscovery && source === "upstream" && list.length > 0) {
          providerDiscoveryCacheRef.current.set(discoveryProvider, list);
        }
        setModelsList(list);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "";
        if (/404|not found/i.test(message)) {
          setModelsError("unsupported");
          return;
        }
        notify({
          type: "error",
          message: message || t("auth_files.failed_get_models"),
        });
      } finally {
        setModelsLoading(false);
      }
    },
    [notify, t],
  );

  const refreshDetailTrend = useCallback(
    async (fileArg?: AuthFileItem | null, options?: RefreshDetailTrendOptions) => {
      const file = fileArg ?? detailFile;
      if (!file || !supportsAuthFileTrend(file)) {
        setDetailTrend(null);
        setDetailTrendError(null);
        setDetailTrendLoading(false);
        return;
      }

      const authIndex = normalizeAuthIndexValue(file.auth_index ?? file.authIndex);
      if (!authIndex) {
        setDetailTrend(null);
        setDetailTrendError(t("auth_files.trend_missing_auth_index"));
        setDetailTrendLoading(false);
        return;
      }

      const existing = detailTrendInFlightRef.current.get(authIndex);
      if (existing) {
        try {
          await existing;
        } catch {
          // 主请求会更新 detailTrendError；重复调用只负责复用同一个请求。
        }
        return;
      }

      const shouldShowLoading = !options?.silent || !detailTrend;
      if (shouldShowLoading) {
        setDetailTrendLoading(true);
      }
      setDetailTrendError(null);

      const request = (async () => {
        const trend = await usageApi.getAuthFileTrend(authIndex, {
          days: 7,
          hours: 5,
        });
        if (shouldShowLoading) {
          setDetailTrendLoading(false);
        }
        setDetailTrend(trend);
      })();
      detailTrendInFlightRef.current.set(authIndex, request);

      try {
        await request;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("auth_files.trend_load_failed");
        setDetailTrend(null);
        setDetailTrendError(message);
      } finally {
        if (detailTrendInFlightRef.current.get(authIndex) === request) {
          detailTrendInFlightRef.current.delete(authIndex);
        }
        if (shouldShowLoading && !detailTrend) {
          setDetailTrendLoading(false);
        }
      }
    },
    [detailFile, detailTrend, t],
  );

  const applyIdentityFingerprintDetail = useCallback(
    (detail: IdentityFingerprintAccountDetail) => {
      setIdentityFingerprintDetail(detail);
      const accountKey = detail.summary.account_key;
      const provider = detail.summary.provider;
      if (!accountKey) return;
      const applySummary = (file: AuthFileItem): AuthFileItem => {
        const summary = file.identity_fingerprint_summary;
        if (summary?.provider !== provider || summary.account_key !== accountKey) return file;
        return { ...file, identity_fingerprint_summary: detail.summary };
      };
      setFiles?.((prev) => prev.map(applySummary));
      setDetailFile((prev) => (prev ? applySummary(prev) : prev));
    },
    [setFiles],
  );

  const loadIdentityFingerprintForDetail = useCallback(
    async (file: AuthFileItem) => {
      if (!identityFingerprintEnabled) {
        identityFingerprintDetailKeyRef.current = "";
        setIdentityFingerprintDetail(null);
        setIdentityFingerprintLoading(false);
        setIdentityFingerprintError(null);
        return;
      }
      const summary = file.identity_fingerprint_summary;
      const key = identityFingerprintDetailKey(file);
      if (!summary?.account_key || !key) {
        identityFingerprintDetailKeyRef.current = "";
        setIdentityFingerprintDetail(null);
        setIdentityFingerprintLoading(false);
        setIdentityFingerprintError(null);
        return;
      }
      if (
        identityFingerprintDetailKeyRef.current === key &&
        identityFingerprintLoading &&
        !identityFingerprintError
      ) {
        return;
      }
      if (
        identityFingerprintDetailKeyRef.current === key &&
        identityFingerprintDetail &&
        !identityFingerprintError
      ) {
        return;
      }

      identityFingerprintDetailKeyRef.current = key;
      setIdentityFingerprintLoading(true);
      setIdentityFingerprintError(null);
      try {
        const detail = await identityFingerprintApi.getAccountDetail({
          provider: summary.provider,
          account_key: summary.account_key,
          auth_subject_id: summary.auth_subject_id,
        });
        if (identityFingerprintDetailKeyRef.current !== key) return;
        applyIdentityFingerprintDetail(detail);
      } catch (err: unknown) {
        if (identityFingerprintDetailKeyRef.current !== key) return;
        setIdentityFingerprintDetail(null);
        setIdentityFingerprintError(
          err instanceof Error ? err.message : t("auth_files.identity_fingerprint_loading_failed"),
        );
      } finally {
        if (identityFingerprintDetailKeyRef.current === key) {
          setIdentityFingerprintLoading(false);
        }
      }
    },
    [
      applyIdentityFingerprintDetail,
      identityFingerprintDetail,
      identityFingerprintEnabled,
      identityFingerprintError,
      identityFingerprintLoading,
      t,
    ],
  );

  const confirmIdentityFingerprintSharedImpact = useCallback(
    (detail: IdentityFingerprintAccountDetail): boolean => {
      if (detail.subject_scope !== "shared") return true;
      return window.confirm(t("auth_files.identity_shared_policy_confirm"));
    },
    [t],
  );

  const identityFingerprintMutationError = useCallback(
    (err: unknown, fallbackKey: string): string => {
      const raw = err instanceof Error ? err.message : "";
      if (/conflict|revision|409/i.test(raw)) {
        return t("auth_files.identity_policy_revision_conflict");
      }
      return raw || t(fallbackKey);
    },
    [t],
  );

  const selectIdentityFingerprintProfile = useCallback(
    async (profileKey: string) => {
      const detail = identityFingerprintDetail;
      const accountKey = detail?.summary.account_key;
      if (
        !detail ||
        detail.summary.provider !== "codex" ||
        !accountKey ||
        !profileKey
      )
        return;
      if (!confirmIdentityFingerprintSharedImpact(detail)) return;
      setIdentityFingerprintSaving(true);
      setIdentityFingerprintError(null);
      try {
        const next = await identityFingerprintApi.updateAccountPolicy({
          provider: "codex",
          account_key: accountKey,
          strategy: "active_profile",
          active_profile_key: profileKey,
          revision: detail.policy?.revision ?? 0,
        });
        applyIdentityFingerprintDetail(next);
        notify({
          type: "success",
          message: t("auth_files.identity_profile_saved"),
        });
      } catch (err: unknown) {
        const message = identityFingerprintMutationError(
          err,
          "auth_files.identity_profile_save_failed",
        );
        setIdentityFingerprintError(message);
        notify({ type: "error", message });
      } finally {
        setIdentityFingerprintSaving(false);
      }
    },
    [
      applyIdentityFingerprintDetail,
      confirmIdentityFingerprintSharedImpact,
      identityFingerprintDetail,
      identityFingerprintMutationError,
      notify,
      t,
    ],
  );

  const useIdentityFingerprintCLIPreferred = useCallback(async () => {
    const detail = identityFingerprintDetail;
    const accountKey = detail?.summary.account_key;
    if (!detail || detail.summary.provider !== "codex" || !accountKey) return;
    if (!confirmIdentityFingerprintSharedImpact(detail)) return;
    setIdentityFingerprintSaving(true);
    setIdentityFingerprintError(null);
    try {
      const next = await identityFingerprintApi.updateAccountPolicy({
        provider: "codex",
        account_key: accountKey,
        strategy: "cli_preferred",
        revision: detail.policy?.revision ?? 0,
      });
      applyIdentityFingerprintDetail(next);
      notify({
        type: "success",
        message: t("auth_files.identity_profile_saved"),
      });
    } catch (err: unknown) {
      const message = identityFingerprintMutationError(
        err,
        "auth_files.identity_profile_save_failed",
      );
      setIdentityFingerprintError(message);
      notify({ type: "error", message });
    } finally {
      setIdentityFingerprintSaving(false);
    }
  }, [
    applyIdentityFingerprintDetail,
    confirmIdentityFingerprintSharedImpact,
    identityFingerprintDetail,
    identityFingerprintMutationError,
    notify,
    t,
  ]);

  const deleteIdentityFingerprintProfile = useCallback(
    async (profileKey: string) => {
      const detail = identityFingerprintDetail;
      const accountKey = detail?.summary.account_key;
      if (
        !detail ||
        detail.summary.provider !== "codex" ||
        !accountKey ||
        !profileKey
      )
        return;
      if (!confirmIdentityFingerprintSharedImpact(detail)) return;
      setIdentityFingerprintSaving(true);
      setIdentityFingerprintError(null);
      try {
        const response = await identityFingerprintApi.deleteAccountProfile(
          "codex",
          accountKey,
          profileKey,
        );
        applyIdentityFingerprintDetail(response.detail);
        notify({
          type: "success",
          message: t("auth_files.identity_profile_deleted"),
        });
      } catch (err: unknown) {
        const message = identityFingerprintMutationError(
          err,
          "auth_files.identity_profile_delete_failed",
        );
        setIdentityFingerprintError(message);
        notify({ type: "error", message });
      } finally {
        setIdentityFingerprintSaving(false);
      }
    },
    [
      applyIdentityFingerprintDetail,
      confirmIdentityFingerprintSharedImpact,
      identityFingerprintDetail,
      identityFingerprintMutationError,
      notify,
      t,
    ],
  );

  const openDetail = useCallback(
    async (file: AuthFileItem) => {
      const hasTrend = supportsAuthFileTrend(file);
      const hasIdentity =
        identityFingerprintEnabled && Boolean(file.identity_fingerprint_summary?.account_key);
      setDetailOpen(true);
      setDetailTab(hasTrend ? "usage" : hasIdentity ? "identity" : "fields");
      setDetailTrendWindow("5h");
      setDetailFile(file);
      setDetailLoading(true);
      setDetailText("");
      setDetailTrend(null);
      setDetailTrendError(null);
      setIdentityFingerprintDetail(null);
      setIdentityFingerprintError(null);
      identityFingerprintDetailKeyRef.current = "";
      if (hasIdentity) {
        void loadIdentityFingerprintForDetail(file);
      }
      if (hasTrend) {
        void refreshDetailTrend(file);
      }
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
    [identityFingerprintEnabled, loadIdentityFingerprintForDetail, notify, refreshDetailTrend, t],
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

  const openCodexOAuthAdmissionEditor = useCallback((file: AuthFileItem) => {
    setCodexOAuthAdmissionEditor(buildCodexOAuthAdmissionEditorState(file));
  }, []);

  const openCodexImageGenerationBridgeEditor = useCallback((file: AuthFileItem) => {
    setCodexImageGenerationBridgeEditor(buildCodexImageGenerationBridgeEditorState(file));
  }, []);

  const openXAIEndpointEditor = useCallback((file: AuthFileItem) => {
    setXAIEndpointEditor(buildXAIEndpointEditorState(file));
  }, []);

  const saveChannelEditor = useCallback(async (): Promise<boolean> => {
    const fileName = channelEditor.fileName.trim();
    const label = channelEditor.label.trim();
    if (!fileName) return false;
    if (!label) {
      setChannelEditor((prev) => ({
        ...prev,
        error: t("auth_files.channel_name_required"),
      }));
      return false;
    }

    setChannelEditor((prev) => ({ ...prev, saving: true, error: null }));
    try {
      await authFilesApi.patchFields({ name: fileName, label });
      notify({ type: "success", message: t("auth_files.saved") });
      await loadAll();
      setChannelEditor((prev) => ({ ...prev, saving: false, error: null }));
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("auth_files.save_failed");
      setChannelEditor((prev) => ({ ...prev, saving: false, error: message }));
      notify({ type: "error", message });
      return false;
    }
  }, [channelEditor.fileName, channelEditor.label, loadAll, notify, t]);

  const codexOAuthAdmissionDirty = useMemo(() => {
    if (!detailFile || !codexOAuthAdmissionEditor.supported) return false;
    if (codexOAuthAdmissionEditor.fileName !== detailFile.name) return false;
    const baseline = buildCodexOAuthAdmissionEditorState(detailFile);
    if (!baseline.supported) return false;
    return (
      baseline.enabled !== codexOAuthAdmissionEditor.enabled ||
      codexAllowedClientSetKey(baseline.allowedClients) !==
        codexAllowedClientSetKey(codexOAuthAdmissionEditor.allowedClients)
    );
  }, [
    codexOAuthAdmissionEditor.allowedClients,
    codexOAuthAdmissionEditor.enabled,
    codexOAuthAdmissionEditor.fileName,
    codexOAuthAdmissionEditor.supported,
    detailFile,
  ]);

  const saveCodexOAuthAdmission = useCallback(async (): Promise<boolean> => {
    const fileName = codexOAuthAdmissionEditor.fileName.trim();
    if (!fileName || !codexOAuthAdmissionEditor.supported) return false;

    const nextEditor: CodexOAuthAdmissionEditorState = {
      ...codexOAuthAdmissionEditor,
      allowedClients: normalizeCodexAllowedClientIds(codexOAuthAdmissionEditor.allowedClients),
    };

    setCodexOAuthAdmissionEditor((prev) => ({
      ...prev,
      saving: true,
      error: null,
    }));
    try {
      await authFilesApi.patchFields({
        name: fileName,
        codex_cli_only: nextEditor.enabled,
        codex_cli_only_allowed_clients: nextEditor.allowedClients,
      });
      const applyPatch = (file: AuthFileItem): AuthFileItem =>
        mergeSavedCodexOAuthAdmissionFields(file, nextEditor);
      setFiles?.((prev) => prev.map(applyPatch));
      setDetailFile((prev) => (prev && prev.name === fileName ? applyPatch(prev) : prev));
      notify({ type: "success", message: t("auth_files.saved") });
      setCodexOAuthAdmissionEditor((prev) => ({
        ...prev,
        saving: false,
        error: null,
        allowedClients: nextEditor.allowedClients,
      }));
      void loadAll();
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("auth_files.save_failed");
      setCodexOAuthAdmissionEditor((prev) => ({
        ...prev,
        saving: false,
        error: message,
      }));
      notify({ type: "error", message });
      return false;
    }
  }, [codexOAuthAdmissionEditor, loadAll, notify, setFiles, t]);

  const codexImageGenerationBridgeDirty = useMemo(() => {
    if (!detailFile || !codexImageGenerationBridgeEditor.supported) return false;
    if (codexImageGenerationBridgeEditor.fileName !== detailFile.name) return false;
    const baseline = buildCodexImageGenerationBridgeEditorState(detailFile);
    if (!baseline.supported) return false;
    return baseline.enabled !== codexImageGenerationBridgeEditor.enabled;
  }, [
    codexImageGenerationBridgeEditor.enabled,
    codexImageGenerationBridgeEditor.fileName,
    codexImageGenerationBridgeEditor.supported,
    detailFile,
  ]);

  const saveCodexImageGenerationBridge = useCallback(async (): Promise<boolean> => {
    const fileName = codexImageGenerationBridgeEditor.fileName.trim();
    if (!fileName || !codexImageGenerationBridgeEditor.supported) return false;

    setCodexImageGenerationBridgeEditor((prev) => ({
      ...prev,
      saving: true,
      error: null,
    }));
    try {
      await authFilesApi.patchFields({
        name: fileName,
        codex_image_generation_bridge: codexImageGenerationBridgeEditor.enabled,
      });
      const applyPatch = (file: AuthFileItem): AuthFileItem =>
        mergeSavedCodexImageGenerationBridgeFields(file, codexImageGenerationBridgeEditor);
      setFiles?.((prev) => prev.map(applyPatch));
      setDetailFile((prev) => (prev && prev.name === fileName ? applyPatch(prev) : prev));
      notify({ type: "success", message: t("auth_files.saved") });
      setCodexImageGenerationBridgeEditor((prev) => ({
        ...prev,
        saving: false,
        error: null,
      }));
      void loadAll();
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("auth_files.save_failed");
      setCodexImageGenerationBridgeEditor((prev) => ({
        ...prev,
        saving: false,
        error: message,
      }));
      notify({ type: "error", message });
      return false;
    }
  }, [codexImageGenerationBridgeEditor, loadAll, notify, setFiles, t]);

  const xaiEndpointDirty = useMemo(() => {
    if (!detailFile || !xaiEndpointEditor.supported) return false;
    if (xaiEndpointEditor.fileName !== detailFile.name) return false;
    const baseline = buildXAIEndpointEditorState(detailFile);
    if (!baseline.supported) return false;
    return baseline.usingApi !== xaiEndpointEditor.usingApi;
  }, [
    detailFile,
    xaiEndpointEditor.fileName,
    xaiEndpointEditor.supported,
    xaiEndpointEditor.usingApi,
  ]);

  const saveXAIEndpoint = useCallback(async (): Promise<boolean> => {
    const fileName = xaiEndpointEditor.fileName.trim();
    if (!fileName || !xaiEndpointEditor.supported) return false;

    setXAIEndpointEditor((prev) => ({
      ...prev,
      saving: true,
      error: null,
    }));
    try {
      await authFilesApi.patchFields({
        name: fileName,
        using_api: xaiEndpointEditor.usingApi,
      });
      const applyPatch = (file: AuthFileItem): AuthFileItem =>
        mergeSavedXAIEndpointFields(file, xaiEndpointEditor);
      setFiles?.((prev) => prev.map(applyPatch));
      setDetailFile((prev) => (prev && prev.name === fileName ? applyPatch(prev) : prev));
      // Endpoint switch can change upstream model catalog for this provider.
      providerDiscoveryCacheRef.current.delete("xai");
      modelsCacheRef.current.delete(fileName);
      notify({ type: "success", message: t("auth_files.saved") });
      setXAIEndpointEditor((prev) => ({
        ...prev,
        saving: false,
        error: null,
      }));
      void loadAll();
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("auth_files.save_failed");
      setXAIEndpointEditor((prev) => ({
        ...prev,
        saving: false,
        error: message,
      }));
      notify({ type: "error", message });
      return false;
    }
  }, [loadAll, notify, setFiles, t, xaiEndpointEditor]);

  useEffect(() => {
    if (!detailOpen || !detailFile) return;
    if (detailTab === "models") {
      void loadModelsForDetail(detailFile);
      return;
    }
    if (detailTab === "usage") {
      if (supportsAuthFileTrend(detailFile) && !detailTrend && !detailTrendLoading) {
        void refreshDetailTrend(detailFile);
      }
      return;
    }
    if (detailTab === "identity") {
      void loadIdentityFingerprintForDetail(detailFile);
      return;
    }
    if (detailTab === "fields") {
      if (prefixProxyEditor.fileName !== detailFile.name) {
        void openPrefixProxyEditor(detailFile);
      }
      if (canRenameAuthFileChannel(detailFile) && channelEditor.fileName !== detailFile.name) {
        openChannelEditor(detailFile);
      }
      if (codexOAuthAdmissionEditor.fileName !== detailFile.name) {
        openCodexOAuthAdmissionEditor(detailFile);
      }
      if (codexImageGenerationBridgeEditor.fileName !== detailFile.name) {
        openCodexImageGenerationBridgeEditor(detailFile);
      }
      if (xaiEndpointEditor.fileName !== detailFile.name) {
        openXAIEndpointEditor(detailFile);
      }
      return;
    }
  }, [
    channelEditor.fileName,
    codexImageGenerationBridgeEditor.fileName,
    codexOAuthAdmissionEditor.fileName,
    detailFile,
    detailOpen,
    detailTab,
    detailTrend,
    detailTrendLoading,
    loadModelsForDetail,
    loadIdentityFingerprintForDetail,
    openChannelEditor,
    openCodexImageGenerationBridgeEditor,
    openCodexOAuthAdmissionEditor,
    openPrefixProxyEditor,
    openXAIEndpointEditor,
    prefixProxyEditor.fileName,
    refreshDetailTrend,
    xaiEndpointEditor.fileName,
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
      notify({
        type: "error",
        message: t("auth_files.subscription_started_at_invalid"),
      });
      return;
    }

    const payload = prefixProxyUpdatedText;
    const fileSize = new Blob([payload]).size;
    if (fileSize > MAX_AUTH_FILE_SIZE) {
      notify({
        type: "error",
        message: t("auth_files.save_too_large", {
          size: formatFileSize(fileSize),
        }),
      });
      return;
    }

    const name = prefixProxyEditor.fileName;
    setPrefixProxyEditor((prev) => ({ ...prev, saving: true }));
    try {
      const file = new File([payload], name, { type: "application/json" });
      await authFilesApi.upload(file);
      const parsedPayload = JSON.parse(payload) as Record<string, unknown>;
      applySavedAuthFilePatch(name, parsedPayload);
      notify({ type: "success", message: t("auth_files.saved") });
      setPrefixProxyEditor((prev) => ({
        ...prev,
        loading: false,
        saving: false,
        error: null,
        json:
          parsedPayload && typeof parsedPayload === "object" && !Array.isArray(parsedPayload)
            ? parsedPayload
            : prev.json,
      }));
      setDetailText((prev) => (name && detailFile?.name === name ? payload : prev));
      setDetailOpen(false);
      setDetailTab("fields");
      void loadAll().finally(() => applySavedAuthFilePatch(name, parsedPayload));
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.save_failed"),
      });
      setPrefixProxyEditor((prev) => ({ ...prev, saving: false }));
    }
  }, [
    applySavedAuthFilePatch,
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
    detailTrendWindow,
    setDetailTrendWindow,
    detailTrend,
    detailTrendLoading,
    detailTrendError,
    identityFingerprintDetail,
    identityFingerprintLoading,
    identityFingerprintSaving,
    identityFingerprintError,
    loadIdentityFingerprintForDetail,
    selectIdentityFingerprintProfile,
    useIdentityFingerprintCLIPreferred,
    deleteIdentityFingerprintProfile,
    refreshDetailTrend,
    modelsLoading,
    modelsFileType,
    modelsList,
    modelsError,
    prefixProxyEditor,
    setPrefixProxyEditor,
    channelEditor,
    setChannelEditor,
    codexOAuthAdmissionEditor,
    setCodexOAuthAdmissionEditor,
    codexImageGenerationBridgeEditor,
    setCodexImageGenerationBridgeEditor,
    xaiEndpointEditor,
    setXAIEndpointEditor,
    loadModelsForDetail,
    openDetail,
    prefixProxyDirty,
    codexOAuthAdmissionDirty,
    codexImageGenerationBridgeDirty,
    xaiEndpointDirty,
    prefixProxyUpdatedText,
    savePrefixProxy,
    saveChannelEditor,
    saveCodexOAuthAdmission,
    saveCodexImageGenerationBridge,
    saveXAIEndpoint,
  };
}
