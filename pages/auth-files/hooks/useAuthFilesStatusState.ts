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
import {
  aiAccountsStatusApi,
  authFilesApi,
  extractApiErrorCode,
  isApiClientError,
  type AiAccountLatestStatusDto,
  type AiAccountStatusRefreshJobDto,
  type AuthFileItem,
  type EntityStatsResponse,
} from "@code-proxy/api-client";
import {
  AUTH_FILES_FILES_VIEW_MODE_KEY,
  AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
  AUTH_FILES_QUOTA_PREVIEW_KEY,
  getActiveCacheTenantId,
  normalizeAuthIndexValue,
  parseAdditionalQuotaWindowLabel,
  readAndMigrateQuotaAutoRefreshMs,
  readAuthFilesDataCache,
  writeAuthFilesDataCache,
  type AuthFileCycleBudgetStats,
  type FilesViewMode,
  type QuotaPreviewMode,
} from "@code-proxy/domain";
import { useInterval, useLocalStorage, useToast } from "@code-proxy/ui";
import {
  filterAntigravityQuotaItems,
  type QuotaItem,
  type QuotaState,
} from "@features/quota-preview/quota-helpers";
import {
  resolveQuotaProvider,
  type QuotaProvider,
} from "@features/quota-preview/quota-fetch";
import {
  applyAccountStatuses,
  isAccountStatusFresher,
  readAccountStatusFreshness,
  type AccountStatusFreshness,
} from "./mapAccountStatusToUi";
import type { AuthFileCycleUsageSnapshot } from "./useAuthFilesCycleUsageState";

const STATUS_POLL_INTERVAL_MS = 1_500;
const STATUS_REFRESH_TIMEOUT_MS = 120_000;

export function isFatalQuotaRefreshError(error: unknown): boolean {
  if (!isApiClientError(error)) return false;
  if (error.status === 401 || error.status === 403) return true;
  if (error.isAuthError) return true;
  const code = extractApiErrorCode(error.payload);
  return (
    code === "permission_denied" ||
    code === "tenant_resource_scope_unavailable" ||
    code === "session_expired" ||
    code === "session_revoked" ||
    code === "invalid_credentials"
  );
}

/**
 * Only status GET / start POST 404|405|501 mark API unsupported — not job poll 404.
 * Transient network/proxy blips can also surface as those codes; force refresh re-probes.
 */
export function isStatusApiUnsupportedError(error: unknown): boolean {
  if (!isApiClientError(error)) return false;
  return error.status === 404 || error.status === 405 || error.status === 501;
}

const resolveFileAuthIndex = (file: AuthFileItem): string | null =>
  normalizeAuthIndexValue(file.auth_index ?? file.authIndex);

const resolveFileSubjectId = (file: AuthFileItem): string | null =>
  normalizeAuthIndexValue(
    file.auth_subject_id ??
      file.authSubjectId ??
      file.identity_fingerprint_summary?.auth_subject_id,
  );

const findFilesForStatusKeys = (
  files: AuthFileItem[],
  authIndex: string | null,
  authSubjectId: string | null,
): AuthFileItem[] => {
  const subject = normalizeAuthIndexValue(authSubjectId);
  const index = normalizeAuthIndexValue(authIndex);
  if (!subject && !index) return [];
  return files.filter((file) => {
    const fileSubject = resolveFileSubjectId(file);
    const fileIndex = resolveFileAuthIndex(file);
    if (subject && fileSubject && fileSubject === subject) return true;
    if (index && fileIndex && fileIndex === index) return true;
    if (subject && fileIndex && fileIndex === subject) return true;
    if (index && fileSubject && fileSubject === index) return true;
    return false;
  });
};

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

const buildVisibleScopeKey = (files: AuthFileItem[]): string =>
  files
    .map((file) => resolveFileAuthIndex(file) ?? `name:${file.name}`)
    .sort()
    .join("|");

interface UseAuthFilesStatusStateOptions {
  tab: "files" | "excluded" | "alias";
  pageItems: AuthFileItem[];
  loading: boolean;
  setFiles: Dispatch<SetStateAction<AuthFileItem[]>>;
  setDetailFile: Dispatch<SetStateAction<AuthFileItem | null>>;
  setUsageDataFromStatus?: Dispatch<SetStateAction<EntityStatsResponse | null>>;
}

type ActiveBatch = {
  kind: "page" | "single";
  controller: AbortController;
  jobId: string | null;
  tenantId: string;
  files: AuthFileItem[];
};

