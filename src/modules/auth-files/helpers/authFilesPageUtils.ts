import type {
  AuthFileItem,
  AuthFileSubscriptionPeriod,
  EntityStatsResponse,
  OAuthModelAliasEntry,
} from "@/lib/http/types";
import { normalizeUsageSourceId, type KeyStatBucket } from "@/modules/providers/provider-usage";
import type { QuotaItem, QuotaState, QuotaStatus } from "@/modules/quota/quota-helpers";
import { resolveCodexPlanType } from "@/utils/quota/resolvers";
import { normalizePlanType } from "@/utils/quota/parsers";
import type { StatusBarData, StatusBlockDetail, StatusBlockState } from "@/utils/usage";

export type AuthFileModelItem = {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
};

export type AuthFileModelOwnerGroup = {
  value: string;
  label: string;
  description: string;
  models: AuthFileModelItem[];
};

export type OAuthDialogTab =
  | "codex"
  | "anthropic"
  | "antigravity"
  | "gemini-cli"
  | "kimi"
  | "qwen"
  | "iflow"
  | "vertex";

export const AUTH_FILES_PAGE_SIZE = 9;
export const MAX_AUTH_FILE_SIZE = 50 * 1024;

export const AUTH_FILES_UI_STATE_KEY = "authFilesPage.uiState.v3";
export const AUTH_FILES_DATA_CACHE_KEY = "authFilesPage.dataCache.v2";
export const AUTH_FILES_QUOTA_PREVIEW_KEY = "authFilesPage.quotaPreview.v1";
export const AUTH_FILES_QUOTA_AUTO_REFRESH_KEY = "authFilesPage.quotaAutoRefreshMs.v1";
export const AUTH_FILES_FILES_VIEW_MODE_KEY = "authFilesPage.filesViewMode.v1";
export const AUTH_FILES_MODEL_OWNER_GROUP_MAP_KEY = "authFilesPage.modelOwnerGroupMap.v1";

export type QuotaPreviewMode = "5h" | "week";
export type QuotaAutoRefreshMs = 0 | 5000 | 10000 | 30000 | 60000;
export type FilesViewMode = "table" | "cards";
export type AuthFilesModelOwnerGroupMap = Record<string, string>;

export type AuthFilesUiState = {
  tab?: "files" | "excluded" | "alias";
  filter?: string;
  search?: string;
  page?: number;
};

export type AuthFilesDataCache = {
  savedAtMs: number;
  files: AuthFileItem[];
  usageData?: EntityStatsResponse | null;
  quotaByFileName?: Record<string, QuotaState>;
};

const sanitizeDecodedIdToken = (value: unknown): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value;
};

export const readAuthFilesUiState = (): AuthFilesUiState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_FILES_UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthFilesUiState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const writeAuthFilesUiState = (state: AuthFilesUiState) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTH_FILES_UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};

const sanitizeModelOwnerGroupMap = (value: unknown): AuthFilesModelOwnerGroupMap => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: AuthFilesModelOwnerGroupMap = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = normalizeProviderKey(rawKey);
    const owner =
      typeof rawValue === "string" ? rawValue.trim().replace(/\s+/g, "-").toLowerCase() : "";
    if (!key || key === "all" || !owner) continue;
    output[key] = owner;
  }
  return output;
};

export const readAuthFilesModelOwnerGroupMap = (): AuthFilesModelOwnerGroupMap => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(AUTH_FILES_MODEL_OWNER_GROUP_MAP_KEY);
    if (!raw) return {};
    return sanitizeModelOwnerGroupMap(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
};

