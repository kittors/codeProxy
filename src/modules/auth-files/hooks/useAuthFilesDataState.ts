import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi, usageApi } from "@/lib/http/apis";
import type { AuthFileItem, EntityStatsResponse } from "@/lib/http/types";
import { useToast } from "@/modules/ui/ToastProvider";
import {
  buildUsageIndex,
  readAuthFilesDataCache,
  sanitizeAuthFilesForCache,
  writeAuthFilesDataCache,
} from "@/modules/auth-files/helpers/authFilesPageUtils";

export function useAuthFilesDataState() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const initialDataCache = useMemo(() => readAuthFilesDataCache(), []);

  const [files, setFiles] = useState<AuthFileItem[]>(() => initialDataCache?.files ?? []);
  const [loading, setLoading] = useState(() => !((initialDataCache?.files?.length ?? 0) > 0));
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageData, setUsageData] = useState<EntityStatsResponse | null>(
    () => initialDataCache?.usageData ?? null,
  );

  const filesRef = useRef<AuthFileItem[]>(files);
  const usageDataRef = useRef<EntityStatsResponse | null>(usageData);
  const { index: usageIndex } = useMemo(() => buildUsageIndex(usageData), [usageData]);

  const loadAll = useCallback(async (): Promise<AuthFileItem[]> => {
    const hasExisting = filesRef.current.length > 0;
    if (hasExisting) setRefreshingAll(true);
    else setLoading(true);
    if (!hasExisting) setUsageLoading(true);
    try {
      const [filesRes, usageRes] = await Promise.all([
        authFilesApi.list(),
        usageApi.getEntityStats(30, "all").catch(() => null),
      ]);
      const list = Array.isArray(filesRes?.files) ? filesRes.files : [];
      setFiles(list);
      setUsageData((prev) => usageRes ?? prev);
      return list;
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.load_failed"),
      });
      return filesRef.current;
    } finally {
      if (hasExisting) setRefreshingAll(false);
      else setLoading(false);
      if (!hasExisting) setUsageLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void loadAll();
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
  };
}
