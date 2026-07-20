import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi } from "@code-proxy/api-client";
import type { AuthFileItem, EntityStatsResponse } from "@code-proxy/api-client";
import { useToast } from "@code-proxy/ui";
import {
  buildUsageIndex,
  getActiveCacheTenantId,
  readAuthFilesDataCache,
  sanitizeAuthFilesForCache,
  writeAuthFilesDataCache,
} from "@code-proxy/domain";

/**
 * Warm paint = this effective-tenant bucket already has a list snapshot
 * (including empty lists). Empty must not force skeleton on remount.
 */
const hasWarmAuthFilesCache = (tenantId: string): boolean =>
  readAuthFilesDataCache(tenantId) != null;

const isRequestCancelled = (err: unknown, signal?: AbortSignal) =>
  signal?.aborted || (err instanceof Error && err.message === "Request was cancelled");

const EMPTY_USAGE: EntityStatsResponse = { source: [], auth_index: [] };

export function useAuthFilesDataState() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const cacheTenantId = getActiveCacheTenantId();
  const initialDataCache = useMemo(
    () => readAuthFilesDataCache(cacheTenantId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-seed only
    [],
  );
  const initialWarm = initialDataCache != null;

  const [files, setFiles] = useState<AuthFileItem[]>(() => initialDataCache?.files ?? []);
  const [loading, setLoading] = useState(() => !initialWarm);
  const [refreshingAll, setRefreshingAll] = useState(false);
  // Status usage is server-owned; never block paint on entity-stats.
  const [usageLoading] = useState(false);
  const [usageData, setUsageData] = useState<EntityStatsResponse | null>(
    () => initialDataCache?.usageData ?? EMPTY_USAGE,
  );

  const filesRef = useRef<AuthFileItem[]>(files);
  const usageDataRef = useRef<EntityStatsResponse | null>(usageData);
  const cacheTenantIdRef = useRef(cacheTenantId);
  const warmPaintRef = useRef(initialWarm);
  const mountedRef = useRef(true);
  const loadSeqRef = useRef(0);

  useEffect(() => {
    cacheTenantIdRef.current = cacheTenantId;
  }, [cacheTenantId]);
  const { index: usageIndex } = useMemo(() => buildUsageIndex(usageData), [usageData]);

  const loadAll = useCallback(
    async (options?: { signal?: AbortSignal }): Promise<AuthFileItem[]> => {
      const seq = ++loadSeqRef.current;
      const signal = options?.signal;
      const isActive = () =>
        mountedRef.current && loadSeqRef.current === seq && signal?.aborted !== true;
      const hasExisting =
        filesRef.current.length > 0 ||
        warmPaintRef.current ||
        hasWarmAuthFilesCache(cacheTenantIdRef.current);
      if (hasExisting) setRefreshingAll(true);
      else setLoading(true);
      try {
        const filesRes = await authFilesApi.list(signal ? { signal } : undefined);
        if (!isActive()) return filesRef.current;
        const list = Array.isArray(filesRes?.files) ? filesRes.files : [];
        // List has no shared status projection. Merge in-memory shared fields so
        // subscription badge / plan / scope do not flash on full list reload.
        const prevByName = new Map(filesRef.current.map((file) => [file.name, file]));
        const merged = list.map((fresh) => {
          const prev = prevByName.get(fresh.name);
          if (!prev) return fresh;
          return {
            ...fresh,
            shared_subscription_started_at:
              fresh.shared_subscription_started_at ?? prev.shared_subscription_started_at,
            shared_subscription_expires_at:
              fresh.shared_subscription_expires_at ?? prev.shared_subscription_expires_at,
            shared_subscription_source:
              fresh.shared_subscription_source ?? prev.shared_subscription_source,
            account_status_scope: fresh.account_status_scope ?? prev.account_status_scope,
            subject_scope: fresh.subject_scope ?? prev.subject_scope,
            share_eligible: fresh.share_eligible ?? prev.share_eligible,
            usage_history_complete: fresh.usage_history_complete ?? prev.usage_history_complete,
            usage_projected_since: fresh.usage_projected_since ?? prev.usage_projected_since,
            // Keep status-derived plan when list metadata omits it.
            plan_type: fresh.plan_type ?? fresh.planType ?? prev.plan_type ?? prev.planType,
            planType: fresh.planType ?? fresh.plan_type ?? prev.planType ?? prev.plan_type,
          };
        });
        filesRef.current = merged;
        setFiles(merged);
        warmPaintRef.current = true;
        // Calls / success-rate come from ai-accounts status usage — no entity-stats.
        return merged;
      } catch (err: unknown) {
        if (!isActive() || isRequestCancelled(err, signal)) return filesRef.current;
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.load_failed"),
        });
        return filesRef.current;
      } finally {
        if (isActive()) {
          // A StrictMode replay may turn a cold load into a warm refresh while the
          // original loading state is still true. Always settle both state branches.
          setLoading(false);
          setRefreshingAll(false);
        }
      }
    },
    [notify, t],
  );

  const refreshFilesForItems = useCallback(
    async (targetFiles: AuthFileItem[]): Promise<AuthFileItem[]> => {
      if (targetFiles.length === 0) return filesRef.current;

      const targetNames = new Set(targetFiles.map((file) => file.name).filter(Boolean));
      if (targetNames.size === 0) return filesRef.current;

      try {
        const filesRes = await authFilesApi.list();
        if (!mountedRef.current) return filesRef.current;
        const list = Array.isArray(filesRes?.files) ? filesRes.files : [];
        const filesByName = new Map(list.map((file) => [file.name, file]));
        let updatedFiles = filesRef.current;

        setFiles((prev) => {
          const next = prev.map((item) => {
            if (!targetNames.has(item.name)) return item;
            const fresh = filesByName.get(item.name);
            if (!fresh) return item;
            // List API has no shared status projection; keep in-memory shared fields
            // so subscription badge / scope do not flash away on partial file refresh.
            return {
              ...fresh,
              shared_subscription_started_at:
                fresh.shared_subscription_started_at ?? item.shared_subscription_started_at,
              shared_subscription_expires_at:
                fresh.shared_subscription_expires_at ?? item.shared_subscription_expires_at,
              shared_subscription_source:
                fresh.shared_subscription_source ?? item.shared_subscription_source,
              account_status_scope: fresh.account_status_scope ?? item.account_status_scope,
              subject_scope: fresh.subject_scope ?? item.subject_scope,
              share_eligible: fresh.share_eligible ?? item.share_eligible,
              usage_history_complete:
                fresh.usage_history_complete ?? item.usage_history_complete,
              usage_projected_since:
                fresh.usage_projected_since ?? item.usage_projected_since,
              plan_type: fresh.plan_type ?? fresh.planType ?? item.plan_type ?? item.planType,
              planType: fresh.planType ?? fresh.plan_type ?? item.planType ?? item.plan_type,
            };
          });
          updatedFiles = next;
          filesRef.current = next;
          return next;
        });

        return updatedFiles;
      } catch (err: unknown) {
        if (!mountedRef.current) return filesRef.current;
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.load_failed"),
        });
        return filesRef.current;
      }
    },
    [notify, t],
  );

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    void loadAll({ signal: controller.signal });
    return () => {
      controller.abort();
      loadSeqRef.current += 1;
      mountedRef.current = false;
    };
  }, [loadAll]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    usageDataRef.current = usageData;
  }, [usageData]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const timer = window.setTimeout(() => {
      writeAuthFilesDataCache({
        tenantId: cacheTenantIdRef.current,
        savedAtMs: Date.now(),
        files: sanitizeAuthFilesForCache(files),
        usageData,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [files, usageData]);

  useEffect(() => {
    return () => {
      writeAuthFilesDataCache({
        tenantId: cacheTenantIdRef.current,
        savedAtMs: Date.now(),
        files: sanitizeAuthFilesForCache(filesRef.current),
        usageData: usageDataRef.current,
      });
    };
  }, []);

  return {
    files,
    setFiles,
    loading,
    refreshingAll,
    usageLoading,
    usageData,
    setUsageData,
    usageIndex,
    loadAll,
    refreshFilesForItems,
  };
}