export const writeAuthFilesModelOwnerGroupMap = (map: AuthFilesModelOwnerGroupMap) => {
  if (typeof window === "undefined") return;
  const normalized = sanitizeModelOwnerGroupMap(map);
  try {
    if (Object.keys(normalized).length === 0) {
      window.localStorage.removeItem(AUTH_FILES_MODEL_OWNER_GROUP_MAP_KEY);
      return;
    }
    window.localStorage.setItem(AUTH_FILES_MODEL_OWNER_GROUP_MAP_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage failures; the in-memory selection still updates.
  }
};

export const sanitizeAuthFilesForCache = (files: AuthFileItem[]): AuthFileItem[] =>
  files.map((file) => ({
    id: file.id,
    name: file.name,
    type: file.type,
    provider: file.provider,
    label: file.label,
    email: file.email,
    account: file.account,
    account_type: file.account_type,
    auth_index: file.auth_index,
    authIndex: file.authIndex,
    disabled: file.disabled,
    modified: file.modified,
    modtime: file.modtime,
    size: file.size,
    runtimeOnly: file.runtimeOnly,
    runtime_only: file.runtime_only,
    plan_type: file.plan_type,
    planType: file.planType,
    subscription_started_at: file.subscription_started_at,
    subscriptionStartedAt: file.subscriptionStartedAt,
    subscription_start_at: file.subscription_start_at,
    subscriptionStartAt: file.subscriptionStartAt,
    subscription_started_at_ms: file.subscription_started_at_ms,
    subscriptionStartedAtMs: file.subscriptionStartedAtMs,
    subscription_period: file.subscription_period,
    subscriptionPeriod: file.subscriptionPeriod,
    subscription_expires_at: file.subscription_expires_at,
    subscriptionExpiresAt: file.subscriptionExpiresAt,
    subscription_expires_at_ms: file.subscription_expires_at_ms,
    subscriptionExpiresAtMs: file.subscriptionExpiresAtMs,
    subscription_remaining_minutes: file.subscription_remaining_minutes,
    subscriptionRemainingMinutes: file.subscriptionRemainingMinutes,
    subscription_expired: file.subscription_expired,
    subscriptionExpired: file.subscriptionExpired,
    id_token: sanitizeDecodedIdToken(file.id_token),
  }));

const QUOTA_CACHE_STATUSES = new Set<QuotaStatus>(["idle", "loading", "success", "error"]);

const sanitizeQuotaItemsForCache = (items: unknown): QuotaItem[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item): QuotaItem | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label : "";
      if (!label) return null;
      const percent =
        record.percent === null ||
        (typeof record.percent === "number" && Number.isFinite(record.percent))
          ? record.percent
          : null;
      const resetAtMs =
        typeof record.resetAtMs === "number" && Number.isFinite(record.resetAtMs)
          ? record.resetAtMs
          : undefined;
      const meta = typeof record.meta === "string" ? record.meta : undefined;
      return { label, percent, resetAtMs, meta };
    })
    .filter((item): item is QuotaItem => Boolean(item));
};

const sanitizeQuotaByFileNameForCache = (
  quotaByFileName: unknown,
  fileNames?: Set<string>,
): Record<string, QuotaState> | undefined => {
  if (!quotaByFileName || typeof quotaByFileName !== "object" || Array.isArray(quotaByFileName)) {
    return undefined;
  }

  const output: Record<string, QuotaState> = {};
  Object.entries(quotaByFileName as Record<string, unknown>).forEach(([fileName, rawState]) => {
    if (!fileName || (fileNames && !fileNames.has(fileName))) return;
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) return;
    const state = rawState as Record<string, unknown>;
    const items = sanitizeQuotaItemsForCache(state.items);
    if (items.length === 0) return;
    const rawStatus = typeof state.status === "string" ? state.status : "success";
    const status = QUOTA_CACHE_STATUSES.has(rawStatus as QuotaStatus) ? rawStatus : "success";
    const updatedAt =
      typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt)
        ? state.updatedAt
        : undefined;
    const planType = normalizePlanType(state.planType ?? state.plan_type);
    const error = typeof state.error === "string" ? state.error : undefined;
    output[fileName] = {
      status: status === "loading" ? "success" : (status as QuotaStatus),
      items,
      planType: planType ?? undefined,
      updatedAt,
      error: status === "error" ? error : undefined,
    };
  });

  return Object.keys(output).length > 0 ? output : undefined;
};

