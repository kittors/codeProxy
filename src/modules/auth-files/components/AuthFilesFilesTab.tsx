import { useCallback, useEffect, useMemo, useState, type RefObject, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  CircleHelp,
  ClipboardPaste,
  Download,
  Ellipsis,
  Eye,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Tags,
  Upload,
} from "lucide-react";
import type { AuthFileItem } from "@/lib/http/types";
import { Button, buttonClassName } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { HoverTooltip } from "@/modules/ui/Tooltip";
import { Select } from "@/modules/ui/Select";
import { SearchableSelect, type SearchableSelectOption } from "@/modules/ui/SearchableSelect";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import type {
  AuthFileModelOwnerGroup,
  AuthFileStatusFilter,
  FilesViewMode,
  OAuthDialogTab,
  QuotaAutoRefreshMs,
  UsageIndex,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import {
  AUTH_FILE_STATUS_FILTERS,
  TYPE_BADGE_CLASSES,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  resolveAuthFileDisplayName,
  resolveAuthFilePlanType,
  resolveAuthFileSupplementalTags,
  resolveFileType,
  shouldShowAuthFileDisplayTag,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import type { QuotaItem, QuotaState } from "@/modules/quota/quota-helpers";
import type { QuotaProvider } from "@/modules/quota/quota-fetch";

const MAX_FILENAME_PART_LENGTH = 72;
const ACTION_MENU_CONTENT_CLASS =
  "z-[220] min-w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-black/35";
const ACTION_MENU_ITEM_CLASS =
  "flex w-full cursor-default select-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 outline-none transition-colors focus:bg-slate-100 data-[highlighted]:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-45 dark:text-white/75 dark:focus:bg-white/10 dark:data-[highlighted]:bg-white/10";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeFilenamePart = (value: unknown): string => {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text.slice(0, MAX_FILENAME_PART_LENGTH).replace(/^-+|-+$/g, "");
};

const readStringField = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const findJsonValueEnd = (input: string, start: number): number => {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      depth += 1;
      continue;
    }
    if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }

  throw new Error("incomplete json");
};

const parsePastedJsonValues = (input: string): unknown[] => {
  const values: unknown[] = [];
  let index = 0;

  while (index < input.length) {
    while (index < input.length && (/[\s,]/u.test(input[index]) || input[index] === "\uFEFF")) {
      index += 1;
    }
    if (index >= input.length) break;
    const startChar = input[index];
    if (startChar !== "{" && startChar !== "[") {
      throw new Error("invalid json start");
    }
    const end = findJsonValueEnd(input, index);
    values.push(JSON.parse(input.slice(index, end)) as unknown);
    index = end;
  }

  return values;
};

const parsePastedAuthJsonRecords = (input: string): Record<string, unknown>[] => {
  const values = parsePastedJsonValues(input.trim());
  const records: Record<string, unknown>[] = [];

  values.forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (!isPlainObject(item)) throw new Error("json array item is not object");
        records.push(item);
      });
      return;
    }
    if (!isPlainObject(value)) throw new Error("json value is not object");
    records.push(value);
  });

  return records;
};

