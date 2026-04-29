import { useMemo, type RefObject, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  CircleHelp,
  Download,
  Eye,
  Plus,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import type { AuthFileItem } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { HoverTooltip } from "@/modules/ui/Tooltip";
import { Select } from "@/modules/ui/Select";
import { SearchableSelect, type SearchableSelectOption } from "@/modules/ui/SearchableSelect";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import type {
  AuthFileModelOwnerGroup,
  FilesViewMode,
  OAuthDialogTab,
  QuotaAutoRefreshMs,
  UsageIndex,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import {
  TYPE_BADGE_CLASSES,
  formatModified,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  resolveAuthFileDisplayName,
  resolveAuthFilePlanType,
  resolveFileType,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import type { QuotaItem, QuotaState } from "@/modules/quota/quota-helpers";
import type { QuotaProvider } from "@/modules/quota/quota-fetch";

interface AuthFilesFilesTabProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleUpload: (input: FileList | File[] | null) => Promise<void>;
  filterChips: string[];
  filter: string;
  setFilter: (value: string) => void;
  filterCounts: { total: number; counts: Record<string, number> };
  modelOwnerGroupsLoading: boolean;
  modelOwnerGroups: AuthFileModelOwnerGroup[];
  selectedModelOwner: string;
  setSelectedModelOwner: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
  quotaLastUpdatedText: string;
  loading: boolean;
  filesLength: number;
  renderFilesViewModeTabs: ReactNode;
  quotaAutoRefreshMs: QuotaAutoRefreshMs;
  setQuotaAutoRefreshMsRaw: (value: number) => void;
  normalizeQuotaAutoRefreshMs: (value: unknown) => QuotaAutoRefreshMs;
  openGroupOverview: () => void;
  groupOverviewLoading: boolean;
  filteredFiles: AuthFileItem[];
  loadAll: () => Promise<void>;
  usageLoading: boolean;
  refreshingAll: boolean;
  uploading: boolean;
  setOauthDialogDefaultTab: (tab: OAuthDialogTab) => void;
  setOauthDialogOpen: (open: boolean) => void;
  selectableFilteredFiles: AuthFileItem[];
  selectedCount: number;
  selectCurrentPage: (checked: boolean) => void;
  allPageSelected: boolean;
  selectablePageNames: string[];
  selectFilteredFiles: (checked: boolean) => void;
  allFilteredSelected: boolean;
  setSelectedFileNames: (value: string[]) => void;
  setConfirm: (value: null | { type: "deleteSelection"; names: string[] }) => void;
  selectedFileNames: string[];
  deletingAll: boolean;
  pageItems: AuthFileItem[];
  fileColumns: VirtualTableColumn<AuthFileItem>[];
  filesViewMode: FilesViewMode;
  selectedFileNameSet: Set<string>;
  quotaByFileName: Record<string, QuotaState>;
  resolveQuotaProvider: (file: AuthFileItem) => QuotaProvider | null;
  resolveQuotaCardSlots: (
    provider: QuotaProvider,
    items: QuotaItem[],
  ) => { id: string; label: string; item: QuotaItem | null }[];
  quotaAutoRefreshingRef: RefObject<Set<string>>;
  refreshQuota: (file: AuthFileItem, provider: QuotaProvider) => Promise<void>;
  setFileEnabled: (file: AuthFileItem, enabled: boolean) => Promise<void>;
  statusUpdating: Record<string, boolean>;
  usageIndex: UsageIndex;
  resolveAuthFileStats: (
    file: AuthFileItem,
    index: UsageIndex,
  ) => { success: number; failure: number };
  toggleFileSelection: (name: string, checked: boolean) => void;
  formatPlanTypeLabel: (planType: string) => string;
  translateQuotaText: (text: string) => string;
  renderSubscriptionBadge: (file: AuthFileItem) => ReactNode | null;
  renderQuotaBar: (label: string, item: QuotaItem | null) => ReactNode;
  openDetail: (file: AuthFileItem) => Promise<void>;
  downloadAuthFile: (file: AuthFileItem) => Promise<void>;
  safePage: number;
  totalPages: number;
  setPage: (value: number | ((prev: number) => number)) => void;
  usageData: unknown;
}

export function AuthFilesFilesTab({
  fileInputRef,
  handleUpload,
  filterChips,
  filter,
  setFilter,
  filterCounts,
  modelOwnerGroupsLoading,
  modelOwnerGroups,
  selectedModelOwner,
  setSelectedModelOwner,
  search,
  setSearch,
  quotaLastUpdatedText,
  loading,
  filesLength,
  renderFilesViewModeTabs,
  quotaAutoRefreshMs,
  setQuotaAutoRefreshMsRaw,
  normalizeQuotaAutoRefreshMs,
  openGroupOverview,
  groupOverviewLoading,
  filteredFiles,
  loadAll,
  usageLoading,
  refreshingAll,
  uploading,
  setOauthDialogDefaultTab,
  setOauthDialogOpen,
  selectableFilteredFiles,
  selectedCount,
  selectCurrentPage,
  allPageSelected,
  selectablePageNames,
  selectFilteredFiles,
  allFilteredSelected,
  setSelectedFileNames,
  setConfirm,
  selectedFileNames,
  deletingAll,
  pageItems,
  fileColumns,
  filesViewMode,
  selectedFileNameSet,
  quotaByFileName,
  resolveQuotaProvider,
  resolveQuotaCardSlots,
  quotaAutoRefreshingRef,
  refreshQuota,
  setFileEnabled,
  statusUpdating,
  usageIndex,
  resolveAuthFileStats,
  toggleFileSelection,
  formatPlanTypeLabel,
  translateQuotaText,
  renderSubscriptionBadge,
  renderQuotaBar,
  openDetail,
  downloadAuthFile,
  safePage,
  totalPages,
  setPage,
  usageData,
}: AuthFilesFilesTabProps) {
  const { t } = useTranslation();
  const normalizedFilter = normalizeProviderKey(filter);
  const canSetModelOwnerGroup = normalizedFilter !== "all";
  const selectedModelOwnerGroup =
    selectedModelOwner === ""
      ? null
      : (modelOwnerGroups.find((group) => group.value === selectedModelOwner) ?? null);
  const modelOwnerOptions = useMemo<SearchableSelectOption[]>(
    () => [
      {
        value: "",
        label: t("auth_files.auth_file_models_option"),
        searchText: t("auth_files.auth_file_models_option"),
      },
      ...modelOwnerGroups.map((group) => ({
        value: group.value,
        label: group.label,
        searchText: `${group.value} ${group.label} ${group.description}`,
      })),
    ],
    [modelOwnerGroups, t],
  );

  return (
    <div className="mt-3 space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        multiple
        className="hidden"
        onChange={(e) => void handleUpload(e.currentTarget.files)}
      />

      <Card padding="compact">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-end">
              <div className="w-fit max-w-full space-y-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-white/65">
                    {t("auth_files.type_filter")}
                  </p>
                  <HoverTooltip content={t("auth_files.count_hint")} placement="top">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 dark:text-white/45"
                      aria-label={t("auth_files.count_info")}
                    >
                      <CircleHelp size={14} />
                    </span>
                  </HoverTooltip>
                </div>
                <Tabs value={filter} onValueChange={setFilter}>
                  <TabsList>
                    {filterChips.map((key) => {
                      const active = filter === key;
                      const normalizedKey = normalizeProviderKey(key);
                      const count =
                        key === "all"
                          ? filterCounts.total
                          : (filterCounts.counts[normalizedKey] ?? 0);
                      const label = key === "all" ? t("auth_files.all") : key;
                      const countClass = active
                        ? "bg-black/[0.06] text-[#18181B] dark:bg-white/12 dark:text-white"
                        : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/70";
                      return (
                        <TabsTrigger key={key} value={key}>
                          {label}
                          <span
                            className={[
                              "ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                              countClass,
                            ].join(" ")}
                          >
                            {count}
                          </span>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>
              </div>

              {canSetModelOwnerGroup ? (
                <div className="w-full max-w-[300px] space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-white/65">
                    {t("auth_files.model_owner_group")}
                  </p>
                  <SearchableSelect
                    value={selectedModelOwner}
                    onChange={setSelectedModelOwner}
                    options={modelOwnerOptions}
                    placeholder={t("auth_files.auth_file_models_option")}
                    searchPlaceholder={t("auth_files.model_owner_group_search_placeholder")}
                    aria-label={t("auth_files.model_owner_group")}
                  />
                  <p className="truncate text-[11px] text-slate-500 dark:text-white/50">
                    {modelOwnerGroupsLoading
                      ? t("common.loading_ellipsis")
                      : selectedModelOwnerGroup
                        ? t("auth_files.model_owner_group_source_desc", {
                            owner: selectedModelOwnerGroup.label,
                            count: selectedModelOwnerGroup.models.length,
                          })
                        : t("auth_files.auth_file_models_source_desc")}
                  </p>
                </div>
              ) : null}

              <div className="w-full max-w-[560px] space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-600 dark:text-white/65">
                  {t("auth_files.search")}
                </p>
                <TextInput
                  value={search}
                  onChange={(e) => setSearch(e.currentTarget.value)}
                  placeholder={t("auth_files_page.filename_hint")}
                  endAdornment={<Search size={16} className="text-slate-400" />}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-white/45">
                <span className="font-medium">{t("auth_files.quota_updated_at")}</span>
                <span className="font-mono tabular-nums">
                  {loading && filesLength === 0 ? "--" : quotaLastUpdatedText}
                </span>
              </div>

              <div className={loading && filesLength === 0 ? "pointer-events-none opacity-60" : ""}>
                {renderFilesViewModeTabs}
              </div>

              <div className="inline-flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-white/45">
                  {t("auth_files.quota_auto_refresh")}
                </span>
                <div
                  className={loading && filesLength === 0 ? "pointer-events-none opacity-60" : ""}
                >
                  <Select
                    value={String(quotaAutoRefreshMs)}
                    onChange={(value) =>
                      setQuotaAutoRefreshMsRaw(normalizeQuotaAutoRefreshMs(value))
                    }
                    options={[
                      { value: "0", label: t("auth_files.quota_refresh_off") },
                      { value: "5000", label: "5s" },
                      { value: "10000", label: "10s" },
                      { value: "30000", label: "30s" },
                      { value: "60000", label: "60s" },
                    ]}
                    aria-label={t("auth_files.quota_auto_refresh")}
                    variant="chip"
                    className="w-[88px]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="!h-8 px-2 text-xs"
                  onClick={openGroupOverview}
                  disabled={loading || groupOverviewLoading || filteredFiles.length === 0}
                >
                  <BarChart3 size={14} className={groupOverviewLoading ? "animate-pulse" : ""} />
                  {t("auth_files.group_overview_button")}
                </Button>
                <HoverTooltip content={t("auth_files.refresh")}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void loadAll()}
                    disabled={loading || usageLoading || refreshingAll}
                    aria-label={t("auth_files.refresh")}
                    title={t("auth_files.refresh")}
                  >
                    <RefreshCw
                      size={15}
                      className={loading || usageLoading || refreshingAll ? "animate-spin" : ""}
                    />
                  </Button>
                </HoverTooltip>
                <HoverTooltip content={t("auth_files.upload")}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    aria-label={t("auth_files.upload")}
                    title={t("auth_files.upload")}
                  >
                    <Upload size={15} />
                  </Button>
                </HoverTooltip>
                <HoverTooltip content={t("auth_files_page.add_oauth")}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const normalized = normalizeProviderKey(filter);
                      const oauthTab =
                        normalized === "codex" ||
                        normalized === "anthropic" ||
                        normalized === "antigravity" ||
                        normalized === "gemini-cli" ||
                        normalized === "kimi" ||
                        normalized === "qwen"
                          ? (normalized as OAuthDialogTab)
                          : "codex";
                      setOauthDialogDefaultTab(oauthTab);
                      setOauthDialogOpen(true);
                    }}
                    aria-label={t("auth_files_page.add_oauth")}
                    title={t("auth_files_page.add_oauth")}
                  >
                    <Plus size={15} />
                  </Button>
                </HoverTooltip>
              </div>
            </div>

            {selectableFilteredFiles.length > 0 || selectedCount > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-50/80 px-2 py-1.5 transition-colors duration-200 ease-out dark:bg-white/[0.03]">
                <Button
                  variant="secondary"
                  size="sm"
                  className="!h-8 px-2 text-xs"
                  onClick={() => selectCurrentPage(!allPageSelected)}
                  disabled={selectablePageNames.length === 0}
                >
                  {allPageSelected
                    ? t("auth_files.batch_deselect_page")
                    : t("auth_files.batch_select_page")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="!h-8 px-2 text-xs"
                  onClick={() => selectFilteredFiles(!allFilteredSelected)}
                  disabled={selectableFilteredFiles.length === 0}
                >
                  {allFilteredSelected
                    ? t("auth_files.batch_deselect_filtered")
                    : t("auth_files.batch_select_filtered")}
                </Button>
                <span className="ml-1 text-xs font-medium text-slate-600 dark:text-white/65">
                  {t("auth_files.batch_selected", { count: selectedCount })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="!h-8 px-2 text-xs"
                  onClick={() => setSelectedFileNames([])}
                  disabled={selectedCount === 0}
                >
                  {t("auth_files.batch_clear")}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  className="!h-8 px-2 text-xs"
                  onClick={() =>
                    setConfirm({ type: "deleteSelection", names: [...selectedFileNames] })
                  }
                  disabled={selectedCount === 0 || deletingAll}
                >
                  {t("auth_files.batch_delete_action", { count: selectedCount })}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {loading && filesLength === 0 ? (
        <Card padding="none" className="relative overflow-hidden">
          <div className="p-4 sm:p-5" data-testid="auth-files-table-skeleton">
            <div className="space-y-2">
              {Array.from({ length: 7 }).map((_, idx) => (
                <div
                  key={`s-${idx}`}
                  className="h-[84px] rounded-xl bg-slate-50/80 transition-colors duration-200 ease-out motion-safe:animate-pulse dark:bg-white/[0.03]"
                />
              ))}
            </div>
          </div>
        </Card>
      ) : pageItems.length === 0 ? (
        <EmptyState
          title={t("auth_files_page.no_files")}
          description={t("auth_files_page.no_files_desc")}
        />
      ) : (
        <Card padding="none" className="relative overflow-hidden">
          <div className="p-4 sm:p-5">
            {filesViewMode === "table" ? (
              <VirtualTable<AuthFileItem>
                rows={pageItems}
                columns={fileColumns}
                rowKey={(row) => row.name}
                loading={false}
                virtualize={false}
                rowHeight={84}
                caption={t("auth_files.table_caption")}
                emptyText={t("auth_files_page.no_files_desc")}
                minWidth="min-w-[1960px]"
                height="h-[calc(100dvh-452px)]"
                rowClassName={(row) => {
                  const runtimeOnly = isRuntimeOnlyAuthFile(row);
                  const disabled = Boolean(row.disabled);
                  const selected = selectedFileNameSet.has(row.name);
                  return [
                    selected
                      ? "bg-slate-100/80 dark:bg-white/[0.08] hover:bg-slate-100 dark:hover:bg-white/[0.1]"
                      : "",
                    runtimeOnly
                      ? "bg-slate-50/80 dark:bg-neutral-950/55 hover:bg-slate-100/80 dark:hover:bg-neutral-900/60"
                      : "",
                    disabled ? "opacity-85" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                }}
              />
            ) : (
              <div
                data-testid="auth-files-cards"
                className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
              >
                {pageItems.map((file) => {
                  const runtimeOnly = isRuntimeOnlyAuthFile(file);
                  const fileDisabled = Boolean(file.disabled);
                  const fileSelected = selectedFileNameSet.has(file.name);
                  const typeKey = resolveFileType(file);
                  const badgeClass = TYPE_BADGE_CLASSES[typeKey] ?? TYPE_BADGE_CLASSES.unknown;
                  const displayTitle = resolveAuthFileDisplayName(file) || String(file.name || "");
                  const planType = resolveAuthFilePlanType(file);
                  const subscriptionBadge = renderSubscriptionBadge(file);
                  const stats = resolveAuthFileStats(file, usageIndex);
                  const totalCalls = stats.success + stats.failure;

                  const provider = resolveQuotaProvider(file);
                  const state = quotaByFileName[file.name] ?? { status: "idle", items: [] };
                  const items = Array.isArray(state.items) ? (state.items as QuotaItem[]) : [];
                  const slots = provider ? resolveQuotaCardSlots(provider, items) : [];

                  const quotaRefreshing = provider
                    ? quotaByFileName[file.name]?.status === "loading"
                    : false;
                  const quotaAutoRefreshing = quotaAutoRefreshingRef.current.has(file.name);
                  const showSelectionControl = fileSelected;

                  return (
                    <Card
                      key={file.name}
                      padding="default"
                      bodyClassName="mt-0"
                      className={[
                        "group transition-colors duration-200 ease-out hover:border-slate-300 hover:bg-white dark:hover:border-neutral-700 dark:hover:bg-neutral-950/70",
                        fileSelected
                          ? "border-slate-900 ring-1 ring-slate-300 dark:border-white dark:ring-white/20"
                          : "",
                        runtimeOnly ? "opacity-90" : "",
                        fileDisabled ? "opacity-85" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {displayTitle}
                            </span>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            {runtimeOnly ? null : (
                              <div
                                className={[
                                  "flex h-8 items-center justify-center px-1 transition-opacity",
                                  showSelectionControl
                                    ? "opacity-100 pointer-events-auto"
                                    : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
                                ].join(" ")}
                              >
                                <input
                                  type="checkbox"
                                  aria-label={t("auth_files.select_file", {
                                    name: displayTitle || file.name,
                                  })}
                                  checked={fileSelected}
                                  onChange={(e) =>
                                    toggleFileSelection(file.name, e.currentTarget.checked)
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-slate-900 accent-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:accent-white dark:focus-visible:ring-white/15"
                                />
                              </div>
                            )}
                            {runtimeOnly ? (
                              <span className="text-xs text-slate-400 dark:text-white/40">--</span>
                            ) : (
                              <ToggleSwitch
                                ariaLabel={t("auth_files.enable_disable")}
                                checked={!fileDisabled}
                                onCheckedChange={(enabled) => void setFileEnabled(file, enabled)}
                                disabled={Boolean(statusUpdating[file.name])}
                              />
                            )}
                          </div>
                        </div>

                        <div className="min-w-0 flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              badgeClass,
                            ].join(" ")}
                          >
                            {typeKey}
                          </span>
                          {planType ? (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                              {t("codex_quota.plan_label")} {formatPlanTypeLabel(planType)}
                            </span>
                          ) : null}
                          <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-white/70">
                            {t("auth_files.calls_count", { count: totalCalls })}
                          </span>
                          {subscriptionBadge}
                          {runtimeOnly ? (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-white dark:text-neutral-950">
                              {t("auth_files.virtual_auth_file")}
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-[11px] text-slate-500 dark:text-white/45">
                          {formatModified(file)}
                        </p>
                      </div>

                      <div
                        className="mt-4 min-w-0 rounded-2xl bg-slate-50/85 px-3 py-3 transition-colors duration-200 ease-out dark:bg-white/[0.03]"
                        data-testid="auth-file-card-quota"
                      >
                        {provider && (state.status === "error" || state.error) ? (
                          <p className="truncate text-[11px] font-semibold text-rose-700 dark:text-rose-200">
                            {translateQuotaText(state.error ?? t("common.error"))}
                          </p>
                        ) : null}

                        {!provider ? (
                          <div className="text-xs text-slate-400 dark:text-white/40">--</div>
                        ) : slots.length > 0 ? (
                          <div className="space-y-3">
                            {slots.map((slot) => renderQuotaBar(slot.label, slot.item))}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 dark:text-white/40">--</div>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1">
                          {provider ? (
                            <HoverTooltip content={t("common.refresh")}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void refreshQuota(file, provider)}
                                title={t("common.refresh")}
                                aria-label={t("common.refresh")}
                                disabled={quotaRefreshing}
                              >
                                <RefreshCw
                                  size={16}
                                  className={
                                    quotaRefreshing && !quotaAutoRefreshing ? "animate-spin" : ""
                                  }
                                />
                              </Button>
                            </HoverTooltip>
                          ) : null}

                          <HoverTooltip content={t("auth_files.view")}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void openDetail(file)}
                              title={t("auth_files.view")}
                              aria-label={t("auth_files.view")}
                            >
                              <Eye size={16} />
                            </Button>
                          </HoverTooltip>

                          <HoverTooltip content={t("auth_files.download")}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void downloadAuthFile(file)}
                              title={t("auth_files.download")}
                              aria-label={t("auth_files.download")}
                            >
                              <Download size={16} />
                            </Button>
                          </HoverTooltip>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-600 dark:text-white/65 tabular-nums">
          {t("auth_files.total_page", {
            total: filteredFiles.length,
            page: safePage,
            pages: totalPages,
          })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={safePage <= 1}
          >
            {t("auth_files.prev")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={safePage >= totalPages}
          >
            {t("auth_files.next")}
          </Button>
        </div>
      </div>

      {usageData ? null : (
        <p className="text-xs text-slate-500 dark:text-white/55">
          {t("auth_files.usage_stats_warning")}
        </p>
      )}
    </div>
  );
}