export const readAuthFilesDataCache = (): AuthFilesDataCache | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_FILES_DATA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthFilesDataCache>;
    const files = Array.isArray(parsed?.files) ? (parsed.files as AuthFileItem[]) : null;
    if (!files) return null;
    const savedAtMs =
      typeof parsed?.savedAtMs === "number" && Number.isFinite(parsed.savedAtMs)
        ? parsed.savedAtMs
        : Date.now();

    return {
      savedAtMs,
      files,
      usageData:
        parsed?.usageData && typeof parsed.usageData === "object"
          ? (parsed.usageData as EntityStatsResponse)
          : undefined,
      quotaByFileName: sanitizeQuotaByFileNameForCache(parsed?.quotaByFileName),
    };
  } catch {
    return null;
  }
};

export const writeAuthFilesDataCache = (cache: AuthFilesDataCache) => {
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(AUTH_FILES_DATA_CACHE_KEY);
    const previous = raw ? (JSON.parse(raw) as Partial<AuthFilesDataCache>) : null;
    const fileNames = new Set(cache.files.map((file) => file.name).filter(Boolean));
    const quotaByFileName = sanitizeQuotaByFileNameForCache(
      cache.quotaByFileName ?? previous?.quotaByFileName,
      fileNames,
    );
    window.sessionStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: cache.savedAtMs,
        files: cache.files,
        usageData: cache.usageData ?? previous?.usageData,
        quotaByFileName,
      }),
    );
  } catch {
    // ignore
  }
};

