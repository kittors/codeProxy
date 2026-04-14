import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { authFilesApi, quotaApi } from "@/lib/http/apis";
import type { AuthFileItem } from "@/lib/http/types";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { OAuthLoginDialog } from "@/modules/oauth/OAuthLoginDialog";
import { AuthFileDetailModal } from "@/modules/auth-files/components/AuthFileDetailModal";
import { AuthFilesExcludedTab } from "@/modules/auth-files/components/AuthFilesExcludedTab";
import { AuthFilesAliasTab } from "@/modules/auth-files/components/AuthFilesAliasTab";
import { AuthFilesFilesTab } from "@/modules/auth-files/components/AuthFilesFilesTab";
import { ImportModelsModal } from "@/modules/auth-files/components/ImportModelsModal";
import { GroupOverviewModal } from "@/modules/auth-files/components/GroupOverviewModal";
import { useAuthFilesDataState } from "@/modules/auth-files/hooks/useAuthFilesDataState";
import { useAuthFilesDetailEditors } from "@/modules/auth-files/hooks/useAuthFilesDetailEditors";
import { useAuthFilesFileActions } from "@/modules/auth-files/hooks/useAuthFilesFileActions";
import { useAuthFilesFilesPresentation } from "@/modules/auth-files/hooks/useAuthFilesFilesPresentation";
import { useAuthFilesListState } from "@/modules/auth-files/hooks/useAuthFilesListState";
import { useAuthFilesGroupOverview } from "@/modules/auth-files/hooks/useAuthFilesGroupOverview";
import { useAuthFilesOAuthConfig } from "@/modules/auth-files/hooks/useAuthFilesOAuthConfig";
import { fetchQuota, resolveQuotaProvider, type QuotaProvider } from "@/modules/quota/quota-fetch";
import { useInterval } from "@/hooks/useInterval";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { type QuotaItem, type QuotaState } from "@/modules/quota/quota-helpers";
import {
  AUTH_FILES_FILES_VIEW_MODE_KEY,
  AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
  AUTH_FILES_QUOTA_PREVIEW_KEY,
  normalizeAuthIndexValue,
  normalizeQuotaAutoRefreshMs,
  readAuthFilesUiState,
  resolveAuthFileStats,
  resolveProviderLabel,
  writeAuthFilesUiState,
  type FilesViewMode,
  type OAuthDialogTab,
  type QuotaPreviewMode,
} from "@/modules/auth-files/helpers/authFilesPageUtils";

