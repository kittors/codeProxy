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
import { authFilesApi, quotaApi, usageApi } from "@code-proxy/api-client";
import type { AuthFileItem } from "@code-proxy/api-client";
import { useInterval, useLocalStorage } from "@code-proxy/ui";
import {
  fetchQuota,
  resolveQuotaProvider,
  type QuotaProvider,
} from "@features/quota-preview/quota-fetch";
import {
  filterAntigravityQuotaItems,
  type QuotaItem,
  type QuotaState,
} from "@features/quota-preview/quota-helpers";
import {
  AUTH_FILES_FILES_VIEW_MODE_KEY,
  AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
  AUTH_FILES_QUOTA_PREVIEW_KEY,
  normalizeAuthIndexValue,
  normalizeQuotaAutoRefreshMs,
  parseAdditionalQuotaWindowLabel,
  readAuthFilesDataCache,
  writeAuthFilesDataCache,
  type FilesViewMode,
  type QuotaPreviewMode,
} from "@code-proxy/domain";

interface UseAuthFilesQuotaStateOptions {
  tab: "files" | "excluded" | "alias";
  pageItems: AuthFileItem[];
  visibleScopeKey: string;
  loading: boolean;
  setFiles: Dispatch<SetStateAction<AuthFileItem[]>>;
  setDetailFile: Dispatch<SetStateAction<AuthFileItem | null>>;
  refreshUsageDataForFiles?: (files: AuthFileItem[]) => Promise<unknown>;
}