export const formatFileSize = (bytes?: number): string => {
  const value = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
  if (value <= 0) return "--";
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace(/\.0$/, "")} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace(/\.0$/, "")} MB`;
};

export const formatModified = (file: AuthFileItem): string => {
  const raw = (file.modtime ?? file.modified) as unknown;
  if (!raw) return "--";
  const asNumber = Number(raw);
  const date =
    Number.isFinite(asNumber) && !Number.isNaN(asNumber)
      ? new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber)
      : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
};

const parseDateLikeMs = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 1e12 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

export type AuthFileSubscriptionStatus = {
  startedAtMs: number;
  startedAtText: string;
  expiresAtMs: number;
  expiresAtText: string;
  remainingDays: number;
  expired: boolean;
  period: AuthFileSubscriptionPeriod;
  tone: "active" | "warning" | "urgent" | "expired";
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const normalizeAuthFileSubscriptionPeriod = (value: unknown): AuthFileSubscriptionPeriod => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "year" || normalized === "yearly" || normalized === "annual") {
    return "yearly";
  }
  return "monthly";
};

const resolveSubscriptionStartMs = (file: AuthFileItem): number | null =>
  parseDateLikeMs(file.subscription_started_at_ms ?? file.subscriptionStartedAtMs) ??
  parseDateLikeMs(
    file.subscription_started_at ??
      file.subscriptionStartedAt ??
      file.subscription_start_at ??
      file.subscriptionStartAt,
  );

const addCalendarMonths = (startMs: number, months: number): number | null => {
  const date = new Date(startMs);
  if (Number.isNaN(date.getTime())) return null;

  const day = date.getDate();
  const result = new Date(startMs);
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDayOfTargetMonth));

  return Number.isNaN(result.getTime()) ? null : result.getTime();
};

export const resolveAuthFileSubscriptionStatus = (
  file: AuthFileItem,
  nowMs = Date.now(),
): AuthFileSubscriptionStatus | null => {
  const startedAtMs = resolveSubscriptionStartMs(file);
  if (startedAtMs === null) return null;

  const period = normalizeAuthFileSubscriptionPeriod(
    file.subscription_period ?? file.subscriptionPeriod,
  );
  const expiresAtMs = addCalendarMonths(startedAtMs, period === "yearly" ? 12 : 1);
  if (expiresAtMs === null) return null;

  const diffMs = expiresAtMs - nowMs;
  const remainingDays =
    diffMs === 0
      ? 0
      : diffMs > 0
        ? Math.ceil(diffMs / DAY_MS)
        : -Math.ceil(Math.abs(diffMs) / DAY_MS);
  const expired = remainingDays <= 0;
  const tone = expired ? "expired" : remainingDays <= 5 ? "urgent" : "active";

  return {
    startedAtMs,
    startedAtText: new Date(startedAtMs).toLocaleString(),
    expiresAtMs,
    expiresAtText: new Date(expiresAtMs).toLocaleString(),
    remainingDays,
    expired,
    period,
    tone,
  };
};

const padDatePart = (value: number): string => String(value).padStart(2, "0");

export const dateLikeToDateTimeLocalInput = (value: unknown): string => {
  const ms = parseDateLikeMs(value);
  if (ms === null) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    "-",
    padDatePart(date.getMonth() + 1),
    "-",
    padDatePart(date.getDate()),
    "T",
    padDatePart(date.getHours()),
    ":",
    padDatePart(date.getMinutes()),
  ].join("");
};

export const dateTimeLocalInputToIso = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

export const normalizeProviderKey = (value: string): string => value.trim().toLowerCase();

export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const matchesModelPattern = (modelId: string, pattern: string): boolean => {
  const rawModel = String(modelId ?? "").trim();
  const rawPattern = String(pattern ?? "").trim();
  if (!rawModel || !rawPattern) return false;

  if (!rawPattern.includes("*")) {
    return rawModel.toLowerCase() === rawPattern.toLowerCase();
  }

  const escaped = escapeRegExp(rawPattern).replace(/\\\*/g, ".*");
  try {
    const regex = new RegExp(`^${escaped}$`, "i");
    return regex.test(rawModel);
  } catch {
    return false;
  }
};

export const TYPE_BADGE_CLASSES: Record<string, string> = {
  qwen: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  kimi: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  gemini: "bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
  "gemini-cli": "bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200",
  aistudio: "bg-slate-50 text-slate-800 dark:bg-white/10 dark:text-slate-200",
  claude: "bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
  codex: "bg-orange-50 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200",
  antigravity: "bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200",
  iflow: "bg-violet-50 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200",
  vertex: "bg-cyan-50 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-200",
  empty: "bg-slate-50 text-slate-600 dark:bg-white/10 dark:text-white/70",
  unknown: "bg-slate-50 text-slate-600 dark:bg-white/10 dark:text-white/70",
};

export const resolveFileType = (file: AuthFileItem): string => {
  const type = typeof file.type === "string" ? file.type : "";
  const provider = typeof file.provider === "string" ? file.provider : "";
  const fromName = String(file.name || "").split(".")[0] ?? "";
  const candidate = normalizeProviderKey(type || provider || fromName);
  return candidate || "unknown";
};

export const resolveProviderLabel = (providerKey: string): string => {
  const normalized = normalizeProviderKey(providerKey);
  if (!normalized || normalized === "all") return "All";
  return normalized.replace(
    /(^|-)([a-z])/g,
    (_, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`,
  );
};

export const formatTrendDateKey = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const buildLast7DayAxis = () => {
  const result: { date: string; label: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = formatTrendDateKey(date);
    result.push({ date: key, label: key.slice(5) });
  }
  return result;
};

export const readAuthFileChannelName = (file: AuthFileItem): string => {
  const candidates = [file.label, file.email, file.provider, file.type];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
};

export const isOauthAuthFile = (file: AuthFileItem): boolean =>
  String(file.account_type || "")
    .trim()
    .toLowerCase() === "oauth";

