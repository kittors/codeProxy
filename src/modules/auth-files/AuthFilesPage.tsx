import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { proxiesApi, type ProxyPoolEntry } from "@/lib/http/apis/proxies";
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
import { useAuthFilesQuotaState } from "@/modules/auth-files/hooks/useAuthFilesQuotaState";
import { useAuthFilesGroupOverview } from "@/modules/auth-files/hooks/useAuthFilesGroupOverview";
import { useAuthFilesOAuthConfig } from "@/modules/auth-files/hooks/useAuthFilesOAuthConfig";
import { resolveQuotaProvider } from "@/modules/quota/quota-fetch";
import {
  normalizeQuotaAutoRefreshMs,
  readAuthFilesUiState,
  resolveAuthFileStats,
  resolveProviderLabel,
  writeAuthFilesUiState,
  type OAuthDialogTab,
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
  const [proxyPoolEntries, setProxyPoolEntries] = useState<ProxyPoolEntry[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    void proxiesApi
      .list()
      .then(setProxyPoolEntries)
      .catch(() => setProxyPoolEntries([]));
  }, []);

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

  const {
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
  } = useAuthFilesQuotaState({
    tab,
    pageItems,
    loading,
    setFiles,
    setDetailFile,
  });

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
        proxyPoolEntries={proxyPoolEntries}
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