export function AuthFilesPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState<"files" | "excluded" | "alias">("files");
  const {
    isPending,
    excludedLoading,
    excluded,
    excludedDraft,
    setExcludedDraft,
    excludedNewProvider,
    setExcludedNewProvider,
    excludedUnsupported,
    aliasLoading,
    aliasEditing,
    setAliasEditing,
    aliasNewChannel,
    setAliasNewChannel,
    aliasUnsupported,
    importOpen,
    setImportOpen,
    importChannel,
    importLoading,
    importModels,
    importSearch,
    setImportSearch,
    importSelected,
    setImportSelected,
    importFilteredModels,
    refreshExcluded,
    refreshAlias,
    saveExcludedProvider,
    deleteExcludedProvider,
    addExcludedProvider,
    addAliasChannel,
    saveAliasChannel,
    deleteAliasChannel,
    openImport,
    applyImport,
  } = useAuthFilesOAuthConfig(tab);

  const {
    files,
    setFiles,
    loading,
    refreshingAll,
    usageLoading,
    usageData,
    usageIndex,
    loadAll,
  } = useAuthFilesDataState();

  const [confirm, setConfirm] = useState<null | { type: "deleteSelection"; names: string[] }>(null);

  const [oauthDialogOpen, setOauthDialogOpen] = useState(false);
  const [oauthDialogDefaultTab, setOauthDialogDefaultTab] = useState<OAuthDialogTab>("codex");

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Connectivity check state: fileName → { loading, latencyMs, error }
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

  const patchAuthFileByName = useCallback((name: string, patch: Partial<AuthFileItem>) => {
    setFiles((prev) => prev.map((item) => (item.name === name ? { ...item, ...patch } : item)));
    setDetailFile((prev) => (prev?.name === name ? { ...prev, ...patch } : prev));
  }, []);

  const resolveQuotaCardSlots = useCallback(
    (provider: QuotaProvider, items: QuotaItem[]) => {
      const translateQuotaLabel = (text: string) => {
        if (!text) return text;
        if (text.startsWith("m_quota.")) return t(text);
        return text;
      };

      if (provider !== "codex") {
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
          // Keep only alnum + CJK to make matching stable across punctuation (e.g. "审查:周")
          .replaceAll(/[^a-z0-9\u4e00-\u9fff]/g, "");

      const candidates = items.map((item) => ({
        item,
        key: normalize(String(item.label ?? "")),
      }));

      const findExact = (label: string) => items.find((item) => item.label === label) ?? null;
      const find = (re: RegExp) => candidates.find((c) => re.test(c.key))?.item ?? null;

      // Prefer stable label keys from quota fetch (e.g. codex returns "m_quota.code_weekly").
      // Fallback to fuzzy matching for other providers / legacy labels.
      const codeFiveHour =
        findExact("m_quota.code_5h") ?? find(/(mquotacode5h|code5h|5h|5小时|fivehour|5hour)/i);
      const codeWeek =
        findExact("m_quota.code_weekly") ?? find(/(mquotacodeweekly|codeweekly|weekly|week|周)/i);
      const reviewWeek =
        findExact("m_quota.review_weekly") ??
        find(/(mquotareviewweekly|reviewweekly|reviewweek|review_week|审查周|审查：周)/i);

      return [
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
        const rawAuthIndex = (file as any)["auth_index"] ?? file.authIndex;
        const authIndex = normalizeAuthIndexValue(rawAuthIndex);
        if (authIndex) {
          void quotaApi.reconcile(authIndex).catch(() => {});
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
    [patchAuthFileByName, t],
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
          // If we got a quick response (even error), show latency
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

  const {
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
  } = useAuthFilesDetailEditors(loadAll);

  const {
    uploading,
    deletingAll,
    statusUpdating,
    downloadAuthFile,
    handleUpload,
    handleDeleteSelection,
    setFileEnabled,
  } = useAuthFilesFileActions({
    loadAll,
    fileInputRef,
    detailFile,
    setDetailFile,
    setDetailOpen,
    setFiles,
    setSelectedFileNames,
  });

  useEffect(() => {
    quotaByFileNameRef.current = quotaByFileName;
  }, [quotaByFileName]);

  useEffect(() => {
    const state = readAuthFilesUiState();
    if (!state) return;
    if (state.tab) setTab(state.tab);
    if (typeof state.filter === "string") setFilter(state.filter);
    if (typeof state.search === "string") setSearch(state.search);
    if (typeof state.page === "number" && Number.isFinite(state.page))
      setPage(Math.max(1, Math.round(state.page)));
  }, []);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "files" || requestedTab === "excluded" || requestedTab === "alias") {
      setTab(requestedTab);
    }
  }, [searchParams]);

  useEffect(() => {
    writeAuthFilesUiState({ tab, filter, search, page });
  }, [filter, page, search, tab]);

  const {
    providerOptions,
    filterCounts,
    filteredFiles,
    totalPages,
    safePage,
    pageItems,
    selectableFilteredFiles,
    selectablePageNames,
    selectedFileNameSet,
    selectedCount,
    allPageSelected,
    somePageSelected,
    allFilteredSelected,
    toggleFileSelection,
    selectCurrentPage,
    selectFilteredFiles,
  } = useAuthFilesListState({
    files,
    filter,
    search,
    page,
    setPage,
    selectedFileNames,
    setSelectedFileNames,
  });

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
          if (now - lastAttempt < 5_000) return false;
          return true;
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
      const CONCURRENCY = 3;
      let idx = 0;

      const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }).map(async () => {
        for (;;) {
          const current = targets[idx];
          idx += 1;
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
      });

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
      if (cancelled) return;
      await runQuotaRefreshBatch(toFetch);
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

  const {
    groupOverviewOpen,
    setGroupOverviewOpen,
    groupOverviewTab,
    setGroupOverviewTab,
    groupOverviewLoading,
    groupTrendLoading,
    formatAveragePercent,
    groupOverviewTabs,
    activeGroupOverview,
    activeGroupRows,
    activeGroupTitle,
    groupOverviewChartOption,
    refreshGroupOverview,
    refreshGroupTrend,
    openGroupOverview,
  } = useAuthFilesGroupOverview({
    filter,
    filteredFiles,
    providerOptions,
    quotaByFileName,
    usageIndex,
    tab,
    collectQuotaFetchTargets,
    runQuotaRefreshBatch,
    resolveQuotaProvider,
    resolveQuotaCardSlots,
    resolveAuthFileStats,
    resolveProviderLabel,
  });

  const filterChips = useMemo(() => ["all", ...providerOptions], [providerOptions]);
  const {
    translateQuotaText,
    formatPlanTypeLabel,
    renderQuotaBar,
    renderFilesViewModeTabs,
    fileColumns,
  } = useAuthFilesFilesPresentation({
    filesViewMode,
    setFilesViewMode,
    quotaPreviewMode,
    setQuotaPreviewMode,
    nowMs,
    allPageSelected,
    somePageSelected,
    selectCurrentPage,
    selectablePageNames,
    selectedFileNameSet,
    toggleFileSelection,
    connectivityState,
    checkAuthFileConnectivity,
    quotaByFileName,
    quotaAutoRefreshingRef,
    refreshQuota,
    openDetail,
    downloadAuthFile,
    statusUpdating,
    setFileEnabled,
    usageIndex,
  });

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(next) => setTab(next as typeof tab)}>
        <TabsList>
          <TabsTrigger value="files">{t("auth_files_page.files_tab")}</TabsTrigger>
          <TabsTrigger value="excluded">{t("auth_files_page.excluded_tab")}</TabsTrigger>
          <TabsTrigger value="alias">{t("auth_files_page.alias_tab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="files">
          <AuthFilesFilesTab
            fileInputRef={fileInputRef}
            handleUpload={handleUpload}
            filterChips={filterChips}
            filter={filter}
            setFilter={setFilter}
            filterCounts={filterCounts}
            search={search}
            setSearch={setSearch}
            quotaLastUpdatedText={quotaLastUpdatedText}
            loading={loading}
            filesLength={files.length}
            renderFilesViewModeTabs={renderFilesViewModeTabs}
            quotaAutoRefreshMs={quotaAutoRefreshMs}
            setQuotaAutoRefreshMsRaw={setQuotaAutoRefreshMsRaw}
            normalizeQuotaAutoRefreshMs={normalizeQuotaAutoRefreshMs}
            openGroupOverview={openGroupOverview}
            groupOverviewLoading={groupOverviewLoading}
            filteredFiles={filteredFiles}
            loadAll={loadAll}
            usageLoading={usageLoading}
            refreshingAll={refreshingAll}
            uploading={uploading}
            setOauthDialogDefaultTab={setOauthDialogDefaultTab}
            setOauthDialogOpen={setOauthDialogOpen}
            selectableFilteredFiles={selectableFilteredFiles}
            selectedCount={selectedCount}
            selectCurrentPage={selectCurrentPage}
            allPageSelected={allPageSelected}
            selectablePageNames={selectablePageNames}
            selectFilteredFiles={selectFilteredFiles}
            allFilteredSelected={allFilteredSelected}
            setSelectedFileNames={setSelectedFileNames}
            setConfirm={setConfirm}
            selectedFileNames={selectedFileNames}
            deletingAll={deletingAll}
            pageItems={pageItems}
            fileColumns={fileColumns}
            filesViewMode={filesViewMode}
            selectedFileNameSet={selectedFileNameSet}
            quotaByFileName={quotaByFileName}
            resolveQuotaProvider={resolveQuotaProvider}
            resolveQuotaCardSlots={resolveQuotaCardSlots}
            quotaAutoRefreshingRef={quotaAutoRefreshingRef}
            refreshQuota={refreshQuota}
            setFileEnabled={setFileEnabled}
            statusUpdating={statusUpdating}
            usageIndex={usageIndex}
            resolveAuthFileStats={resolveAuthFileStats}
            toggleFileSelection={toggleFileSelection}
            formatPlanTypeLabel={formatPlanTypeLabel}
            translateQuotaText={translateQuotaText}
            renderQuotaBar={renderQuotaBar}
            openDetail={openDetail}
            downloadAuthFile={downloadAuthFile}
            safePage={safePage}
            totalPages={totalPages}
            setPage={setPage}
            usageData={usageData}
          />
        </TabsContent>

        <TabsContent value="excluded">
          <AuthFilesExcludedTab
            excludedLoading={excludedLoading}
            isPending={isPending}
            refreshExcluded={refreshExcluded}
            excludedUnsupported={excludedUnsupported}
            excludedNewProvider={excludedNewProvider}
            setExcludedNewProvider={setExcludedNewProvider}
            addExcludedProvider={addExcludedProvider}
            excluded={excluded}
            excludedDraft={excludedDraft}
            setExcludedDraft={setExcludedDraft}
            saveExcludedProvider={saveExcludedProvider}
            deleteExcludedProvider={deleteExcludedProvider}
          />
        </TabsContent>

        <TabsContent value="alias">
          <AuthFilesAliasTab
            aliasLoading={aliasLoading}
            isPending={isPending}
            refreshAlias={refreshAlias}
            aliasUnsupported={aliasUnsupported}
            aliasNewChannel={aliasNewChannel}
            setAliasNewChannel={setAliasNewChannel}
            addAliasChannel={addAliasChannel}
            aliasEditing={aliasEditing}
            setAliasEditing={setAliasEditing}
            openImport={openImport}
            saveAliasChannel={saveAliasChannel}
            deleteAliasChannel={deleteAliasChannel}
          />
        </TabsContent>
      </Tabs>

      <AuthFileDetailModal
        open={detailOpen}
        detailFile={detailFile}
        detailLoading={detailLoading}
        detailText={detailText}
        detailTab={detailTab}
        setDetailOpen={setDetailOpen}
        setDetailTab={setDetailTab}
        loadModelsForDetail={loadModelsForDetail}
        modelsLoading={modelsLoading}
        modelsError={modelsError}
        modelsList={modelsList}
        modelsFileType={modelsFileType}
        excluded={excluded}
        prefixProxyEditor={prefixProxyEditor}
        setPrefixProxyEditor={setPrefixProxyEditor}
        prefixProxyDirty={prefixProxyDirty}
        prefixProxyUpdatedText={prefixProxyUpdatedText}
        savePrefixProxy={savePrefixProxy}
        channelEditor={channelEditor}
        setChannelEditor={setChannelEditor}
        saveChannelEditor={saveChannelEditor}
      />

      <ImportModelsModal
        open={importOpen}
        importChannel={importChannel}
        importLoading={importLoading}
        importModels={importModels}
        importFilteredModels={importFilteredModels}
        importSearch={importSearch}
        setImportSearch={setImportSearch}
        importSelected={importSelected}
        setImportSelected={setImportSelected}
        setImportOpen={setImportOpen}
        applyImport={applyImport}
      />

      <OAuthLoginDialog
        open={oauthDialogOpen}
        defaultTab={oauthDialogDefaultTab}
        onClose={() => setOauthDialogOpen(false)}
        onAuthorized={() => void loadAll()}
      />

      <GroupOverviewModal
        open={groupOverviewOpen}
        onClose={() => setGroupOverviewOpen(false)}
        groupOverviewTab={groupOverviewTab}
        setGroupOverviewTab={setGroupOverviewTab}
        groupOverviewTabs={groupOverviewTabs}
        resolveProviderLabel={resolveProviderLabel}
        groupOverviewLoading={groupOverviewLoading}
        groupTrendLoading={groupTrendLoading}
        refreshGroupOverview={refreshGroupOverview}
        refreshGroupTrend={refreshGroupTrend}
        activeGroupTitle={activeGroupTitle}
        activeGroupRows={activeGroupRows}
        activeGroupOverview={activeGroupOverview}
        formatAveragePercent={formatAveragePercent}
        groupOverviewChartOption={groupOverviewChartOption}
      />

      <ConfirmModal
        open={confirm !== null}
        title={t("auth_files.batch_delete_title")}
        description={t("auth_files.batch_delete_confirm", { count: confirm?.names.length ?? 0 })}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        busy={deletingAll}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          if (!action) return;
          void handleDeleteSelection(action.names).finally(() => setConfirm(null));
        }}
      />
    </div>
  );
}
