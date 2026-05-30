import { useCallback, useEffect, useMemo, useState, type RefObject, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
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
import { DataTable, type DataTableColumn } from "@/modules/ui/DataTable";
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
import {
  parseIdTokenPayload,
  type QuotaItem,
  type QuotaState,
} from "@/modules/quota/quota-helpers";
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

const sanitizeCodexFilenamePart = (value: unknown): string =>
  Array.from(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  )
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || char === "/" || char === "\\" ? "-" : char;
    })
    .join("")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_FILENAME_PART_LENGTH)
    .replace(/^-+|-+$/g, "");

const readStringField = (record: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const readNestedStringField = (
  records: readonly (Record<string, unknown> | undefined)[],
  keys: string[],
): string => {
  for (const record of records) {
    if (!record) continue;
    const value = readStringField(record, keys);
    if (value) return value;
  }
  return "";
};

const normalizeDedupKeyPart = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const codexFilenamePlanSuffixes = new Set([
  "plus",
  "pro",
  "free",
  "team",
  "premium",
  "business",
  "enterprise",
]);

const parseCodexFilenameIdentity = (fileName: string): { accountId?: string; email?: string } => {
  const normalized = String(fileName ?? "")
    .trim()
    .toLowerCase();
  const base = normalized.replace(/\.json$/u, "");
  if (!base.startsWith("codex-")) return {};
  const rest = base.slice("codex-".length);
  if (!rest) return {};
  const parts = rest.split("-").filter(Boolean);
  if (parts.length === 0) return {};

  const emailIndex = parts.findIndex((part) => part.includes("@"));
  if (emailIndex >= 0) {
    const email = parts[emailIndex] ?? "";
    const accountId = parts.slice(0, emailIndex).join("-");
    return {
      ...(accountId ? { accountId } : {}),
      ...(email ? { email } : {}),
    };
  }

  const lastPart = parts.at(-1) ?? "";
  if (codexFilenamePlanSuffixes.has(lastPart) && parts.length > 1) {
    return { email: parts.slice(0, -1).join("-") };
  }

  return { accountId: rest };
};

const collectAuthIdentityKeys = (record: Record<string, unknown>): string[] => {
  const credentials = isPlainObject(record.credentials) ? record.credentials : undefined;
  const metadata = isPlainObject(record.metadata) ? record.metadata : undefined;
  const attributes = isPlainObject(record.attributes) ? record.attributes : undefined;
  const provider =
    normalizeProviderKey(
      readNestedStringField([credentials, metadata, attributes, record], ["type", "provider"]),
    ) || "auth";
  const idTokenCandidate =
    credentials?.id_token ?? metadata?.id_token ?? attributes?.id_token ?? record.id_token;
  const parsedIdToken = parseIdTokenPayload(idTokenCandidate);
  const nestedIdToken = isPlainObject(parsedIdToken?.["https://api.openai.com/auth"])
    ? (parsedIdToken?.["https://api.openai.com/auth"] as Record<string, unknown>)
    : undefined;

  const accountId = readNestedStringField(
    [credentials, metadata, attributes, nestedIdToken, parsedIdToken ?? undefined, record],
    ["chatgpt_account_id", "chatgptAccountId", "account_id", "accountId"],
  );
  const email = readNestedStringField([credentials, metadata, attributes, record], ["email"]);
  const label = readNestedStringField([credentials, metadata, attributes, record], ["label"]);
  const fileName = readNestedStringField([record], ["name"]);
  const filenameIdentity =
    provider === "codex" && fileName ? parseCodexFilenameIdentity(fileName) : {};

  return [
    ...(accountId ? [`${provider}:account:${normalizeDedupKeyPart(accountId)}`] : []),
    ...(email ? [`${provider}:email:${normalizeDedupKeyPart(email)}`] : []),
    ...(label ? [`${provider}:label:${normalizeDedupKeyPart(label)}`] : []),
    ...(filenameIdentity.accountId
      ? [`${provider}:account:${normalizeDedupKeyPart(filenameIdentity.accountId)}`]
      : []),
    ...(filenameIdentity.email
      ? [`${provider}:email:${normalizeDedupKeyPart(filenameIdentity.email)}`]
      : []),
    ...(fileName ? [`${provider}:file:${normalizeDedupKeyPart(fileName)}`] : []),
  ];
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

const findNextJsonValueStart = (input: string, start: number): number => {
  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (char === "{" || char === "[") {
      return index;
    }
  }
  return -1;
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
      const nextIndex = findNextJsonValueStart(input, index + 1);
      if (nextIndex === -1) break;
      index = nextIndex;
      continue;
    }
    const end = findJsonValueEnd(input, index);
    values.push(JSON.parse(input.slice(index, end)) as unknown);
    index = end;
  }

  return values;
};

