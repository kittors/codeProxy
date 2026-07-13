import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi, usageApi } from "@code-proxy/api-client";
import type { EntityStatsScope } from "@code-proxy/api-client/endpoints/usage";
import type { AuthFileItem, EntityStatsResponse } from "@code-proxy/api-client";
import { useToast } from "@code-proxy/ui";
import {
  buildAuthFileSourceCandidates,
  buildUsageIndex,
  getActiveCacheTenantId,
  normalizeAuthIndexValue,
  readAuthFilesDataCache,
  sanitizeAuthFilesForCache,
  writeAuthFilesDataCache,
} from "@code-proxy/domain";
import { normalizeUsageSourceId } from "@code-proxy/domain";

const mergeTargetUsageData = (
  previous: EntityStatsResponse | null,
  next: EntityStatsResponse,
  targetFiles: AuthFileItem[],
): EntityStatsResponse => {
  const targetAuthIndices = new Set(
    targetFiles
      .map((file) => normalizeAuthIndexValue(file.auth_index ?? file.authIndex))
      .filter(Boolean) as string[],
  );
  const targetSources = new Set(targetFiles.flatMap((file) => buildAuthFileSourceCandidates(file)));

  const isTargetAuthIndex = (value: unknown) => {
    const normalized = normalizeAuthIndexValue(value);
    return Boolean(normalized && targetAuthIndices.has(normalized));
  };
  const isTargetSource = (value: unknown) => {
    const normalized = normalizeUsageSourceId(value, (v) => v);
    return Boolean(normalized && targetSources.has(normalized));
  };
  const previousAuthIndex = Array.isArray(previous?.auth_index) ? previous.auth_index : [];
  const previousSource = Array.isArray(previous?.source) ? previous.source : [];
  const nextAuthIndex = Array.isArray(next.auth_index) ? next.auth_index : [];
  const nextSource = Array.isArray(next.source) ? next.source : [];

  return {
    auth_index: [
      ...previousAuthIndex.filter((point) => !isTargetAuthIndex(point.entity_name)),
      ...nextAuthIndex.filter((point) => isTargetAuthIndex(point.entity_name)),
    ],
    source: [
      ...previousSource.filter((point) => !isTargetSource(point.entity_name)),
      ...nextSource.filter((point) => isTargetSource(point.entity_name)),
    ],
  };
};

const buildEntityStatsScopeForFiles = (targetFiles: AuthFileItem[]): EntityStatsScope => {
  const authIndexes = Array.from(
    new Set(
      targetFiles
        .map((file) => normalizeAuthIndexValue(file.auth_index ?? file.authIndex))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const sources = Array.from(
    new Set(targetFiles.flatMap((file) => buildAuthFileSourceCandidates(file))),
  );
  return { authIndexes, sources };
};

const isRequestCancelled = (err: unknown, signal?: AbortSignal) =>
  signal?.aborted || (err instanceof Error && err.message === "Request was cancelled");

/**
 * Warm paint = this effective-tenant bucket already has a list snapshot
 * (including empty lists). Empty must not force skeleton on remount.
 */
const hasWarmAuthFilesCache = (tenantId: string): boolean =>
  readAuthFilesDataCache(tenantId) != null;

export function useAuthFilesDataState() {
  const { t } = useTranslation();
  const { notify } = useToast();
  // Seed from the active effective-tenant bucket only. DashboardLayout remounts on
  // tenant switch, so a one-shot read at mount is enough to avoid cross-tenant paint.
  const cacheTenantId = getActiveCacheTenantId();
  const initialDataCache = useMemo(
    () => readAuthFilesDataCache(cacheTenantId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-seed only
    [],
  );
  // Bucket presence (not files.length) decides cold skeleton vs SWR refresh.
  const initialWarm = initialDataCache != null;

  const [files, setFiles] = useState<AuthFileItem[]>(() => initialDataCache?.files ?? []);
  const [loading, setLoading] = useState(() => !initialWarm);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageData, setUsageData] = useState<EntityStatsResponse | null>(
    () => initialDataCache?.usageData ?? null,
  );

  const filesRef = useRef<AuthFileItem[]>(files);
  const usageDataRef = useRef<EntityStatsResponse | null>(usageData);
  const cacheTenantIdRef = useRef(cacheTenantId);
  // After a successful load (or warm seed), keep subsequent refreshes non-blocking.
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
      // SWR: keep cards/table when we already painted from cache or in-memory list.
      // Re-read the tenant bucket so empty-list warm remounts still skip skeleton.
      const hasExisting =
        filesRef.current.length > 0 ||
        warmPaintRef.current ||
        hasWarmAuthFilesCache(cacheTenantIdRef.current);
      if (hasExisting) setRefreshingAll(true);
      else setLoading(true);
      if (!hasExisting) setUsageLoading(true);
      try {
        const filesRes = await authFilesApi.list(signal ? { signal } : undefined);
        if (!isActive()) return filesRef.current;
        const list = Array.isArray(filesRes?.files) ? filesRes.files : [];
        filesRef.current = list;
        setFiles(list);
        warmPaintRef.current = true;

        const scope = buildEntityStatsScopeForFiles(list);
        const hasUsageScope =
          (scope.authIndexes?.length ?? 0) > 0 || (scope.sources?.length ?? 0) > 0;
        const usageRes = hasUsageScope
          ? await usageApi
              .getEntityStats(30, "all", scope, signal ? { signal } : undefined)
              .catch(() => null)
          : ({ source: [], auth_index: [] } satisfies EntityStatsResponse);

        if (!isActive()) return filesRef.current;
        setUsageData((prev) => usageRes ?? prev);
        return list;
      } catch (err: unknown) {
        if (!isActive() || isRequestCancelled(err, signal)) return filesRef.current;
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.load_failed"),
        });
        return filesRef.current;
      } finally {
        if (isActive()) {
          if (hasExisting) setRefreshingAll(false);
          else setLoading(false);
          if (!hasExisting) setUsageLoading(false);
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
            return filesByName.get(item.name) ?? item;
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

  const refreshUsageDataForFiles = useCallback(
    async (targetFiles: AuthFileItem[]): Promise<EntityStatsResponse | null> => {
      if (targetFiles.length === 0) return usageDataRef.current;

      try {
        const nextUsageData = await usageApi.getEntityStats(
          30,
          "all",
          buildEntityStatsScopeForFiles(targetFiles),
        );
        if (!mountedRef.current) return usageDataRef.current;
        const mergedUsageData = mergeTargetUsageData(
          usageDataRef.current,
          nextUsageData,
          targetFiles,
        );
        usageDataRef.current = mergedUsageData;
        setUsageData(mergedUsageData);
        return mergedUsageData;
      } catch {
        return null;
      }
    },
    [],
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
    usageIndex,
    loadAll,
    refreshFilesForItems,
    refreshUsageDataForFiles,
  };
}
