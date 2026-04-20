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
import { authFilesApi, quotaApi, usageApi } from "@/lib/http/apis";
import type { AuthFileItem } from "@/lib/http/types";
import { useInterval } from "@/hooks/useInterval";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { fetchQuota, resolveQuotaProvider, type QuotaProvider } from "@/modules/quota/quota-fetch";
import { type QuotaItem, type QuotaState } from "@/modules/quota/quota-helpers";
import {
  AUTH_FILES_FILES_VIEW_MODE_KEY,
  AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
  AUTH_FILES_QUOTA_PREVIEW_KEY,
  normalizeAuthIndexValue,
  normalizeQuotaAutoRefreshMs,
  type FilesViewMode,
  type QuotaPreviewMode,
} from "@/modules/auth-files/helpers/authFilesPageUtils";

interface UseAuthFilesQuotaStateOptions {
  tab: "files" | "excluded" | "alias";
  pageItems: AuthFileItem[];
  loading: boolean;
  setFiles: Dispatch<SetStateAction<AuthFileItem[]>>;
  setDetailFile: Dispatch<SetStateAction<AuthFileItem | null>>;
}

export function useAuthFilesQuotaState({
  tab,
  pageItems,
  loading,
  setFiles,
  setDetailFile,
}: UseAuthFilesQuotaStateOptions) {
  const { t } = useTranslation();

  const [connectivityState, setConnectivityState] = useState<
    Map<string, { loading: boolean; latencyMs: number | null; error: boolean }>
  >(new Map());
  const [quotaByFileName, setQuotaByFileName] = useState<Record<string, QuotaState>>({});
  const quotaInFlightRef = useRef<Set<string>>(new Set());
  const quotaAutoRefreshingRef = useRef<Set<string>>(new Set());
  const quotaByFileNameRef = useRef<Record<string, QuotaState>>(quotaByFileName);
  const quotaWarmupAttemptRef = useRef<Map<string, number>>(new Map());
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [quotaPreviewMode, setQuotaPreviewMode] = useLocalStorage<QuotaPreviewMode>(
    AUTH_FILES_QUOTA_PREVIEW_KEY,
    "5h",
  );
  const [quotaAutoRefreshMsRaw, setQuotaAutoRefreshMsRaw] = useLocalStorage<number>(
    AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
    10000,
  );
  const [filesViewMode, setFilesViewMode] = useLocalStorage<FilesViewMode>(
    AUTH_FILES_FILES_VIEW_MODE_KEY,
    "table",
  );
  const quotaAutoRefreshMs = useMemo(
    () => normalizeQuotaAutoRefreshMs(quotaAutoRefreshMsRaw),
    [quotaAutoRefreshMsRaw],
  );

  useInterval(
    () => {
      setNowMs(Date.now());
    },
    tab === "files" ? Math.min(10_000, quotaAutoRefreshMs || 10_000) : null,
  );

  useEffect(() => {
    quotaByFileNameRef.current = quotaByFileName;
  }, [quotaByFileName]);

  const patchAuthFileByName = useCallback(
    (name: string, patch: Partial<AuthFileItem>) => {
      setFiles((prev) => prev.map((item) => (item.name === name ? { ...item, ...patch } : item)));
      setDetailFile((prev) => (prev?.name === name ? { ...prev, ...patch } : prev));
    },
    [setDetailFile, setFiles],
  );

  const resolveQuotaCardSlots = useCallback(
    (provider: QuotaProvider, items: QuotaItem[]) => {
      const translateQuotaLabel = (text: string) => {
        if (!text) return text;
        if (text.startsWith("m_quota.")) return t(text);
        return text;
      };

      const supportsStableCodingSlots = provider === "codex" || provider === "kimi";
      if (!supportsStableCodingSlots) {
        return items.slice(0, 3).map((item) => ({
          id: item.label,
          label: translateQuotaLabel(item.label),
          item,
        }));
      }

      const normalize = (value: string) =>
        value
          .trim()
          .toLowerCase()
          .replaceAll(/[^a-z0-9\u4e00-\u9fff]/g, "");

      const candidates = items.map((item) => ({
        item,
        key: normalize(String(item.label ?? "")),
      }));

      const findExact = (label: string) => items.find((item) => item.label === label) ?? null;
      const find = (re: RegExp) =>
        candidates.find((candidate) => re.test(candidate.key))?.item ?? null;

      const codeFiveHour =
        findExact("m_quota.code_5h") ?? find(/(mquotacode5h|code5h|5h|5小时|fivehour|5hour)/i);
      const codeWeek =
        findExact("m_quota.code_weekly") ?? find(/(mquotacodeweekly|codeweekly|weekly|week|周)/i);
      const reviewWeek =
        findExact("m_quota.review_weekly") ??
        find(/(mquotareviewweekly|reviewweekly|reviewweek|review_week|审查周|审查：周)/i);

      const codingSlots = [
        {
          id: "code_5h" as const,
          label: translateQuotaLabel("m_quota.code_5h"),
          item: codeFiveHour,
        },
        {
          id: "code_week" as const,
          label: translateQuotaLabel("m_quota.code_weekly"),
          item: codeWeek,
        },
      ];
      if (provider === "kimi") return codingSlots;

      return [
        ...codingSlots,
        {
          id: "review_week" as const,
          label: translateQuotaLabel("m_quota.review_weekly"),
          item: reviewWeek,
        },
      ];
    },
    [t],
  );

  const refreshQuota = useCallback(
    async (file: AuthFileItem, provider: QuotaProvider) => {
      const name = file.name;
      if (quotaInFlightRef.current.has(name)) return;
      quotaInFlightRef.current.add(name);

      setQuotaByFileName((prev) => ({
        ...prev,
        [name]: {
          status: "loading",
          items: prev[name]?.items ?? [],
          error: prev[name]?.error,
          updatedAt: prev[name]?.updatedAt,
        },
      }));

      try {
        const result = await fetchQuota(provider, file);
        const items = Array.isArray(result) ? result : result.items;
        const nextPlanType = Array.isArray(result) ? null : (result.planType ?? null);
        const rawAuthIndex = (file as { auth_index?: unknown }).auth_index ?? file.authIndex;
        const authIndex = normalizeAuthIndexValue(rawAuthIndex);
        if (authIndex) {
          void quotaApi.reconcile(authIndex).catch(() => {});
          const slots = resolveQuotaCardSlots(provider, items);
          const quotaValueByKey = Object.fromEntries(
            slots
              .map((slot) => [slot.id, slot.item?.percent ?? null] as const)
              .filter(([, value]) => value === null || Number.isFinite(value)),
          );
          if (Object.keys(quotaValueByKey).length > 0) {
            await usageApi
              .recordAuthFileQuotaSnapshot({
                auth_index: authIndex,
                provider,
                quotas: quotaValueByKey,
              })
              .catch(() => {});
          }
        }
        if (nextPlanType) {
          patchAuthFileByName(name, {
            plan_type: nextPlanType,
            planType: nextPlanType,
          });
        }
        setQuotaByFileName((prev) => ({
          ...prev,
          [name]: { status: "success", items, updatedAt: Date.now() },
        }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("auth_files.unknown_error");
        setQuotaByFileName((prev) => ({
          ...prev,
          [name]: {
            status: "error",
            items: prev[name]?.items ?? [],
            error: message,
            updatedAt: Date.now(),
          },
        }));
      } finally {
        quotaInFlightRef.current.delete(name);
      }
    },
    [patchAuthFileByName, resolveQuotaCardSlots, t],
  );

  const checkAuthFileConnectivity = useCallback(
    async (fileName: string) => {
      const current = connectivityState.get(fileName);
      if (current?.loading) return;

      setConnectivityState((prev) => {
        const next = new Map(prev);
        next.set(fileName, { loading: true, latencyMs: null, error: false });
        return next;
      });

      const start = performance.now();
      try {
        await authFilesApi.getModelsForAuthFile(fileName);
        const elapsed = performance.now() - start;
        setConnectivityState((prev) => {
          const next = new Map(prev);
          next.set(fileName, { loading: false, latencyMs: elapsed, error: false });
          return next;
        });
      } catch {
        const elapsed = performance.now() - start;
        setConnectivityState((prev) => {
          const next = new Map(prev);
          if (elapsed < 20000) {
            next.set(fileName, { loading: false, latencyMs: elapsed, error: false });
          } else {
            next.set(fileName, { loading: false, latencyMs: null, error: true });
          }
          return next;
        });
      }
    },
    [connectivityState],
  );

  const collectQuotaFetchTargets = useCallback(
    (targetFiles: AuthFileItem[]) => {
      const staleMs = Math.max(15_000, quotaAutoRefreshMs || 30_000);
      const now = Date.now();

      return targetFiles
        .map((file) => {
          const provider = resolveQuotaProvider(file);
          return provider ? { file, provider } : null;
        })
        .filter(Boolean)
        .filter((candidate) => {
          const current = candidate as { file: AuthFileItem; provider: QuotaProvider };
          if (quotaInFlightRef.current.has(current.file.name)) return false;
          const state = quotaByFileNameRef.current[current.file.name];
          const items = Array.isArray(state?.items) ? state.items : [];
          const updatedAt = state?.updatedAt ?? 0;
          const isStale =
            typeof updatedAt === "number" && updatedAt > 0 ? now - updatedAt > staleMs : true;
          const needs = !state || state.status === "error" || items.length === 0 || isStale;
          if (!needs) return false;

          const lastAttempt = quotaWarmupAttemptRef.current.get(current.file.name) ?? 0;
          return now - lastAttempt >= 5_000;
        }) as { file: AuthFileItem; provider: QuotaProvider }[];
    },
    [quotaAutoRefreshMs],
  );

  const runQuotaRefreshBatch = useCallback(
    async (
      targets: { file: AuthFileItem; provider: QuotaProvider }[],
      options?: { markAsAutoRefreshing?: boolean },
    ) => {
      if (!targets.length) return;

      const markAsAutoRefreshing = Boolean(options?.markAsAutoRefreshing);
      const concurrency = 3;
      let index = 0;

      const workers = Array.from({ length: Math.min(concurrency, targets.length) }).map(
        async () => {
          for (;;) {
            const current = targets[index];
            index += 1;
            if (!current) return;
            quotaWarmupAttemptRef.current.set(current.file.name, Date.now());
            if (markAsAutoRefreshing) {
              quotaAutoRefreshingRef.current.add(current.file.name);
            }
            try {
              await refreshQuota(current.file, current.provider);
            } finally {
              if (markAsAutoRefreshing) {
                quotaAutoRefreshingRef.current.delete(current.file.name);
              }
            }
          }
        },
      );

      await Promise.allSettled(workers);
    },
    [refreshQuota],
  );

  useEffect(() => {
    if (tab !== "files") return;
    if (loading) return;

    const toFetch = collectQuotaFetchTargets(pageItems);
    if (!toFetch.length) return;

    let cancelled = false;
    void (async () => {
      if (!cancelled) {
        await runQuotaRefreshBatch(toFetch);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [collectQuotaFetchTargets, loading, pageItems, runQuotaRefreshBatch, tab]);

  const quotaLastUpdatedAtMs = useMemo(() => {
    let latest = 0;
    pageItems.forEach((file) => {
      const updatedAt = quotaByFileName[file.name]?.updatedAt;
      if (typeof updatedAt === "number" && Number.isFinite(updatedAt)) {
        latest = Math.max(latest, updatedAt);
      }
    });
    return latest || null;
  }, [pageItems, quotaByFileName]);

  const quotaLastUpdatedText = useMemo(() => {
    if (!quotaLastUpdatedAtMs) return "--";
    const date = new Date(quotaLastUpdatedAtMs);
    return Number.isNaN(date.getTime()) ? "--" : date.toLocaleTimeString();
  }, [quotaLastUpdatedAtMs]);

  const refreshCurrentPageQuota = useCallback(async () => {
    if (tab !== "files") return;
    if (loading) return;
    if (quotaInFlightRef.current.size > 0) return;

    const candidates = collectQuotaFetchTargets(pageItems);
    if (!candidates.length) return;

    await runQuotaRefreshBatch(candidates, { markAsAutoRefreshing: true });
  }, [collectQuotaFetchTargets, loading, pageItems, runQuotaRefreshBatch, tab]);

  useInterval(
    () => {
      void refreshCurrentPageQuota();
    },
    tab === "files" && quotaAutoRefreshMs > 0 ? quotaAutoRefreshMs : null,
  );

  return {
    connectivityState,
    quotaByFileName,
    quotaAutoRefreshingRef,
    nowMs,
    quotaPreviewMode,
    setQuotaPreviewMode,
    quotaAutoRefreshMs,
    setQuotaAutoRefreshMsRaw,
    filesViewMode,
    setFilesViewMode,
    resolveQuotaCardSlots,
    refreshQuota,
    checkAuthFileConnectivity,
    collectQuotaFetchTargets,
    runQuotaRefreshBatch,
    quotaLastUpdatedText,
  };
}