export function useAuthFilesStatusState({
  tab,
  pageItems,
  loading,
  setFiles,
  setDetailFile,
  setUsageDataFromStatus,
}: UseAuthFilesStatusStateOptions) {
  const { t } = useTranslation();
  const { notify } = useToast();
  // Read every render so tenant switch (setActiveCacheTenantId) is observed without remount.
  const cacheTenantId = getActiveCacheTenantId();
  const initialDataCache = useMemo(
    () => readAuthFilesDataCache(cacheTenantId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-seed only
    [],
  );
  const initialAutoRefresh = useMemo(() => readAndMigrateQuotaAutoRefreshMs(), []);

  const [connectivityState, setConnectivityState] = useState<
    Map<string, { loading: boolean; latencyMs: number | null; error: boolean }>
  >(new Map());
  const [quotaByFileName, setQuotaByFileName] = useState<Record<string, QuotaState>>(
    () => initialDataCache?.quotaByFileName ?? {},
  );
  const [cycleByAuthIndex, setCycleByAuthIndex] = useState<
    Record<string, AuthFileCycleUsageSnapshot>
  >({});
  const [statusApiSupported, setStatusApiSupported] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [refreshingPage, setRefreshingPage] = useState(false);
  const [quotaRefreshHalted, setQuotaRefreshHalted] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const quotaInFlightRef = useRef<Set<string>>(new Set());
  const quotaAutoRefreshingRef = useRef<Set<string>>(new Set());
  const quotaRefreshHaltedRef = useRef(false);
  const pageBatchRef = useRef<ActiveBatch | null>(null);
  const singleBatchRef = useRef<ActiveBatch | null>(null);
  const statusLoadSeqRef = useRef(0);
  /**
   * Scope key that successfully finished a status GET (or intentional empty skip).
   * Must only be set AFTER success — never before the request starts — so an aborted
   * in-flight GET for the same scope can restart when pageItems identity changes.
   */
  const loadedVisibleScopeRef = useRef<string | null>(null);
  /** Per subject/auth_index last applied server freshness (monotonic merge). */
  const appliedFreshnessRef = useRef<Map<string, AccountStatusFreshness>>(new Map());
  const mountedRef = useRef(true);
  const tenantIdRef = useRef(cacheTenantId);
  const pageItemsRef = useRef(pageItems);

  const [quotaPreviewMode, setQuotaPreviewMode] = useLocalStorage<QuotaPreviewMode>(
    AUTH_FILES_QUOTA_PREVIEW_KEY,
    "5h",
  );
  const [quotaAutoRefreshMsRaw, setQuotaAutoRefreshMsRaw] = useLocalStorage<number>(
    AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
    initialAutoRefresh,
  );
  const [filesViewMode, setFilesViewMode] = useLocalStorage<FilesViewMode>(
    AUTH_FILES_FILES_VIEW_MODE_KEY,
    "cards",
  );

  // Always persist normalized bucket.
  const quotaAutoRefreshMs = useMemo(() => {
    const normalized = readAndMigrateQuotaAutoRefreshMs();
    if (normalized !== quotaAutoRefreshMsRaw) {
      // write-back if raw drifted (legacy values)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
          JSON.stringify(normalized),
        );
      }
    }
    return normalized;
  }, [quotaAutoRefreshMsRaw]);

  const effectiveQuotaAutoRefreshMs = quotaRefreshHalted ? 0 : quotaAutoRefreshMs;

  useEffect(() => {
    pageItemsRef.current = pageItems;
  }, [pageItems]);

  // Tenant switch: abort jobs, clear maps, bump seq so old responses cannot apply.
  useEffect(() => {
    if (tenantIdRef.current === cacheTenantId) return;
    tenantIdRef.current = cacheTenantId;
    pageBatchRef.current?.controller.abort();
    singleBatchRef.current?.controller.abort();
    pageBatchRef.current = null;
    singleBatchRef.current = null;
    statusLoadSeqRef.current += 1;
    loadedVisibleScopeRef.current = null;
    appliedFreshnessRef.current.clear();
    setQuotaByFileName({});
    setCycleByAuthIndex({});
    setRefreshingPage(false);
    setStatusLoading(false);
    setStatusApiSupported(true);
    quotaInFlightRef.current.clear();
    quotaAutoRefreshingRef.current.clear();
  }, [cacheTenantId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pageBatchRef.current?.controller.abort();
      singleBatchRef.current?.controller.abort();
      pageBatchRef.current = null;
      singleBatchRef.current = null;
      statusLoadSeqRef.current += 1;
    };
  }, []);

  const haltQuotaAutoRefresh = useCallback(() => {
    if (quotaRefreshHaltedRef.current) return;
    quotaRefreshHaltedRef.current = true;
    setQuotaRefreshHalted(true);
    setQuotaAutoRefreshMsRaw(0);
  }, [setQuotaAutoRefreshMsRaw]);

  useInterval(
    () => {
      setNowMs(Date.now());
    },
    tab === "files" && effectiveQuotaAutoRefreshMs > 0
      ? Math.min(10_000, effectiveQuotaAutoRefreshMs)
      : null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const timer = window.setTimeout(() => {
      const tenantId = getActiveCacheTenantId();
      const current = readAuthFilesDataCache(tenantId);
      if (!current || !Array.isArray(current.files)) return;
      writeAuthFilesDataCache({
        ...current,
        tenantId,
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

  const applyStatusesToUi = useCallback(
    (accounts: AiAccountLatestStatusDto[], filesForMerge: AuthFileItem[]) => {
      if (tenantIdRef.current !== getActiveCacheTenantId()) return;

      // Drop stale accounts before mapping: older version/time must not overwrite newer UI.
      const freshAccounts: AiAccountLatestStatusDto[] = [];
      for (const account of accounts) {
        const freshness = readAccountStatusFreshness(account);
        const keys = [
          normalizeAuthIndexValue(account.auth_subject_id),
          normalizeAuthIndexValue(account.auth_index),
        ].filter((key): key is string => Boolean(key));
        if (keys.length === 0) continue;
        const blocked = keys.some((key) => {
          const current = appliedFreshnessRef.current.get(key);
          return current != null && !isAccountStatusFresher(freshness, current);
        });
        if (blocked) continue;
        for (const key of keys) {
          appliedFreshnessRef.current.set(key, freshness);
        }
        freshAccounts.push(account);
      }
      if (freshAccounts.length === 0) return;

      const patch = applyAccountStatuses(freshAccounts);

      // Map each status item onto ALL files sharing auth_subject_id (fallback auth_index).
      // Also fan cycle/usage onto every real auth_index of those matched files.
      type MatchedGroup = {
        names: string[];
        authIndexes: string[];
        quotaKey: string | null;
        account: AiAccountLatestStatusDto;
      };
      const groups: MatchedGroup[] = [];
      for (const account of freshAccounts) {
        const matched = findFilesForStatusKeys(
          filesForMerge,
          account.auth_index,
          account.auth_subject_id ?? null,
        );
        if (!matched.length) continue;
        const authIndexes = Array.from(
          new Set(
            matched
              .map((file) => resolveFileAuthIndex(file))
              .filter((value): value is string => Boolean(value)),
          ),
        );
        const canonical = normalizeAuthIndexValue(account.auth_index);
        if (canonical && !authIndexes.includes(canonical)) {
          authIndexes.push(canonical);
        }
        const subject = normalizeAuthIndexValue(account.auth_subject_id);
        const quotaKey = subject ?? canonical;
        // Fan freshness bookkeeping onto every alias auth_index of the subject.
        const freshness = readAccountStatusFreshness(account);
        for (const authIndex of authIndexes) {
          const current = appliedFreshnessRef.current.get(authIndex);
          if (!current || isAccountStatusFresher(freshness, current)) {
            appliedFreshnessRef.current.set(authIndex, freshness);
          }
        }
        groups.push({
          names: matched.map((file) => file.name),
          authIndexes,
          quotaKey,
          account,
        });
      }

      setQuotaByFileName((prev) => {
        const next = { ...prev };
        for (const group of groups) {
          if (!group.quotaKey) continue;
          const quota = patch.quotaByKey[group.quotaKey] ?? patch.quotaByKey[group.authIndexes[0] ?? ""];
          if (!quota) continue;
          for (const name of group.names) {
            const existing = next[name];
            if (
              quota.status === "success" &&
              (!quota.items || quota.items.length === 0) &&
              existing?.status === "success" &&
              (existing.items?.length ?? 0) > 0 &&
              !quota.error
            ) {
              quotaInFlightRef.current.delete(name);
              quotaAutoRefreshingRef.current.delete(name);
              continue;
            }
            next[name] = quota;
            quotaInFlightRef.current.delete(name);
            quotaAutoRefreshingRef.current.delete(name);
          }
        }
        return next;
      });

      setCycleByAuthIndex((prev) => {
        let next = prev;
        let changed = false;
        for (const group of groups) {
          const sourceKey =
            group.quotaKey && patch.cycleByKey[group.quotaKey]
              ? group.quotaKey
              : group.authIndexes.find((key) => patch.cycleByKey[key]);
          if (!sourceKey) continue;
          const cycle = patch.cycleByKey[sourceKey];
          if (!cycle) continue;
          if (!changed) {
            next = { ...prev };
            changed = true;
          }
          for (const authIndex of group.authIndexes) {
            next[authIndex] = cycle;
          }
        }
        return next;
      });

      if (setUsageDataFromStatus) {
        const points: EntityStatsResponse["auth_index"] = [];
        const seen = new Set<string>();
        for (const group of groups) {
          const sourcePoint =
            patch.entityStats.auth_index.find((point) =>
              group.authIndexes.includes(point.entity_name),
            ) ??
            (group.quotaKey
              ? patch.entityStats.auth_index.find(
                  (point) => point.entity_name === group.quotaKey,
                )
              : undefined);
          if (!sourcePoint) continue;
          for (const authIndex of group.authIndexes) {
            if (seen.has(authIndex)) continue;
            seen.add(authIndex);
            points.push({
              ...sourcePoint,
              entity_name: authIndex,
            });
          }
        }
        if (points.length > 0) {
          setUsageDataFromStatus((prev) => {
            const prevAuth = Array.isArray(prev?.auth_index) ? prev.auth_index : [];
            const nextNames = new Set(points.map((point) => point.entity_name));
            return {
              source: Array.isArray(prev?.source) ? prev.source : [],
              auth_index: [
                ...prevAuth.filter((point) => !nextNames.has(point.entity_name)),
                ...points,
              ],
            };
          });
        }
      }

      for (const group of groups) {
        const planType =
          (group.quotaKey ? patch.planTypeByKey[group.quotaKey] : undefined) ??
          group.authIndexes.map((key) => patch.planTypeByKey[key]).find(Boolean);
        for (const name of group.names) {
          const file = filesForMerge.find((item) => item.name === name);
          const hasPrivatePlan = Boolean(file?.plan_type ?? file?.planType);
          patchAuthFileByName(name, {
            account_status_scope: group.account.status_scope,
            subject_scope: group.account.subject_scope,
            share_eligible: group.account.share_eligible,
            usage_history_complete: group.account.usage?.history_complete,
            usage_projected_since: group.account.usage?.projected_since,
            shared_subscription_started_at: group.account.subscription_started_at,
            shared_subscription_expires_at: group.account.subscription_expires_at,
            shared_subscription_source: group.account.subscription_source,
            ...(!hasPrivatePlan && planType ? { plan_type: planType, planType } : {}),
          });
        }
      }
    },
    [patchAuthFileByName, setUsageDataFromStatus],
  );

  const markFilesLoading = useCallback((files: AuthFileItem[]) => {
    if (!files.length) return;
    setQuotaByFileName((prev) => {
      const next = { ...prev };
      for (const file of files) {
        if (!resolveFileAuthIndex(file)) continue;
        next[file.name] = {
          status: "loading",
          items: prev[file.name]?.items ?? [],
          planType: prev[file.name]?.planType,
          resetCreditCount: prev[file.name]?.resetCreditCount,
          resetCreditExpirations: prev[file.name]?.resetCreditExpirations,
          error: prev[file.name]?.error,
          updatedAt: prev[file.name]?.updatedAt,
        };
        quotaInFlightRef.current.add(file.name);
        quotaAutoRefreshingRef.current.add(file.name);
      }
      return next;
    });
  }, []);

  const markFilesError = useCallback((files: AuthFileItem[], message: string) => {
    setQuotaByFileName((prev) => {
      const next = { ...prev };
      for (const file of files) {
        next[file.name] = {
          status: "error",
          items: prev[file.name]?.items ?? [],
          planType: prev[file.name]?.planType,
          resetCreditCount: prev[file.name]?.resetCreditCount,
          resetCreditExpirations: prev[file.name]?.resetCreditExpirations,
          error: message,
          updatedAt: Date.now(),
        };
        quotaInFlightRef.current.delete(file.name);
        quotaAutoRefreshingRef.current.delete(file.name);
      }
      return next;
    });
  }, []);

  const clearFilesLoading = useCallback((files: AuthFileItem[]) => {
    for (const file of files) {
      quotaInFlightRef.current.delete(file.name);
      quotaAutoRefreshingRef.current.delete(file.name);
    }
    setQuotaByFileName((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const file of files) {
        const current = next[file.name];
        if (current?.status === "loading") {
          next[file.name] = {
            ...current,
            status: current.items?.length ? "success" : "idle",
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const loadStatusSnapshot = useCallback(
    async (options?: {
      signal?: AbortSignal;
      filesForMerge?: AuthFileItem[];
      authIndexes?: string[];
      quiet?: boolean;
      markUnsupportedOn404?: boolean;
      /**
       * When true, only tenant/mount abort invalidates the response.
       * Concurrent page/single final GETs must both be allowed to apply.
       */
      allowConcurrentApply?: boolean;
    }): Promise<boolean> => {
      // Global seq only for scope/tenant invalidation, not mutual exclusion of concurrent finals.
      if (!options?.allowConcurrentApply) {
        statusLoadSeqRef.current += 1;
      }
      const seq = statusLoadSeqRef.current;
      const tenantAtStart = tenantIdRef.current;
      const signal = options?.signal;
      if (!options?.quiet) setStatusLoading(true);
      try {
        const authIndexes =
          options?.authIndexes ??
          (options?.filesForMerge
            ? Array.from(
                new Set(
                  options.filesForMerge
                    .map((file) => resolveFileAuthIndex(file))
                    .filter((value): value is string => Boolean(value)),
                ),
              )
            : undefined);
        const snapshot = await aiAccountsStatusApi.getStatus({
          signal,
          authIndexes,
        });
        if (
          !mountedRef.current ||
          signal?.aborted ||
          tenantIdRef.current !== tenantAtStart ||
          (!options?.allowConcurrentApply && statusLoadSeqRef.current !== seq)
        ) {
          return false;
        }
        setStatusApiSupported(true);
        applyStatusesToUi(snapshot.items, options?.filesForMerge ?? pageItemsRef.current);
        return true;
      } catch (error: unknown) {
        if (
          !mountedRef.current ||
          signal?.aborted ||
          tenantIdRef.current !== tenantAtStart ||
          (!options?.allowConcurrentApply && statusLoadSeqRef.current !== seq)
        ) {
          return false;
        }
        if (options?.markUnsupportedOn404 !== false && isStatusApiUnsupportedError(error)) {
          setStatusApiSupported(false);
          return false;
        }
        if (isFatalQuotaRefreshError(error)) {
          haltQuotaAutoRefresh();
        }
        if (!options?.quiet) {
          notify({
            type: "error",
            message: error instanceof Error ? error.message : t("auth_files.load_failed"),
          });
        }
        return false;
      } finally {
        if (
          mountedRef.current &&
          (options?.allowConcurrentApply || statusLoadSeqRef.current === seq)
        ) {
          setStatusLoading(false);
        }
      }
    },
    [applyStatusesToUi, haltQuotaAutoRefresh, notify, t],
  );

  const pollJobUntilDone = useCallback(
    async (
      jobId: string,
      targetFiles: AuthFileItem[],
      signal: AbortSignal,
      tenantId: string,
    ): Promise<"completed" | "lost" | "aborted" | "timeout"> => {
      const startedAt = Date.now();
      const pendingNames = new Set(
        targetFiles.filter((file) => resolveFileAuthIndex(file)).map((file) => file.name),
      );

      while (!signal.aborted) {
        if (tenantIdRef.current !== tenantId) return "aborted";
        if (Date.now() - startedAt > STATUS_REFRESH_TIMEOUT_MS) {
          markFilesError(
            targetFiles.filter((file) => pendingNames.has(file.name)),
            t("auth_files.status_refresh_timeout"),
          );
          return "timeout";
        }

        let job: AiAccountStatusRefreshJobDto;
        try {
          job = await aiAccountsStatusApi.getStatusRefreshJob(jobId, { signal });
        } catch (error: unknown) {
          // Job poll 404 = lost job (restart/TTL), NOT unsupported status API.
          if (isApiClientError(error) && error.status === 404) {
            clearFilesLoading(
              targetFiles.filter((file) => pendingNames.has(file.name)),
            );
            notify({
              type: "error",
              message: t("auth_files.status_refresh_job_lost"),
            });
            return "lost";
          }
          throw error;
        }

        if (tenantIdRef.current !== tenantId || signal.aborted) return "aborted";

        const finishedAccounts: AiAccountLatestStatusDto[] = [];
        for (const progress of job.results) {
          const matched = findFilesForStatusKeys(
            targetFiles,
            progress.auth_index,
            progress.auth_subject_id ?? null,
          );
          if (!matched.length) continue;
          if (progress.state === "success" && progress.result) {
            finishedAccounts.push(progress.result);
            for (const file of matched) pendingNames.delete(file.name);
          } else if (progress.state === "error") {
            // Backend singleflight: another job owns this account. Counted completed, not failed.
            // Keep prior snapshot; final status GET will refresh. Never paint as account error.
            if (progress.error_code === "deduplicated") {
              clearFilesLoading(matched);
              for (const file of matched) pendingNames.delete(file.name);
            } else {
              markFilesError(
                matched,
                progress.error_message ?? progress.error_code ?? t("auth_files.unknown_error"),
              );
              for (const file of matched) pendingNames.delete(file.name);
            }
          }
        }
        if (finishedAccounts.length > 0) {
          applyStatusesToUi(finishedAccounts, targetFiles);
        }
        if (job.state === "completed") {
          return "completed";
        }
        await wait(STATUS_POLL_INTERVAL_MS, signal);
      }
      return "aborted";
    },
    [applyStatusesToUi, clearFilesLoading, markFilesError, notify, t],
  );

  const runBatchStatusRefresh = useCallback(
    async (
      targetFiles: AuthFileItem[],
      options?: { force?: boolean; showLoading?: boolean; kind?: "page" | "single" },
    ): Promise<void> => {
      if (!targetFiles.length) return;

      const kind = options?.kind ?? (targetFiles.length > 1 ? "page" : "single");
      const force = options?.force ?? true;
      // Auto paths skip while unsupported. Manual/force re-probes so a transient 404
      // cannot lock the page until full reload.
      if (!statusApiSupported && !force) {
        return;
      }

      const withAuth = targetFiles
        .map((file) => ({ file, authIndex: resolveFileAuthIndex(file) }))
        .filter((entry): entry is { file: AuthFileItem; authIndex: string } =>
          Boolean(entry.authIndex),
        );
      // Accounts without auth_index never enter loading / batch.
      if (!withAuth.length) return;

      // Single-card refresh must not abort an in-flight page job.
      if (kind === "page") {
        if (pageBatchRef.current) {
          notify({
            type: "info",
            message: t("auth_files.status_refresh_in_progress"),
          });
          return;
        }
      } else if (singleBatchRef.current) {
        // One single-card job at a time; do not cancel page job.
        return;
      }

      const controller = new AbortController();
      const tenantId = tenantIdRef.current;
      const batch: ActiveBatch = {
        kind,
        controller,
        jobId: null,
        tenantId,
        files: withAuth.map((entry) => entry.file),
      };
      if (kind === "page") pageBatchRef.current = batch;
      else singleBatchRef.current = batch;

      const files = batch.files;
      const authIndexes = withAuth.map((entry) => entry.authIndex);

      if (options?.showLoading !== false) {
        markFilesLoading(files);
      }
      if (kind === "page") setRefreshingPage(true);

      try {
        const accepted = await aiAccountsStatusApi.startStatusRefresh(
          { auth_indexes: authIndexes, force },
          { signal: controller.signal },
        );
        if (controller.signal.aborted || !mountedRef.current) return;
        if (tenantIdRef.current !== tenantId) return;
        // Probe succeeded — clear sticky unsupported from an earlier false 404.
        setStatusApiSupported(true);
        batch.jobId = accepted.job_id;

        const pollResult = await pollJobUntilDone(
          accepted.job_id,
          files,
          controller.signal,
          tenantId,
        );
        if (controller.signal.aborted || !mountedRef.current) return;
        if (tenantIdRef.current !== tenantId) return;

        // Final snapshot once (also after job lost) — never N GETs.
        if (pollResult === "completed" || pollResult === "lost" || pollResult === "timeout") {
          const applied = await loadStatusSnapshot({
            signal: controller.signal,
            filesForMerge: files,
            authIndexes,
            quiet: true,
            markUnsupportedOn404: false,
            // page + single may finish together; both finals must be allowed to apply.
            allowConcurrentApply: true,
          });
          if (!applied && !controller.signal.aborted && tenantIdRef.current === tenantId) {
            // Keep previous snapshot values; only drop stuck loading spinners.
            clearFilesLoading(files);
          }
        }
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (tenantIdRef.current !== tenantId) return;
        if (isStatusApiUnsupportedError(error)) {
          setStatusApiSupported(false);
          markFilesError(files, t("auth_files.status_batch_unsupported"));
          notify({
            type: "error",
            message: t("auth_files.status_batch_unsupported"),
          });
          return;
        }
        if (isFatalQuotaRefreshError(error)) {
          haltQuotaAutoRefresh();
        }
        const message =
          error instanceof Error ? error.message : t("auth_files.unknown_error");
        markFilesError(files, message);
      } finally {
        if (kind === "page" && pageBatchRef.current === batch) {
          pageBatchRef.current = null;
        }
        if (kind === "single" && singleBatchRef.current === batch) {
          singleBatchRef.current = null;
        }
        // Always release in-flight locks; clearFilesLoading handles leftover loading status.
        clearFilesLoading(files);
        if (mountedRef.current && kind === "page") setRefreshingPage(false);
      }
    },
    [
      clearFilesLoading,
      haltQuotaAutoRefresh,
      loadStatusSnapshot,
      markFilesError,
      markFilesLoading,
      notify,
      pollJobUntilDone,
      statusApiSupported,
      t,
    ],
  );

  // Visible scope change (first load / page / filter / re-enter route):
  // 1) one filtered status GET for cached snapshot
  // 2) one quiet force probe so cards do not stay on stale/empty quota when auto-refresh is off
  // Empty auth-index set must NOT call unfiltered GET. Mark scope loaded only after snapshot
  // success (or intentional empty skip) so abort/fail restarts when pageItems identity changes.
  useEffect(() => {
    if (tab !== "files" || loading) return;
    if (!statusApiSupported) return;
    const scopeKey = `${tenantIdRef.current}::${buildVisibleScopeKey(pageItems)}`;
    if (loadedVisibleScopeRef.current === scopeKey) return;

    const authIndexes = Array.from(
      new Set(
        pageItems
          .map((file) => resolveFileAuthIndex(file))
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (authIndexes.length === 0) {
      loadedVisibleScopeRef.current = scopeKey;
      return;
    }

    const controller = new AbortController();
    const visibleFiles = pageItems;
    void (async () => {
      const ok = await loadStatusSnapshot({
        signal: controller.signal,
        filesForMerge: visibleFiles,
        authIndexes,
        quiet: true,
        markUnsupportedOn404: true,
      });
      if (!ok || controller.signal.aborted) return;
      loadedVisibleScopeRef.current = scopeKey;
      // Probe after snapshot so re-entering /access/ai-accounts always refreshes visible cards,
      // even when quota auto-refresh interval is 0.
      if (pageBatchRef.current) return;
      void runBatchStatusRefresh(visibleFiles, {
        force: true,
        showLoading: false,
        kind: "page",
      });
    })();

    return () => {
      controller.abort();
    };
  }, [
    tab,
    loading,
    pageItems,
    statusApiSupported,
    loadStatusSnapshot,
    cacheTenantId,
    runBatchStatusRefresh,
  ]);

  const forceRefreshPage = useCallback(async () => {
    if (tab !== "files" || loading) return;
    if (pageBatchRef.current) {
      notify({
        type: "info",
        message: t("auth_files.status_refresh_in_progress"),
      });
      return;
    }
    await runBatchStatusRefresh(pageItemsRef.current, {
      force: true,
      showLoading: true,
      kind: "page",
    });
  }, [loading, notify, runBatchStatusRefresh, t, tab]);

  const refreshQuota = useCallback(
    async (
      file: AuthFileItem,
      _provider: QuotaProvider,
      options?: { showLoading?: boolean; refreshUsage?: boolean },
    ) => {
      void options?.refreshUsage;
      if (!resolveFileAuthIndex(file)) return;
      await runBatchStatusRefresh([file], {
        force: true,
        showLoading: options?.showLoading !== false,
        kind: "single",
      });
    },
    [runBatchStatusRefresh],
  );

  const resolveQuotaTargets = useCallback((targetFiles: AuthFileItem[]) => {
    const targets: { file: AuthFileItem; provider: QuotaProvider }[] = [];
    for (const file of targetFiles) {
      const provider = resolveQuotaProvider(file);
      if (provider) targets.push({ file, provider });
    }
    return targets;
  }, []);

  const runQuotaRefreshBatch = useCallback(
    async (
      targets: { file: AuthFileItem; provider: QuotaProvider }[],
      options?: { markAsAutoRefreshing?: boolean; showLoading?: boolean; refreshUsage?: boolean },
    ) => {
      void options?.markAsAutoRefreshing;
      void options?.refreshUsage;
      await runBatchStatusRefresh(
        targets.map((target) => target.file),
        {
          force: true,
          showLoading: options?.showLoading !== false,
          kind: targets.length > 1 ? "page" : "single",
        },
      );
    },
    [runBatchStatusRefresh],
  );

  useInterval(
    () => {
      if (tab !== "files" || loading || quotaRefreshHalted) return;
      if (pageBatchRef.current || !statusApiSupported) return;
      void runBatchStatusRefresh(pageItemsRef.current, {
        force: false,
        showLoading: false,
        kind: "page",
      });
    },
    tab === "files" && effectiveQuotaAutoRefreshMs > 0 ? effectiveQuotaAutoRefreshMs : null,
  );

  const resolveQuotaCardSlots = useCallback(
    (provider: QuotaProvider, items: QuotaItem[]) => {
      const translateXaiQuotaText = (text: string) => {
        const separatorIndex = text.indexOf("::");
        const key = separatorIndex >= 0 ? text.slice(0, separatorIndex) : text;
        const value = separatorIndex >= 0 ? text.slice(separatorIndex + 2) : "";
        if (key === "xai_quota.product_usage_named" && value) {
          return t(key, { product: value });
        }
        if (key === "xai_quota.used_percent" && value) {
          return t(key, { percent: value });
        }
        if (key === "xai_quota.remaining_percent" && value) {
          return t(key, { percent: value });
        }
        if (key === "xai_quota.reset_at" && value) {
          return t(key, { time: value });
        }
        return t(text);
      };

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
        if (text.startsWith("antigravity_quota.")) return t(text);
        if (text.startsWith("xai_quota.")) return translateXaiQuotaText(text);
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
      if (provider === "xai") {
        return items.map((item, index) => ({
          id: item.key ?? item.label ?? `xai-${index + 1}`,
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

  const checkAuthFileConnectivity = useCallback(async (fileName: string) => {
    setConnectivityState((prev) => {
      if (prev.get(fileName)?.loading) return prev;
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
  }, []);

  const callsByAuthIndex = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [authIndex, snapshot] of Object.entries(cycleByAuthIndex)) {
      if (typeof snapshot.calls === "number") {
        result[authIndex] = snapshot.calls;
      }
    }
    return result;
  }, [cycleByAuthIndex]);

  const cycleBudgetByAuthIndex: Record<string, AuthFileCycleBudgetStats> = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(cycleByAuthIndex).map(([authIndex, snapshot]) => [
          authIndex,
          {
            cycleCostTotal: snapshot.cycleCostTotal,
            weeklyQuotaUsedPercent: snapshot.weeklyQuotaUsedPercent,
          } satisfies AuthFileCycleBudgetStats,
        ]),
      ),
    [cycleByAuthIndex],
  );

  return {
    connectivityState,
    quotaByFileName,
    quotaAutoRefreshingRef,
    nowMs,
    quotaPreviewMode,
    setQuotaPreviewMode,
    quotaAutoRefreshMs: effectiveQuotaAutoRefreshMs,
    setQuotaAutoRefreshMsRaw: (value: number) => {
      if (value > 0) {
        quotaRefreshHaltedRef.current = false;
        setQuotaRefreshHalted(false);
      }
      const normalized = readAndMigrateQuotaAutoRefreshMs();
      void normalized;
      // Persist only allowed buckets.
      const next =
        value <= 0 ? 0 : value >= 300_000 ? 300_000 : value >= 60_000 ? 60_000 : 60_000;
      setQuotaAutoRefreshMsRaw(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(next));
      }
    },
    filesViewMode,
    setFilesViewMode,
    resolveQuotaCardSlots,
    refreshQuota,
    checkAuthFileConnectivity,
    forceRefreshPage,
    runQuotaRefreshBatch,
    resolveQuotaTargets,
    statusApiSupported,
    statusLoading,
    refreshingPage,
    callsByAuthIndex,
    cycleBudgetByAuthIndex,
    collectQuotaFetchTargets: (): { file: AuthFileItem; provider: QuotaProvider }[] => [],
  };
}