const parsePastedAuthJsonRecords = (input: string): Record<string, unknown>[] => {
  const values = parsePastedJsonValues(input);
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

const normalizeCodexPlanType = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const encodeBase64UrlJson = (value: unknown): string => {
  const raw = JSON.stringify(value);
  if (typeof btoa === "function") {
    return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
  }
  const buffer = (globalThis as { Buffer?: { from: (input: string, encoding: string) => unknown } })
    .Buffer;
  if (buffer?.from) {
    const bytes = buffer.from(raw, "utf-8") as { toString: (encoding: string) => string };
    return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
  }
  throw new Error("base64url encoder is unavailable");
};

const buildSyntheticCodexIdToken = (input: {
  accountId: string;
  email: string;
  expiresAt: Date;
  issuedAt: Date;
  planType: string;
  userId: string;
}): string => {
  const header = { alg: "none", typ: "JWT", cpa_synthetic: true };
  const payload = {
    iat: Math.floor(input.issuedAt.getTime() / 1000),
    exp: Math.floor(input.expiresAt.getTime() / 1000),
    "https://api.openai.com/auth": {
      chatgpt_account_id: input.accountId,
      chatgpt_plan_type: input.planType,
      chatgpt_user_id: input.userId,
      user_id: input.userId,
    },
    email: input.email,
  };
  return `${encodeBase64UrlJson(header)}.${encodeBase64UrlJson(payload)}.synthetic`;
};

const buildSyntheticCodexAuthRecord = (
  account: Record<string, unknown>,
  issuedAt: Date,
): Record<string, unknown> | null => {
  const credentials = isPlainObject(account.credentials) ? account.credentials : undefined;
  const email = readNestedStringField([credentials, account], ["email", "name"]);
  const accountId = readNestedStringField(
    [credentials, account],
    ["chatgpt_account_id", "account_id"],
  );
  const userId = readNestedStringField([credentials, account], ["chatgpt_user_id", "user_id"]);
  const planType = normalizeCodexPlanType(
    readNestedStringField([credentials, account], ["plan_type", "chatgpt_plan_type"]),
  );
  const accessToken = readNestedStringField([credentials, account], ["access_token"]);
  const refreshToken = readNestedStringField([credentials, account], ["refresh_token"]);
  const expired = readNestedStringField([credentials, account], ["expires_at", "expired"]);
  if (!email || !accountId || !accessToken || !expired || !userId) {
    return null;
  }

  const expiresAt = new Date(expired);
  if (Number.isNaN(expiresAt.getTime())) return null;

  const normalizedPlanType = planType || "plus";
  return {
    type: "codex",
    account_id: accountId,
    chatgpt_account_id: accountId,
    email,
    name: email,
    plan_type: normalizedPlanType,
    chatgpt_plan_type: normalizedPlanType,
    id_token: buildSyntheticCodexIdToken({
      accountId,
      email,
      expiresAt,
      issuedAt,
      planType: normalizedPlanType,
      userId,
    }),
    id_token_synthetic: true,
    access_token: accessToken,
    refresh_token: refreshToken,
    last_refresh: issuedAt.toISOString(),
    expired,
  };
};

const buildPastedAuthBundleRecords = (
  record: Record<string, unknown>,
  issuedAt: Date,
): Record<string, unknown>[] | null => {
  const accounts = record.accounts;
  if (!Array.isArray(accounts)) return null;

  return accounts.map((account, accountIndex) => {
    if (!isPlainObject(account)) {
      throw new Error(`bundle account ${accountIndex + 1} is not object`);
    }
    const synthesized = buildSyntheticCodexAuthRecord(account, issuedAt);
    if (!synthesized) {
      throw new Error(`bundle account ${accountIndex + 1} is not a supported Codex export`);
    }
    return synthesized;
  });
};

const buildPastedAuthFileName = (
  record: Record<string, unknown>,
  index: number,
  usedNames: Set<string>,
): string => {
  const provider = sanitizeFilenamePart(readStringField(record, ["type", "provider"])) || "auth";
  const email = readStringField(record, ["email", "name"]);
  const planType = normalizeCodexPlanType(
    readStringField(record, ["plan_type", "chatgpt_plan_type"]),
  );
  const identifier =
    provider === "codex" && email
      ? `codex-${sanitizeCodexFilenamePart(email)}${planType ? `-${planType}` : ""}`
      : sanitizeFilenamePart(
          readStringField(record, [
            "account_id",
            "chatgpt_account_id",
            "auth_index",
            "authIndex",
            "id",
          ]),
        ) || `import-${index + 1}`;
  const base =
    provider === "codex" && email
      ? identifier
      : `${provider}-${identifier}`.replace(/^-+|-+$/g, "") || `auth-import-${index + 1}`;
  let name = `${base}.json`;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = `${base}-${suffix}.json`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
};

const buildPastedAuthFiles = (input: string, existingFiles: AuthFileItem[] = []): File[] => {
  const records = parsePastedAuthJsonRecords(input);
  if (records.length === 0) return [];
  const issuedAt = new Date();
  const normalizedRecords: Record<string, unknown>[] = [];
  records.forEach((record) => {
    const bundledRecords = buildPastedAuthBundleRecords(record, issuedAt);
    if (bundledRecords) {
      normalizedRecords.push(...bundledRecords);
      return;
    }
    normalizedRecords.push(record);
  });
  const usedNames = new Set<string>();
  const usedIdentityKeys = new Set<string>();
  existingFiles.forEach((file) => {
    collectAuthIdentityKeys(file).forEach((key) => usedIdentityKeys.add(key));
  });

  const files: File[] = [];
  normalizedRecords.forEach((record, index) => {
    const identityKeys = collectAuthIdentityKeys(record);
    if (identityKeys.some((key) => usedIdentityKeys.has(key))) {
      return;
    }
    identityKeys.forEach((key) => usedIdentityKeys.add(key));
    const name = buildPastedAuthFileName(record, index, usedNames);
    files.push(new File([JSON.stringify(record, null, 2)], name, { type: "application/json" }));
  });

  return files;
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
  loading: boolean;
  files: AuthFileItem[];
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
  fileColumns: DataTableColumn<AuthFileItem>[];
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
  loading,
  files,
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
  const selectedModelOwnerGroup =
    selectedModelOwner === ""
      ? null
      : (modelOwnerGroups.find((group) => group.value === selectedModelOwner) ?? null);
  const showSelectionActions = selectableFilteredFiles.length > 0 || selectedCount > 0;
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
    let uploadFiles: File[];
    try {
      uploadFiles = buildPastedAuthFiles(jsonImportText, files);
    } catch {
      setJsonImportError(t("auth_files.paste_json_invalid"));
      return;
    }

    if (uploadFiles.length === 0) {
      setJsonImportError(t("auth_files.paste_json_empty"));
      return;
    }

    await handleUpload(uploadFiles);
    setJsonImportText("");
    setJsonImportOpen(false);
  }, [files, handleUpload, jsonImportText, t]);

  const selectionActionsMenu = showSelectionActions ? (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={buttonClassName({
            variant: "secondary",
            size: "sm",
            iconOnly: true,
          })}
          aria-label={t("auth_files.selection_actions")}
          title={t("auth_files.selection_actions")}
          data-tooltip-placement="top"
        >
          <ListChecks size={15} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className={ACTION_MENU_CONTENT_CLASS}>
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
  ) : null;

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

          <Tabs value={filter} onValueChange={setFilter} size="sm">
            <TabsList className="max-w-full">
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

          <div
            id="auth-files-mobile-filter-panel"
            data-testid="auth-files-mobile-filter-panel"
            className={[
              mobileFiltersOpen ? "grid" : "hidden",
              "gap-x-1.5 md:grid",
            ].join(" ")}
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex min-w-0 flex-wrap items-start gap-x-1.5 gap-y-2">
                {canSetModelOwnerGroup ? (
                  <div className="min-w-0 basis-[140px]">
                    <div className="space-y-1.5">
                      <p className="truncate text-[11px] font-semibold text-slate-600 dark:text-white/65">
                        {t("auth_files.model_owner_group")}
                      </p>
                      <HoverTooltip content={t("auth_files.model_owner_group")} placement="top">
                        <Button
                          variant="secondary"
                          size="sm"
                          className={[
                            "relative w-full justify-start px-2.5 text-xs",
                            selectedModelOwner
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-100 dark:hover:bg-emerald-400/15"
                              : "bg-[#EBEBEC] text-[#3F3F46] hover:bg-[#E4E4E7] dark:bg-[#27272A] dark:text-white/75 dark:hover:bg-[#303036]",
                          ].join(" ")}
                          onClick={() => {
                            setDraftModelOwner(selectedModelOwner);
                            setModelOwnerDialogOpen(true);
                          }}
                          aria-label={t("auth_files.model_owner_group")}
                        >
                          <Settings2 size={15} className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-left">
                            {selectedModelOwnerGroup?.label ??
                              (selectedModelOwner || t("auth_files.auth_file_models_option"))}
                          </span>
                          {selectedModelOwner ? (
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                            />
                          ) : null}
                        </Button>
                      </HoverTooltip>
                    </div>
                  </div>
                ) : null}

                {customTagOptions.length > 0 ? (
                  <div className="min-w-0 basis-[140px]">
                    <div className="space-y-1.5">
                      <p className="truncate text-[11px] font-semibold text-slate-600 dark:text-white/65">
                        {t("auth_files.tag_filter")}
                      </p>
                      <SearchableSelect
                        value={tagFilter}
                        onChange={setTagFilter}
                        options={customTagSelectOptions}
                        placeholder={t("auth_files.all_tags")}
                        searchPlaceholder={t("auth_files.tag_filter_search_placeholder")}
                        aria-label={t("auth_files.tag_filter")}
                        size="sm"
                      />
                    </div>
                  </div>
                ) : null}

                <div className="min-w-0 basis-[120px]">
                  <div className="space-y-1.5">
                    <p className="truncate text-[11px] font-semibold text-slate-600 dark:text-white/65">
                      {t("auth_files.status_filter")}
                    </p>
                    <Select
                      value={statusFilter}
                      onChange={(value) => setStatusFilter(value as AuthFileStatusFilter)}
                      options={statusFilterOptions}
                      placeholder={t("auth_files.status_filter")}
                      aria-label={t("auth_files.status_filter")}
                      disabled={statusFilterOptions.length <= 1 && statusFilter === "all"}
                      size="sm"
                    />
                  </div>
                </div>

                <div className="min-w-0 basis-[120px]">
                  <div className="space-y-1.5">
                    <p className="truncate text-[11px] font-semibold text-slate-600 dark:text-white/65">
                      {t("auth_files.quota_auto_refresh")}
                    </p>
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
                        className="w-full"
                        size="sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="min-w-0 basis-[180px]">
                  <div className="space-y-1.5">
                    <p className="truncate text-[11px] font-semibold text-slate-600 dark:text-white/65">
                      {t("auth_files.search")}
                    </p>
                    <TextInput
                      value={search}
                      onChange={(e) => setSearch(e.currentTarget.value)}
                      placeholder={t("auth_files_page.filename_hint")}
                      aria-label={t("auth_files.search")}
                      endAdornment={<Search size={16} className="text-slate-400" />}
                      size="sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <div className={loading && filesLength === 0 ? "pointer-events-none opacity-60" : ""}>
                  {renderFilesViewModeTabs}
                </div>
                {selectedCount === 0 ? selectionActionsMenu : null}
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
          </div>

          {selectedCount > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-50/80 px-2 py-1.5 transition-colors duration-200 ease-out dark:bg-white/[0.03]">
              {selectionActionsMenu}
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
              <DataTable<AuthFileItem>
                tableId="auth-files"
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