export const resolveAuthFileDisplayName = (file: AuthFileItem): string => {
  const channelName = readAuthFileChannelName(file);
  if (isOauthAuthFile(file) && channelName) return channelName;
  return String(file.name || "");
};

export const resolveAuthFileSortKey = (file: AuthFileItem): string => {
  const channelName = readAuthFileChannelName(file);
  const fileName = String(file.name || "").trim();
  return `${channelName || fileName}\u0000${fileName}`;
};

export const authFilesSortCollator = new Intl.Collator("zh-Hans-CN", {
  numeric: true,
  sensitivity: "base",
});

export const resolveAuthFilePlanType = (
  file: AuthFileItem,
  quotaState?: QuotaState | null,
): string | null => normalizePlanType(quotaState?.planType) ?? resolveCodexPlanType(file);

export const isRuntimeOnlyAuthFile = (file: AuthFileItem): boolean => {
  const raw = (file.runtime_only ?? file.runtimeOnly) as unknown;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
  return false;
};

export const normalizeAuthIndexValue = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

export const downloadTextAsFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  downloadBlobAsFile(blob, filename);
};

export const downloadBlobAsFile = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
};

export const normalizeQuotaLabel = (label: string): string =>
  String(label ?? "")
    .trim()
    .toLowerCase();

export const parseAdditionalQuotaWindowLabel = (
  label: string,
): { name: string; window: "5h" | "weekly" } | null => {
  const match = String(label ?? "").match(/^(.+?)\s*[:：]\s*(5h|weekly)$/i);
  if (!match) return null;
  const name = match[1]?.trim();
  if (!name) return null;
  return {
    name,
    window: match[2]?.toLowerCase() === "5h" ? "5h" : "weekly",
  };
};

export const pickQuotaPreviewItem = (
  items: QuotaItem[],
  mode: QuotaPreviewMode,
): QuotaItem | null => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const patterns =
    mode === "week"
      ? ["weekly", "week", "周", "7天", "seven_day", "seven day"]
      : ["_5h", "5h", "5小时", "five_hour", "five hour"];

  const match = items.find((item) => {
    const key = normalizeQuotaLabel(item.label);
    return patterns.some((p) => key.includes(normalizeQuotaLabel(p)));
  });

  return match ?? items[0] ?? null;
};

export const normalizeQuotaAutoRefreshMs = (value: unknown): QuotaAutoRefreshMs => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 10000;
  const rounded = Math.max(0, Math.round(parsed));
  if (rounded === 0) return 0;
  if (rounded === 5000) return 5000;
  if (rounded === 10000) return 10000;
  if (rounded === 30000) return 30000;
  if (rounded === 60000) return 60000;
  return 10000;
};

export type UsageIndex = {
  statsBySource: Record<string, KeyStatBucket>;
  statsByAuthIndex: Record<string, KeyStatBucket>;
};

export const buildUsageIndex = (
  usage: import("@/lib/http/types").EntityStatsResponse | null,
): { index: UsageIndex } => {
  const statsBySource: Record<string, KeyStatBucket> = {};
  const statsByAuthIndex: Record<string, KeyStatBucket> = {};

  if (usage?.source) {
    usage.source.forEach((pt) => {
      const src = normalizeUsageSourceId(pt.entity_name, (v) => v);
      if (src) {
        statsBySource[src] = { success: pt.requests - pt.failed, failure: pt.failed };
      }
    });
  }

  if (usage?.auth_index) {
    usage.auth_index.forEach((pt) => {
      const idx = normalizeAuthIndexValue(pt.entity_name);
      if (idx) {
        statsByAuthIndex[idx] = { success: pt.requests - pt.failed, failure: pt.failed };
      }
    });
  }

  return { index: { statsBySource, statsByAuthIndex } };
};