export function useAuthFilesQuotaState({
  tab,
  pageItems,
  visibleScopeKey,
  loading,
  setFiles,
  setDetailFile,
  refreshUsageDataForFiles,
}: UseAuthFilesQuotaStateOptions) {
  const { t } = useTranslation();
  const initialDataCache = useMemo(() => readAuthFilesDataCache(), []);

  const [connectivityState, setConnectivityState] = useState<
    Map<string, { loading: boolean; latencyMs: number | null; error: boolean }>
  >(new Map());
  const [quotaByFileName, setQuotaByFileName] = useState<Record<string, QuotaState>>(
    () => initialDataCache?.quotaByFileName ?? {},
  );
  const quotaInFlightRef = useRef<Set<string>>(new Set());
  const quotaAutoRefreshingRef = useRef<Set<string>>(new Set());
  const quotaByFileNameRef = useRef<Record<string, QuotaState>>(quotaByFileName);
  const quotaWarmupAttemptRef = useRef<Map<string, number>>(new Map());
  const visibleScopeKeyRef = useRef<string | null>(null);
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
    "cards",
  );
  const quotaAutoRefreshMs = useMemo(
    () => normalizeQuotaAutoRefreshMs(quotaAutoRefreshMsRaw),
    [quotaAutoRefreshMsRaw],
  );

  useInterval(
    () => {
      setNowMs(Date.now());
    },
    tab === "files" && quotaAutoRefreshMs > 0 ? Math.min(10_000, quotaAutoRefreshMs) : null,
  );

  useEffect(() => {
    quotaByFileNameRef.current = quotaByFileName;
  }, [quotaByFileName]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const timer = window.setTimeout(() => {
      const current = readAuthFilesDataCache();
      if (!current?.files?.length) return;
      writeAuthFilesDataCache({
        ...current,
        savedAtMs: Date.now(),
        quotaByFileName,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [quotaByFileName]);

  const patchAuthFileByName = useCallback(
    (name: string, patch: Partial<AuthFileItem>) => {
      setFiles((prev) => prev.map((item) => (item.name === name ? { ...item, ...patch } : item)));
      setDetailFile((prev) => (prev?.name === name ? { ...prev, ...patch } : prev));
    },
    [setDetailFile, setFiles],
  );

  const refreshUsageDataAfterQuota = useCallback(
    async (targetFiles: AuthFileItem[]) => {
      if (!refreshUsageDataForFiles || targetFiles.length === 0) return;
      await refreshUsageDataForFiles(targetFiles).catch(() => undefined);
    },
    [refreshUsageDataForFiles],
  );

  const resolveQuotaCardSlots = useCallback(
    (provider: QuotaProvider, items: QuotaItem[]) => {
      const translateQuotaLabel = (text: string) => {
        if (!text) return text;
        if (text.startsWith("m_quota.")) return t(text);
        const additionalQuota = parseAdditionalQuotaWindowLabel(text);
        if (additionalQuota) {
          return t(`m_quota.additional_${additionalQuota.window}`, {
            name: additionalQuota.name,
          });
        }
        if (text.startsWith("claude_quota.")) return t(text);
        return text;
      };

      if (provider === "claude") {
        return items.map((item) => ({
          id: item.key ?? item.label,
          label: translateQuotaLabel(item.label),
          item,
        }));
      }

      if (provider === "antigravity") {
        return filterAntigravityQuotaItems(items).map((item, index) => ({
          id: item.key ?? item.label ?? `antigravity-${index + 1}`,
          label: translateQuotaLabel(item.label),
          item,
        }));
      }

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

      const candidates = items
        .filter((item) => !parseAdditionalQuotaWindowLabel(String(item.label ?? "")))
        .map((item) => ({
          item,
          key: normalize(`${String(item.key ?? "")} ${String(item.label ?? "")}`),
        }));

      const findExact = (label: string) => items.find((item) => item.label === label) ?? null;
      const findKey = (...keys: string[]) =>
        items.find((item) => {
          const normalizedKey = normalize(String(item.key ?? ""));
          return keys.some((key) => normalizedKey === normalize(key));
        }) ?? null;
      const find = (re: RegExp) =>
        candidates.find((candidate) => re.test(candidate.key))?.item ?? null;

      const codeFiveHour =
        findKey("code_5h", "code5h") ??
        findExact("m_quota.code_5h") ??
        find(/(mquotacode5h|code5h|5h|5小时|fivehour|5hour)/i);
      const codeWeek =
        findKey("code_week", "code_weekly", "codeweekly") ??
        findExact("m_quota.code_weekly") ??
        find(/(mquotacodeweekly|codeweekly|weekly|week|周)/i);
      const reviewFiveHour =
        findKey("review_5h", "review5h") ??
        findExact("m_quota.review_5h") ??
        find(/(mquotareview5h|review5h|review5hour|reviewfivehour|审查5小时|审查：5小时)/i);
      const reviewWeek =
        findKey("review_week", "review_weekly", "reviewweekly") ??
        findExact("m_quota.review_weekly") ??
        find(/(mquotareviewweekly|reviewweekly|reviewweek|review_week|审查周|审查：周)/i);

      const knownItems = new Set<QuotaItem>();
      [codeFiveHour, codeWeek, reviewFiveHour, reviewWeek].forEach((item) => {
        if (item) knownItems.add(item);
      });

      const codingSlots: { id: string; label: string; item: QuotaItem | null }[] = [];
      if (codeFiveHour) {
        codingSlots.push({
          id: "code_5h",
          label: translateQuotaLabel("m_quota.code_5h"),
          item: codeFiveHour,
        });
      }
      if (codeWeek) {
        codingSlots.push({
          id: "code_week",
          label: translateQuotaLabel("m_quota.code_weekly"),
          item: codeWeek,
        });
      }
      if (provider === "kimi") return codingSlots;

      const codexSlots = [...codingSlots];
      if (reviewFiveHour) {
        codexSlots.push({
          id: "review_5h",
          label: translateQuotaLabel("m_quota.review_5h"),
          item: reviewFiveHour,
        });
      }
      if (reviewWeek) {
        codexSlots.push({
          id: "review_week",
          label: translateQuotaLabel("m_quota.review_weekly"),
          item: reviewWeek,
        });
      }

      const extraSlots = items
        .filter((item) => !knownItems.has(item))
        .map((item, index) => {
          const idKey = item.key ?? (normalize(String(item.label ?? "")) || `quota${index + 1}`);
          return {
            id: idKey,
            label: translateQuotaLabel(item.label),
            item,
          };
        });

      if (codexSlots.length === 0 && extraSlots.length > 0) return extraSlots;
      return [...codexSlots, ...extraSlots];
    },
    [t],
  );

  const refreshQuota = useCallback(
    async (
      file: AuthFileItem,
      provider: QuotaProvider,
      options?: { showLoading?: boolean; refreshUsage?: boolean },
    ) => {
      const name = file.name;
      if (quotaInFlightRef.current.has(name)) return;
      quotaInFlightRef.current.add(name);

      if (options?.showLoading !== false) {
        setQuotaByFileName((prev) => ({
          ...prev,
          [name]: {
            status: "loading",
            items: prev[name]?.items ?? [],
            planType: prev[name]?.planType,
            error: prev[name]?.error,
            updatedAt: prev[name]?.updatedAt,
          },
        }));
      }

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
              .map((slot) => [slot.item?.key ?? slot.id, slot.item?.percent ?? null] as const)
              .filter(([, value]) => value === null || Number.isFinite(value)),
          );
          const quotaPoints = slots.flatMap((slot) => {
            const item = slot.item;
            if (!item) return [];
            const quotaKey = item.key ?? slot.id;
            if (!quotaKey) return [];
            return [
              {
                quota_key: quotaKey,
                quota_label: item.label,
                percent: item.percent,
                reset_at:
                  typeof item.resetAtMs === "number" && Number.isFinite(item.resetAtMs)
                    ? new Date(item.resetAtMs).toISOString()
                    : undefined,
                window_seconds: item.windowSeconds,
              },
            ];
          });
          if (Object.keys(quotaValueByKey).length > 0) {
            await usageApi
              .recordAuthFileQuotaSnapshot({
                auth_index: authIndex,
                provider,
                quotas: quotaValueByKey,
                quota_points: quotaPoints,
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
          [name]: {
            status: "success",
            items,
            planType: nextPlanType ?? prev[name]?.planType,
            updatedAt: Date.now(),
          },
        }));
        if (options?.refreshUsage !== false) {
          await refreshUsageDataAfterQuota([file]);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("auth_files.unknown_error");
        setQuotaByFileName((prev) => ({
          ...prev,
          [name]: {
            status: "error",
            items: prev[name]?.items ?? [],
            planType: prev[name]?.planType,
            error: message,
            updatedAt: Date.now(),
          },
        }));
      } finally {
        quotaInFlightRef.current.delete(name);
      }
    },
    [patchAuthFileByName, refreshUsageDataAfterQuota, resolveQuotaCardSlots, t],
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

  const resolveQuotaTargets = useCallback((targetFiles: AuthFileItem[]) => {
    return targetFiles
      .map((file) => {
        const provider = resolveQuotaProvider(file);
        return provider ? { file, provider } : null;
      })
      .filter(Boolean) as { file: AuthFileItem; provider: QuotaProvider }[];
  }, []);

  const markQuotaTargetsLoading = useCallback(
    (targets: { file: AuthFileItem; provider: QuotaProvider }[]) => {
      if (!targets.length) return;
      setQuotaByFileName((prev) => {
        const next = { ...prev };
        for (const target of targets) {
          next[target.file.name] = {
            status: "loading",
            items: prev[target.file.name]?.items ?? [],
            planType: prev[target.file.name]?.planType,
            error: prev[target.file.name]?.error,
            updatedAt: prev[target.file.name]?.updatedAt,
          };
        }
        return next;
      });
    },
    [],
  );

  const collectQuotaFetchTargets = useCallback(
    (targetFiles: AuthFileItem[]) => {
      const staleMs = Math.max(15_000, quotaAutoRefreshMs || 30_000);
      const now = Date.now();

      return resolveQuotaTargets(targetFiles).filter((candidate) => {
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
    [quotaAutoRefreshMs, resolveQuotaTargets],
  );

  const runQuotaRefreshBatch = useCallback(
    async (
      targets: { file: AuthFileItem; provider: QuotaProvider }[],
      options?: { markAsAutoRefreshing?: boolean; showLoading?: boolean; refreshUsage?: boolean },
    ) => {
      if (!targets.length) return;

      const markAsAutoRefreshing = Boolean(options?.markAsAutoRefreshing);

      for (let index = 0; index < targets.length; index += 2) {
        const batch = targets.slice(index, index + 2);
        await Promise.allSettled(
          batch.map(async (current) => {
            quotaWarmupAttemptRef.current.set(current.file.name, Date.now());
            if (markAsAutoRefreshing) {
              quotaAutoRefreshingRef.current.add(current.file.name);
            }
            try {
              await refreshQuota(current.file, current.provider, {
                showLoading: options?.showLoading,
                refreshUsage: false,
              });
            } finally {
              if (markAsAutoRefreshing) {
                quotaAutoRefreshingRef.current.delete(current.file.name);
              }
            }
          }),
        );
      }

      if (options?.refreshUsage !== false) {
        await refreshUsageDataAfterQuota(targets.map((target) => target.file));
      }
    },
    [refreshQuota, refreshUsageDataAfterQuota],
  );

  useEffect(() => {
    if (tab !== "files") return;
    if (loading) return;

    const previousVisibleScopeKey = visibleScopeKeyRef.current;
    visibleScopeKeyRef.current = visibleScopeKey;

    const firstVisibleScope = previousVisibleScopeKey === null;
    const initialVisibleScope = firstVisibleScope;
    const switchedVisibleScope = !firstVisibleScope && previousVisibleScopeKey !== visibleScopeKey;
    if (!initialVisibleScope && !switchedVisibleScope && quotaAutoRefreshMs <= 0) return;

    const toFetch =
      initialVisibleScope || switchedVisibleScope
        ? resolveQuotaTargets(pageItems)
        : collectQuotaFetchTargets(pageItems);
    if (!toFetch.length) return;

    if (initialVisibleScope || switchedVisibleScope) {
      markQuotaTargetsLoading(toFetch);
    }

    let cancelled = false;
    void (async () => {
      if (!cancelled) {
        await runQuotaRefreshBatch(toFetch, {
          markAsAutoRefreshing: true,
          showLoading: initialVisibleScope || switchedVisibleScope,
          refreshUsage: false,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    collectQuotaFetchTargets,
    loading,
    markQuotaTargetsLoading,
    pageItems,
    quotaAutoRefreshMs,
    resolveQuotaTargets,
    runQuotaRefreshBatch,
    tab,
    visibleScopeKey,
  ]);

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

    await runQuotaRefreshBatch(candidates, {
      markAsAutoRefreshing: true,
      showLoading: false,
    });
  }, [collectQuotaFetchTargets, loading, pageItems, runQuotaRefreshBatch, tab]);

  const forceRefreshPage = useCallback(async () => {
    if (tab !== "files") return;
    if (loading) return;

    const targets = resolveQuotaTargets(pageItems);
    if (!targets.length) return;

    markQuotaTargetsLoading(targets);

    await runQuotaRefreshBatch(targets, { markAsAutoRefreshing: true });
  }, [loading, markQuotaTargetsLoading, pageItems, resolveQuotaTargets, runQuotaRefreshBatch, tab]);

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
    forceRefreshPage,
    runQuotaRefreshBatch,
    quotaLastUpdatedText,
  };
}