const buildPastedAuthFileName = (
  record: Record<string, unknown>,
  index: number,
  usedNames: Set<string>,
): string => {
  const provider = sanitizeFilenamePart(readStringField(record, ["type", "provider"])) || "auth";
  const identifier =
    sanitizeFilenamePart(
      readStringField(record, [
        "account_id",
        "chatgpt_account_id",
        "auth_index",
        "authIndex",
        "id",
      ]),
    ) || `import-${index + 1}`;
  const base = `${provider}-${identifier}`.replace(/^-+|-+$/g, "") || `auth-import-${index + 1}`;
  let name = `${base}.json`;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${base}-${suffix}.json`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
};

const buildPastedAuthFiles = (input: string): File[] => {
  const records = parsePastedAuthJsonRecords(input);
  if (records.length === 0) return [];
  const usedNames = new Set<string>();
  return records.map((record, index) => {
    const name = buildPastedAuthFileName(record, index, usedNames);
    return new File([JSON.stringify(record, null, 2)], name, { type: "application/json" });
  });
};

interface AuthFilesFilesTabProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleUpload: (input: FileList | File[] | null) => Promise<void>;
  filterChips: string[];
  filter: string;
  setFilter: (value: string) => void;
  filterCounts: { total: number; counts: Record<string, number> };
  tagFilter: string;
  setTagFilter: (value: string) => void;
  customTagOptions: string[];
  statusFilter: AuthFileStatusFilter;
  setStatusFilter: (value: AuthFileStatusFilter) => void;
  statusFilterCounts: Partial<Record<AuthFileStatusFilter, number>>;
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
  refreshFilesAndQuota: () => Promise<void>;
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
  renderRestrictionBadges: (file: AuthFileItem) => ReactNode | null;
  renderSubscriptionBadge: (file: AuthFileItem) => ReactNode | null;
  renderQuotaBar: (label: string, item: QuotaItem | null) => ReactNode;
  openTagsEditor: (file: AuthFileItem) => void;
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
  tagFilter,
  setTagFilter,
  customTagOptions,
  statusFilter,
  setStatusFilter,
  statusFilterCounts,
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
  refreshFilesAndQuota,
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
  refreshQuota,
  setFileEnabled,
  statusUpdating,
  usageIndex,
  resolveAuthFileStats,
  toggleFileSelection,
  formatPlanTypeLabel,
  translateQuotaText,
  renderRestrictionBadges,
  renderSubscriptionBadge,
  renderQuotaBar,
  openTagsEditor,
  openDetail,
  downloadAuthFile,
  safePage,
  totalPages,
  setPage,
  usageData,
}: AuthFilesFilesTabProps) {
  const { t } = useTranslation();
  const [modelOwnerDialogOpen, setModelOwnerDialogOpen] = useState(false);
  const [draftModelOwner, setDraftModelOwner] = useState(selectedModelOwner);
  const [jsonImportOpen, setJsonImportOpen] = useState(false);
  const [jsonImportText, setJsonImportText] = useState("");
  const [jsonImportError, setJsonImportError] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const normalizedFilter = normalizeProviderKey(filter);
  const canSetModelOwnerGroup = normalizedFilter !== "all";
  const activeFilterCount = [
    normalizedFilter !== "all",
    customTagOptions.length > 0 && tagFilter.trim() !== "",
    statusFilter !== "all",
    search.trim() !== "",
    canSetModelOwnerGroup && selectedModelOwner.trim() !== "",
  ].filter(Boolean).length;
  const draftModelOwnerGroup =
    draftModelOwner === ""
      ? null
      : (modelOwnerGroups.find((group) => group.value === draftModelOwner) ?? null);
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
  const customTagSelectOptions = useMemo<SearchableSelectOption[]>(
    () => [
      {
        value: "",
        label: t("auth_files.all_tags"),
        searchText: t("auth_files.all_tags"),
      },
      ...customTagOptions.map((tag) => ({
        value: tag,
        label: tag,
        searchText: tag,
      })),
    ],
    [customTagOptions, t],
  );
  const statusFilterOptions = useMemo(
    () =>
      AUTH_FILE_STATUS_FILTERS.filter((value) => {
        if (value === "all" || value === statusFilter) return true;
        return (statusFilterCounts[value] ?? 0) > 0;
      }).map((value) => {
        const count = statusFilterCounts[value] ?? 0;
        const label = t(`auth_files.status_filter_${value}`);
        return {
          value,
          label: (
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate">{label}</span>
              <span className="ml-auto inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 px-1 text-[10px] font-semibold tabular-nums text-slate-700 dark:bg-white/10 dark:text-white/70">
                {count}
              </span>
            </span>
          ),
          triggerLabel: `${label} (${count})`,
        };
      }),
    [statusFilter, statusFilterCounts, t],
  );

  useEffect(() => {
    if (!modelOwnerDialogOpen) {
      setDraftModelOwner(selectedModelOwner);
    }
  }, [modelOwnerDialogOpen, selectedModelOwner]);

  const closeJsonImport = useCallback(() => {
    if (uploading) return;
    setJsonImportOpen(false);
    setJsonImportError("");
  }, [uploading]);

  const submitJsonImport = useCallback(async () => {
    setJsonImportError("");
    let files: File[];
    try {
      files = buildPastedAuthFiles(jsonImportText);
    } catch {
      setJsonImportError(t("auth_files.paste_json_invalid"));
      return;
    }

    if (files.length === 0) {
      setJsonImportError(t("auth_files.paste_json_empty"));
      return;
    }

    await handleUpload(files);
    setJsonImportText("");
    setJsonImportOpen(false);
  }, [handleUpload, jsonImportText, t]);

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
          <div className="flex items-center justify-between gap-2 md:hidden">
            <Button
              variant="secondary"
              size="sm"
              className="w-full justify-between px-3"
              aria-controls="auth-files-mobile-filter-panel"
              aria-expanded={mobileFiltersOpen}
              data-testid="auth-files-mobile-filter-toggle"
              onClick={() => setMobileFiltersOpen((open) => !open)}
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <SlidersHorizontal size={15} />
                <span className="truncate">{t("auth_files.filters")}</span>
              </span>
              {activeFilterCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[10px] font-semibold tabular-nums text-white dark:bg-white dark:text-neutral-950">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </div>

          <div
            id="auth-files-mobile-filter-panel"
            data-testid="auth-files-mobile-filter-panel"
            className={[
              mobileFiltersOpen ? "grid" : "hidden",
              "gap-3 md:grid xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] xl:items-start",
            ].join(" ")}
          >
            <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="min-w-0 space-y-1.5">
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
                <div className="flex items-end">
                  <HoverTooltip content={t("auth_files.model_owner_group")} placement="top">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="relative !h-9 !w-9 px-0"
                      onClick={() => {
                        setDraftModelOwner(selectedModelOwner);
                        setModelOwnerDialogOpen(true);
                      }}
                      aria-label={t("auth_files.model_owner_group")}
                    >
                      <Settings2 size={15} />
                      {selectedModelOwner ? (
                        <span
                          aria-hidden="true"
                          className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-neutral-900"
                        />
                      ) : null}
                    </Button>
                  </HoverTooltip>
                </div>
              ) : null}
            </div>

            <div
              className={[
                "grid min-w-0 gap-3",
                customTagOptions.length > 0
                  ? "sm:grid-cols-2 xl:grid-cols-[minmax(0,180px)_minmax(0,170px)_minmax(0,1fr)]"
                  : "sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)]",
                "xl:items-end",
              ].join(" ")}
            >
              {customTagOptions.length > 0 ? (
                <div className="min-w-0 space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-white/65">
                    {t("auth_files.tag_filter")}
                  </p>
                  <SearchableSelect
                    value={tagFilter}
                    onChange={setTagFilter}
                    options={customTagSelectOptions}
                    placeholder={t("auth_files.all_tags")}
                    searchPlaceholder={t("auth_files.tag_filter_search_placeholder")}
                    aria-label={t("auth_files.tag_filter")}
                  />
                </div>
              ) : null}

              <div className="min-w-0 space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-600 dark:text-white/65">
                  {t("auth_files.status_filter")}
                </p>
                <Select
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as AuthFileStatusFilter)}
                  options={statusFilterOptions}
                  placeholder={t("auth_files.status_filter")}
                  aria-label={t("auth_files.status_filter")}
                  disabled={statusFilterOptions.length <= 1 && statusFilter === "all"}
                  className="h-9"
                />
              </div>

              <div className="min-w-0 space-y-1.5">
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

          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
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
            </div>

            <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
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
                  onClick={() => void refreshFilesAndQuota()}
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
              <HoverTooltip content={t("auth_files.paste_json")}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setJsonImportError("");
                    setJsonImportOpen(true);
                  }}
                  disabled={uploading}
                  aria-label={t("auth_files.paste_json")}
                  title={t("auth_files.paste_json")}
                >
                  <ClipboardPaste size={15} />
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
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className={buttonClassName({
                      variant: "secondary",
                      size: "sm",
                      iconOnly: true,
                      className: "!h-8 !w-8",
                    })}
                    aria-label={t("auth_files.selection_actions")}
                    title={t("auth_files.selection_actions")}
                    data-tooltip-placement="top"
                  >
                    <ListChecks size={15} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={8}
                    className={ACTION_MENU_CONTENT_CLASS}
                  >
                    <DropdownMenu.Item
                      className={ACTION_MENU_ITEM_CLASS}
                      disabled={selectablePageNames.length === 0}
                      onSelect={() => selectCurrentPage(!allPageSelected)}
                    >
                      <ListChecks size={15} />
                      <span>
                        {allPageSelected
                          ? t("auth_files.batch_deselect_page")
                          : t("auth_files.batch_select_page")}
                      </span>
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={ACTION_MENU_ITEM_CLASS}
                      disabled={selectableFilteredFiles.length === 0}
                      onSelect={() => selectFilteredFiles(!allFilteredSelected)}
                    >
                      <ListChecks size={15} />
                      <span>
                        {allFilteredSelected
                          ? t("auth_files.batch_deselect_filtered")
                          : t("auth_files.batch_select_filtered")}
                      </span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              {selectedCount > 0 ? (
                <>
                  <span className="ml-1 text-xs font-medium text-slate-600 dark:text-white/65">
                    {t("auth_files.batch_selected", { count: selectedCount })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="!h-8 px-2 text-xs"
                    onClick={() => setSelectedFileNames([])}
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
                    disabled={deletingAll}
                  >
                    {t("auth_files.batch_delete_action", { count: selectedCount })}
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
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
                minWidth="min-w-[1840px]"
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
                className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3"
              >
                {pageItems.map((file) => {
                  const runtimeOnly = isRuntimeOnlyAuthFile(file);
                  const fileDisabled = Boolean(file.disabled);
                  const fileSelected = selectedFileNameSet.has(file.name);
                  const typeKey = resolveFileType(file);
                  const badgeClass = TYPE_BADGE_CLASSES[typeKey] ?? TYPE_BADGE_CLASSES.unknown;
                  const displayTitle = resolveAuthFileDisplayName(file) || String(file.name || "");
                  const provider = resolveQuotaProvider(file);
                  const state = quotaByFileName[file.name] ?? { status: "idle", items: [] };
                  const planType = resolveAuthFilePlanType(file, state);
                  const displayTags = resolveAuthFileSupplementalTags(file, state);
                  const showTypeBadge = shouldShowAuthFileDisplayTag(file, typeKey);
                  const showPlanBadge = planType
                    ? shouldShowAuthFileDisplayTag(file, planType)
                    : false;
                  const subscriptionBadge = renderSubscriptionBadge(file);
                  const stats = resolveAuthFileStats(file, usageIndex);
                  const totalCalls = stats.success + stats.failure;
                  const successRate = totalCalls > 0 ? (stats.success / totalCalls) * 100 : null;
                  const successRateClass =
                    successRate === null
                      ? "text-slate-500 dark:text-white/45"
                      : successRate >= 90
                        ? "text-emerald-700 dark:text-emerald-200"
                        : successRate >= 50
                          ? "text-amber-700 dark:text-amber-200"
                          : "text-rose-700 dark:text-rose-200";

                  const items = Array.isArray(state.items) ? (state.items as QuotaItem[]) : [];
                  const slots = provider ? resolveQuotaCardSlots(provider, items) : [];

                  const quotaRefreshing = provider
                    ? quotaByFileName[file.name]?.status === "loading"
                    : false;
                  const showSelectionControl = fileSelected;

                  return (
                    <Card
                      key={file.name}
                      padding="default"
                      bodyClassName="mt-0 flex min-h-0 flex-1 flex-col"
                      className={[
                        "group flex h-full flex-col transition-colors duration-200 ease-out hover:border-slate-300 hover:bg-white dark:hover:border-neutral-700 dark:hover:bg-neutral-950/70",
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
                          {showTypeBadge ? (
                            <span
                              className={[
                                "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                badgeClass,
                              ].join(" ")}
                            >
                              {typeKey}
                            </span>
                          ) : null}
                          {showPlanBadge && planType ? (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                              {t("codex_quota.plan_label")} {formatPlanTypeLabel(planType)}
                            </span>
                          ) : null}
                          <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-white/70">
                            {t("auth_files.calls_count", { count: totalCalls })}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-white/70">
                            <span>{t("common.success_rate")}</span>
                            <span className={`tabular-nums ${successRateClass}`}>
                              {successRate === null ? "--" : `${successRate.toFixed(1)}%`}
                            </span>
                          </span>
                          {renderRestrictionBadges(file)}
                          {subscriptionBadge}
                          {runtimeOnly ? (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-white dark:text-neutral-950">
                              {t("auth_files.virtual_auth_file")}
                            </span>
                          ) : null}
                        </div>
                        {displayTags.length > 0 ? (
                          <div className="min-w-0 flex flex-wrap gap-1.5">
                            {displayTags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-200"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
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
                          <div className="space-y-2.5">
                            {slots.map((slot) => renderQuotaBar(slot.label, slot.item))}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 dark:text-white/40">--</div>
                        )}
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                        <div className="inline-flex items-center gap-1">
                          {provider ? (
                            <HoverTooltip content={t("common.refresh")}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void refreshQuota(file, provider)}
                                title={t("common.refresh")}
                                aria-label={t("common.refresh")}
                              >
                                <RefreshCw
                                  size={16}
                                  className={quotaRefreshing ? "animate-spin" : ""}
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

                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <button
                                type="button"
                                className={buttonClassName({
                                  variant: "ghost",
                                  size: "sm",
                                  iconOnly: true,
                                })}
                                aria-label={t("auth_files.more_actions")}
                                title={t("auth_files.more_actions")}
                                data-tooltip-placement="top"
                              >
                                <Ellipsis size={16} />
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                align="end"
                                sideOffset={8}
                                className={ACTION_MENU_CONTENT_CLASS}
                              >
                                <DropdownMenu.Item
                                  className={ACTION_MENU_ITEM_CLASS}
                                  onSelect={() => openTagsEditor(file)}
                                >
                                  <Tags size={15} />
                                  <span>{t("auth_files.edit_tags")}</span>
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                  className={ACTION_MENU_ITEM_CLASS}
                                  onSelect={() => void downloadAuthFile(file)}
                                >
                                  <Download size={15} />
                                  <span>{t("auth_files.download")}</span>
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
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

      <Modal
        open={jsonImportOpen}
        title={t("auth_files.paste_json_title")}
        description={t("auth_files.paste_json_description")}
        maxWidth="max-w-3xl"
        bodyHeightClassName="max-h-[72vh]"
        onClose={closeJsonImport}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeJsonImport} disabled={uploading}>
              {t("auth_files.cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void submitJsonImport()}
              disabled={uploading || jsonImportText.trim().length === 0}
            >
              {uploading ? t("auth_files.upload") : t("auth_files.paste_json_upload")}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label
            htmlFor="auth-files-json-import"
            className="text-xs font-semibold text-slate-600 dark:text-white/65"
          >
            {t("auth_files.paste_json_label")}
          </label>
          <textarea
            id="auth-files-json-import"
            value={jsonImportText}
            onChange={(event) => {
              setJsonImportText(event.currentTarget.value);
              if (jsonImportError) setJsonImportError("");
            }}
            spellCheck={false}
            className="min-h-[320px] w-full resize-y rounded-2xl border border-black/[0.06] bg-white px-3.5 py-3 font-mono text-xs leading-5 text-slate-900 shadow-[2px_2px_8px_rgb(0_0_0_/_0.055)] outline-none transition-colors placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-black/10 dark:border-transparent dark:bg-[#27272A] dark:text-white dark:shadow-[0_8px_24px_rgb(0_0_0_/_0.24)] dark:placeholder:text-white/35 dark:focus-visible:ring-white/15"
            placeholder={t("auth_files.paste_json_placeholder")}
            aria-invalid={jsonImportError ? "true" : "false"}
          />
          {jsonImportError ? (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-300">
              {jsonImportError}
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-white/45">
              {t("auth_files.paste_json_hint")}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={modelOwnerDialogOpen}
        title={t("auth_files.model_owner_group")}
        description={canSetModelOwnerGroup ? normalizedFilter : undefined}
        maxWidth="max-w-3xl"
        bodyHeightClassName="max-h-[68vh]"
        onClose={() => setModelOwnerDialogOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModelOwnerDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setSelectedModelOwner(draftModelOwner);
                setModelOwnerDialogOpen(false);
              }}
            >
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-white/80">
                {t("auth_files.model_owner_group")}
              </label>
              <SearchableSelect
                value={draftModelOwner}
                onChange={setDraftModelOwner}
                options={modelOwnerOptions}
                placeholder={t("auth_files.auth_file_models_option")}
                searchPlaceholder={t("auth_files.model_owner_group_search_placeholder")}
                aria-label={t("auth_files.model_owner_group")}
              />
            </div>

            <div className="flex min-w-0 items-center rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-neutral-800 dark:bg-white/[0.04]">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase text-slate-400 dark:text-white/35">
                  {t("auth_files.type_filter")}
                </p>
                <p className="mt-1 truncate font-mono text-sm font-semibold text-slate-900 dark:text-white">
                  {normalizedFilter}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("auth_files.detail_tab_models")}
              </p>
              {draftModelOwnerGroup ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-white/65">
                  {t("auth_files.count_items", { count: draftModelOwnerGroup.models.length })}
                </span>
              ) : null}
            </div>

            {modelOwnerGroupsLoading ? (
              <div className="text-sm text-slate-600 dark:text-white/65">
                {t("common.loading_ellipsis")}
              </div>
            ) : draftModelOwnerGroup ? (
              draftModelOwnerGroup.models.length === 0 ? (
                <EmptyState
                  title={t("common.no_model_data")}
                  description={t("auth_files.no_owner_group_models")}
                />
              ) : (
                <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                  {draftModelOwnerGroup.models.map((model) => {
                    const modelMeta = [
                      model.display_name ? `display_name: ${model.display_name}` : "",
                      model.owned_by ? `owned_by: ${model.owned_by}` : "",
                    ].filter(Boolean);
                    return (
                      <div
                        key={model.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-neutral-800 dark:bg-white/[0.03]"
                      >
                        <p className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-white">
                          {model.id}
                        </p>
                        {modelMeta.length > 0 ? (
                          <p className="mt-1 truncate text-xs text-slate-600 dark:text-white/55">
                            {modelMeta.join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <EmptyState
                title={t("common.no_model_data")}
                description={t("auth_files.auth_file_models_option")}
              />
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