export const buildAuthFileSourceCandidates = (file: AuthFileItem): string[] => {
  const rawName = String(file.name || "").trim();
  if (!rawName) return [];
  const withoutExt = rawName.replace(/\.[^/.]+$/, "");
  const list = [
    normalizeUsageSourceId(rawName, (v) => v),
    normalizeUsageSourceId(withoutExt, (v) => v),
  ].filter(Boolean) as string[];
  return Array.from(new Set(list));
};

export const resolveAuthFileStats = (file: AuthFileItem, index: UsageIndex): KeyStatBucket => {
  const authIndexKey = normalizeAuthIndexValue(
    file.auth_index ?? file.authIndex ?? file.authIndex ?? file.auth_index,
  );
  if (authIndexKey && index.statsByAuthIndex[authIndexKey]) {
    return index.statsByAuthIndex[authIndexKey];
  }

  const candidates = buildAuthFileSourceCandidates(file);
  let bucket: KeyStatBucket = { success: 0, failure: 0 };
  candidates.forEach((key) => {
    const entry = index.statsBySource[key];
    if (!entry) return;
    bucket = { success: bucket.success + entry.success, failure: bucket.failure + entry.failure };
  });
  return bucket;
};

export const resolveAuthFileStatusBar = (file: AuthFileItem, index: UsageIndex): StatusBarData => {
  const stats = resolveAuthFileStats(file, index);
  if (stats.success === 0 && stats.failure === 0) {
    return { blocks: [], blockDetails: [], successRate: 100, totalSuccess: 0, totalFailure: 0 };
  }

  const total = stats.success + stats.failure;
  const blockCount = 20;
  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];

  let tempFail = stats.failure;
  let tempSuccess = stats.success;

  for (let i = 0; i < blockCount; i++) {
    const failPart = Math.floor(tempFail / (blockCount - i));
    const successPart = Math.floor(tempSuccess / (blockCount - i));
    tempFail -= failPart;
    tempSuccess -= successPart;

    if (failPart === 0 && successPart === 0) {
      blocks.push("idle");
    } else if (failPart === 0) {
      blocks.push("success");
    } else if (successPart === 0) {
      blocks.push("failure");
    } else {
      blocks.push("mixed");
    }

    blockDetails.push({
      success: successPart,
      failure: failPart,
      rate: successPart + failPart > 0 ? successPart / (successPart + failPart) : -1,
      startTime: 0,
      endTime: 0,
    });
  }

  return {
    blocks,
    blockDetails,
    successRate: (stats.success / total) * 100,
    totalSuccess: stats.success,
    totalFailure: stats.failure,
  };
};

export type PrefixProxyEditorState = {
  open: boolean;
  fileName: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  json: Record<string, unknown> | null;
  prefix: string;
  proxyUrl: string;
  proxyId: string;
  subscriptionStartedAt: string;
  subscriptionPeriod: AuthFileSubscriptionPeriod;
};

export type AuthFilesGroupOverview = {
  totalCalls: number;
  averageFiveHour: number | null;
  averageWeekly: number | null;
  quotaSampleCount: number;
};

export type AuthFilesGroupOverviewRow = {
  name: string;
  totalCalls: number;
  averageFiveHour: number | null;
  averageWeekly: number | null;
  hasQuota: boolean;
};

export type AuthFilesGroupTrendPoint = {
  date: string;
  label: string;
  calls: number;
  weeklyPercent: number | null;
};

export type ChannelEditorState = {
  open: boolean;
  fileName: string;
  label: string;
  saving: boolean;
  error: string | null;
};

export type AliasRow = OAuthModelAliasEntry & { id: string };

export const buildAliasRows = (entries: OAuthModelAliasEntry[] | undefined): AliasRow[] => {
  if (!entries?.length) {
    return [{ id: `row-${Date.now()}`, name: "", alias: "" }];
  }
  return entries.map((entry) => ({
    id: `row-${entry.name}-${entry.alias}-${entry.fork ? "1" : "0"}`,
    ...entry,
  }));
};
