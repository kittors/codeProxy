import type { AuthFileItem } from "@/lib/http/types";

export const DEFAULT_ANTIGRAVITY_PROJECT_ID = "bamboo-precept-lgxtn";

export const ANTIGRAVITY_QUOTA_URLS = [
  "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
  "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
];

export const ANTIGRAVITY_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "User-Agent": "antigravity/1.11.5 windows/amd64",
};

export const GEMINI_CLI_QUOTA_URL =
  "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
export const GEMINI_CLI_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
};

export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export const CODEX_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "User-Agent": "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal",
};

export const KIRO_QUOTA_URL = "https://codewhisperer.us-east-1.amazonaws.com";
export const KIRO_REQUEST_HEADERS = {
  "Content-Type": "application/x-amz-json-1.0",
  "x-amz-target": "AmazonCodeWhispererService.GetUsageLimits",
  Authorization: "Bearer $TOKEN$",
};

export const KIRO_REQUEST_BODY = JSON.stringify({
  origin: "AI_EDITOR",
  resourceType: "AGENTIC_REQUEST",
});

export type QuotaStatus = "idle" | "loading" | "success" | "error";

export type QuotaItem = {
  label: string;
  percent: number | null;
  resetLabel?: string;
  meta?: string;
};

export type QuotaState = {
  status: QuotaStatus;
  items: QuotaItem[];
  error?: string;
  updatedAt?: number;
};

export const normalizeAuthIndexValue = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

export const normalizeStringValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  return null;
};

export const normalizeNumberValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const normalizeQuotaFraction = (value: unknown): number | null => {
  const normalized = normalizeNumberValue(value);
  if (normalized !== null) return normalized;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.endsWith("%")) {
      const parsed = Number(trimmed.slice(0, -1));
      return Number.isFinite(parsed) ? parsed / 100 : null;
    }
  }
  return null;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const parseIdTokenPayload = (value: unknown): Record<string, unknown> | null => {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // ignore
  }
  const segments = trimmed.split(".");
  if (segments.length < 2) return null;
  try {
    const normalized = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = typeof window.atob === "function" ? window.atob(padded) : atob(padded);
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

export const resolveAuthProvider = (file: AuthFileItem): string => {
  const raw = (file.provider ?? file.type ?? "") as unknown;
  return String(raw).trim().toLowerCase();
};

export const isDisabledAuthFile = (file: AuthFileItem): boolean => {
  const raw = file.disabled as unknown;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
  return false;
};

export const formatResetTime = (value?: string): string => {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export const formatUnixSeconds = (seconds?: number | null): string => {
  if (!seconds) return "--";
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
};

export const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

type AntigravityQuotaInfo = {
  displayName?: string;
  quotaInfo?: {
    remainingFraction?: number | string;
    remaining_fraction?: number | string;
    remaining?: number | string;
    resetTime?: string;
    reset_time?: string;
  };
  quota_info?: {
    remainingFraction?: number | string;
    remaining_fraction?: number | string;
    remaining?: number | string;
    resetTime?: string;
    reset_time?: string;
  };
};

export type AntigravityModelsPayload = Record<string, AntigravityQuotaInfo>;

const ANTIGRAVITY_QUOTA_GROUPS: {
  id: string;
  label: string;
  identifiers: string[];
  labelFromModel?: boolean;
}[] = [
  {
    id: "claude-gpt",
    label: "Claude/GPT",
    identifiers: [
      "claude-sonnet-4-5-thinking",
      "claude-opus-4-5-thinking",
      "claude-sonnet-4-5",
      "gpt-oss-120b-medium",
    ],
  },
  {
    id: "gemini-3-pro",
    label: "Gemini 3 Pro",
    identifiers: ["gemini-3-pro-high", "gemini-3-pro-low"],
  },
  {
    id: "gemini-2-5-flash",
    label: "Gemini 2.5 Flash",
    identifiers: ["gemini-2.5-flash", "gemini-2.5-flash-thinking"],
  },
  {
    id: "gemini-2-5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    identifiers: ["gemini-2.5-flash-lite"],
  },
  { id: "gemini-2-5-cu", label: "Gemini 2.5 CU", identifiers: ["rev19-uic3-1p"] },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", identifiers: ["gemini-3-flash"] },
  {
    id: "gemini-image",
    label: "gemini-3-pro-image",
    identifiers: ["gemini-3-pro-image"],
    labelFromModel: true,
  },
];

const findAntigravityModel = (models: AntigravityModelsPayload, identifier: string) => {
  const direct = models[identifier];
  if (direct) return { id: identifier, entry: direct };
  const match = Object.entries(models).find(([, entry]) => {
    const name = typeof entry?.displayName === "string" ? entry.displayName : "";
    return name.toLowerCase() === identifier.toLowerCase();
  });
  return match ? { id: match[0], entry: match[1] } : null;
};

const getAntigravityQuotaInfo = (entry?: AntigravityQuotaInfo) => {
  if (!entry) return { remainingFraction: null as number | null };
  const quotaInfo = (entry.quotaInfo ?? entry.quota_info ?? {}) as Record<string, unknown>;
  const remainingValue =
    quotaInfo.remainingFraction ?? quotaInfo.remaining_fraction ?? quotaInfo.remaining;
  const remainingFraction = normalizeQuotaFraction(remainingValue);
  const resetValue = quotaInfo.resetTime ?? quotaInfo.reset_time;
  const resetTime = typeof resetValue === "string" ? resetValue : undefined;
  const displayName = typeof entry.displayName === "string" ? entry.displayName : undefined;
  return { remainingFraction, resetTime, displayName };
};

export const buildAntigravityGroups = (models: AntigravityModelsPayload) => {
  const groups: { id: string; label: string; remainingFraction: number; resetTime?: string }[] = [];
  let geminiProResetTime: string | undefined;

  const buildGroup = (
    def: (typeof ANTIGRAVITY_QUOTA_GROUPS)[number],
    overrideResetTime?: string,
  ) => {
    const matches = def.identifiers
      .map((identifier) => findAntigravityModel(models, identifier))
      .filter(Boolean) as { id: string; entry: AntigravityQuotaInfo }[];

    const quotaEntries = matches
      .map(({ id, entry }) => {
        const info = getAntigravityQuotaInfo(entry);
        const label = def.labelFromModel ? (info.displayName ?? id) : def.label;
        const resetTime = overrideResetTime ?? info.resetTime;
        return { label, remainingFraction: info.remainingFraction, resetTime };
      })
      .filter((item) => item.remainingFraction !== null);

    const avg = quotaEntries.length
      ? quotaEntries.reduce((acc, item) => acc + (item.remainingFraction ?? 0), 0) /
        quotaEntries.length
      : 0;

    const reset = quotaEntries.find((item) => item.resetTime)?.resetTime;
    if (def.id === "gemini-3-pro" && reset) {
      geminiProResetTime = reset;
    }

    groups.push({
      id: def.id,
      label: def.label,
      remainingFraction: avg,
      ...(reset ? { resetTime: reset } : {}),
    });
  };

  ANTIGRAVITY_QUOTA_GROUPS.forEach((group) => buildGroup(group));

  if (geminiProResetTime) {
    groups.forEach((group) => {
      if (group.id.startsWith("gemini-") && !group.resetTime) {
        group.resetTime = geminiProResetTime;
      }
    });
  }

  return groups;
};

type GeminiCliQuotaBucket = {
  modelId?: unknown;
  model_id?: unknown;
  tokenType?: unknown;
  token_type?: unknown;
  remainingFraction?: unknown;
  remaining_fraction?: unknown;
  remainingAmount?: unknown;
  remaining_amount?: unknown;
  resetTime?: unknown;
  reset_time?: unknown;
};

export type GeminiCliQuotaPayload = { buckets?: GeminiCliQuotaBucket[] };

export const normalizeGeminiCliModelId = (value: unknown): string | null => {
  const normalized = normalizeStringValue(value);
  if (!normalized) return null;
  return normalized.replace(/^projects\/[^/]+\//, "").trim();
};

const GEMINI_CLI_IGNORED_MODEL_PREFIXES = ["gemini-2.0-flash"];

const GEMINI_CLI_GROUPS: {
  id: string;
  label: string;
  preferredModelId?: string;
  modelIds: string[];
}[] = [
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    preferredModelId: "gemini-2.5-pro",
    modelIds: ["gemini-2.5-pro", "gemini-2.5-pro-preview"],
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    preferredModelId: "gemini-2.5-flash",
    modelIds: ["gemini-2.5-flash", "gemini-2.5-flash-preview"],
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    preferredModelId: "gemini-2.5-flash-lite",
    modelIds: ["gemini-2.5-flash-lite"],
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    preferredModelId: "gemini-2.0-flash",
    modelIds: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.0-flash-exp"],
  },
  {
    id: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    preferredModelId: "gemini-1.5-pro",
    modelIds: ["gemini-1.5-pro", "gemini-1.5-pro-latest"],
  },
  {
    id: "gemini-1.5-flash",
    label: "Gemini 1.5 Flash",
    preferredModelId: "gemini-1.5-flash",
    modelIds: ["gemini-1.5-flash", "gemini-1.5-flash-latest"],
  },
];

const GEMINI_GROUP_ORDER = new Map(GEMINI_CLI_GROUPS.map((group, idx) => [group.id, idx] as const));
const GEMINI_GROUP_LOOKUP = new Map(
  GEMINI_CLI_GROUPS.flatMap((group) => group.modelIds.map((id) => [id, group] as const)),
);

type ParsedGeminiCliBucket = {
  modelId: string;
  tokenType: string | null;
  remainingFraction: number | null;
  remainingAmount: number | null;
  resetTime?: string;
};

export const buildGeminiCliBuckets = (
  buckets: ParsedGeminiCliBucket[],
): Array<{
  id: string;
  label: string;
  tokenType: string | null;
  remainingFraction: number | null;
  remainingAmount: number | null;
  resetTime?: string;
  modelIds: string[];
}> => {
  const grouped = new Map<
    string,
    {
      id: string;
      label: string;
      tokenType: string | null;
      modelIds: string[];
      preferredBucket: ParsedGeminiCliBucket | null;
      fallbackRemainingFraction: number | null;
      fallbackRemainingAmount: number | null;
      fallbackResetTime?: string;
    }
  >();

  for (const bucket of buckets) {
    if (
      bucket.modelId &&
      GEMINI_CLI_IGNORED_MODEL_PREFIXES.some((prefix) => bucket.modelId.startsWith(prefix))
    ) {
      continue;
    }

    const normalizedModelId = bucket.modelId;
    const groupDef = GEMINI_GROUP_LOOKUP.get(normalizedModelId);
    const groupId = groupDef?.id ?? normalizedModelId;
    const label = groupDef?.label ?? normalizedModelId;

    const key = `${groupId}:${bucket.tokenType ?? ""}`;
    const existing =
      grouped.get(key) ??
      ({
        id: groupId,
        label,
        tokenType: bucket.tokenType,
        modelIds: [],
        preferredBucket: null,
        fallbackRemainingFraction: null,
        fallbackRemainingAmount: null,
      } satisfies {
        id: string;
        label: string;
        tokenType: string | null;
        modelIds: string[];
        preferredBucket: ParsedGeminiCliBucket | null;
        fallbackRemainingFraction: number | null;
        fallbackRemainingAmount: number | null;
        fallbackResetTime?: string;
      });

    existing.modelIds.push(normalizedModelId);

    const preferredModelId = groupDef?.preferredModelId ?? null;
    if (preferredModelId && normalizedModelId === preferredModelId) {
      existing.preferredBucket = bucket;
    }

    if (existing.fallbackRemainingFraction === null && bucket.remainingFraction !== null) {
      existing.fallbackRemainingFraction = bucket.remainingFraction;
    }
    if (existing.fallbackRemainingAmount === null && bucket.remainingAmount !== null) {
      existing.fallbackRemainingAmount = bucket.remainingAmount;
    }
    if (!existing.fallbackResetTime && bucket.resetTime) {
      existing.fallbackResetTime = bucket.resetTime;
    }

    grouped.set(key, existing);
  }

  const toOrder = (group: { id: string }) => {
    const groupId = group.id;
    return GEMINI_GROUP_ORDER.get(groupId) ?? Number.MAX_SAFE_INTEGER;
  };

  return Array.from(grouped.values())
    .sort((a, b) => {
      const diff = toOrder(a) - toOrder(b);
      if (diff !== 0) return diff;
      const ta = a.tokenType ?? "";
      const tb = b.tokenType ?? "";
      return ta.localeCompare(tb);
    })
    .map((group) => {
      const uniqueModelIds = Array.from(new Set(group.modelIds));
      const preferred = group.preferredBucket;
      const remainingFraction = preferred
        ? preferred.remainingFraction
        : group.fallbackRemainingFraction;
      const remainingAmount = preferred ? preferred.remainingAmount : group.fallbackRemainingAmount;
      const resetTime = preferred ? preferred.resetTime : group.fallbackResetTime;
      return {
        id: group.id,
        label: group.label,
        tokenType: group.tokenType,
        remainingFraction,
        remainingAmount,
        resetTime,
        modelIds: uniqueModelIds,
      };
    });
};

const extractGeminiCliProjectId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const matches = Array.from(value.matchAll(/\(([^()]+)\)/g));
  if (!matches.length) return null;
  const candidate = matches[matches.length - 1]?.[1]?.trim();
  return candidate ? candidate : null;
};

export const resolveGeminiCliProjectId = (file: AuthFileItem): string | null => {
  const metadata = isRecord(file.metadata) ? (file.metadata as Record<string, unknown>) : null;
  const attributes = isRecord(file.attributes)
    ? (file.attributes as Record<string, unknown>)
    : null;
  const candidates = [
    file.account,
    (file as any)["account"],
    metadata?.account,
    attributes?.account,
  ];
  for (const candidate of candidates) {
    const projectId = extractGeminiCliProjectId(candidate);
    if (projectId) return projectId;
  }
  return null;
};

const extractCodexChatgptAccountId = (value: unknown): string | null => {
  const payload = parseIdTokenPayload(value);
  if (!payload) return null;
  return normalizeStringValue(payload.chatgpt_account_id ?? payload.chatgptAccountId);
};

export const resolveCodexChatgptAccountId = (file: AuthFileItem): string | null => {
  const metadata = isRecord(file.metadata) ? (file.metadata as Record<string, unknown>) : null;
  const attributes = isRecord(file.attributes)
    ? (file.attributes as Record<string, unknown>)
    : null;
  const candidates = [file.id_token, metadata?.id_token, attributes?.id_token];
  for (const candidate of candidates) {
    const id = extractCodexChatgptAccountId(candidate);
    if (id) return id;
  }
  return null;
};

export const parseAntigravityPayload = (payload: unknown): Record<string, unknown> | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") return payload as Record<string, unknown>;
  return null;
};

export const parseGeminiCliQuotaPayload = (payload: unknown): GeminiCliQuotaPayload | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as GeminiCliQuotaPayload;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") return payload as GeminiCliQuotaPayload;
  return null;
};

type CodexUsageWindow = {
  used_percent?: number | string;
  usedPercent?: number | string;
  limit_window_seconds?: number | string;
  limitWindowSeconds?: number | string;
  reset_after_seconds?: number | string;
  resetAfterSeconds?: number | string;
  reset_at?: number | string;
  resetAt?: number | string;
};

type CodexRateLimitInfo = {
  allowed?: boolean;
  limit_reached?: boolean;
  limitReached?: boolean;
  primary_window?: CodexUsageWindow | null;
  primaryWindow?: CodexUsageWindow | null;
  secondary_window?: CodexUsageWindow | null;
  secondaryWindow?: CodexUsageWindow | null;
};

type CodexUsagePayload = {
  plan_type?: string;
  planType?: string;
  rate_limit?: CodexRateLimitInfo | null;
  rateLimit?: CodexRateLimitInfo | null;
  code_review_rate_limit?: CodexRateLimitInfo | null;
  codeReviewRateLimit?: CodexRateLimitInfo | null;
};

export const parseCodexUsagePayload = (payload: unknown): CodexUsagePayload | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as CodexUsagePayload;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") return payload as CodexUsagePayload;
  return null;
};

const formatCodexResetLabel = (window?: CodexUsageWindow | null): string => {
  if (!window) return "--";
  const resetAt = normalizeNumberValue(window.reset_at ?? window.resetAt);
  if (resetAt !== null) return formatUnixSeconds(resetAt);
  const after = normalizeNumberValue(window.reset_after_seconds ?? window.resetAfterSeconds);
  if (after === null) return "--";
  const minutes = Math.max(0, Math.round(after / 60));
  if (minutes < 60) return `${minutes} 分钟后`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟后` : `${hours} 小时后`;
};

export const buildCodexItems = (payload: CodexUsagePayload): QuotaItem[] => {
  const FIVE_HOUR_SECONDS = 18000;
  const WEEK_SECONDS = 604800;

  const pickWindows = (limitInfo?: CodexRateLimitInfo | null) => {
    const rawWindows = [
      limitInfo?.primary_window ?? limitInfo?.primaryWindow ?? null,
      limitInfo?.secondary_window ?? limitInfo?.secondaryWindow ?? null,
    ];
    let fiveHour: CodexUsageWindow | null = null;
    let weekly: CodexUsageWindow | null = null;

    const getSeconds = (w?: CodexUsageWindow | null) =>
      w ? normalizeNumberValue(w.limit_window_seconds ?? w.limitWindowSeconds) : null;

    for (const window of rawWindows) {
      if (!window) continue;
      const seconds = getSeconds(window);
      if (seconds === FIVE_HOUR_SECONDS && !fiveHour) fiveHour = window;
      else if (seconds === WEEK_SECONDS && !weekly) weekly = window;
    }
    return { fiveHour, weekly };
  };

  const items: QuotaItem[] = [];
  const rate = payload.rate_limit ?? payload.rateLimit ?? null;
  const codeReview = payload.code_review_rate_limit ?? payload.codeReviewRateLimit ?? null;

  const addWindow = (
    label: string,
    window?: CodexUsageWindow | null,
    limitInfo?: CodexRateLimitInfo | null,
  ) => {
    if (!window) return;
    const usedRaw = normalizeNumberValue(window.used_percent ?? window.usedPercent);
    const allowed = limitInfo?.allowed;
    const limitReached = limitInfo?.limit_reached ?? limitInfo?.limitReached;
    const used =
      usedRaw !== null ? clampPercent(usedRaw) : allowed === false || limitReached ? 100 : null;
    const remaining = used === null ? null : clampPercent(100 - used);
    items.push({
      label,
      percent: remaining,
      resetLabel: formatCodexResetLabel(window),
    });
  };

  const rateWindows = pickWindows(rate);
  addWindow("代码：5小时", rateWindows.fiveHour, rate);
  addWindow("代码：周", rateWindows.weekly, rate);

  const reviewWindows = pickWindows(codeReview);
  addWindow("审查：5小时", reviewWindows.fiveHour, codeReview);
  addWindow("审查：周", reviewWindows.weekly, codeReview);

  return items;
};

type KiroQuotaPayload = {
  nextDateReset?: number;
  subscriptionInfo?: { subscriptionTitle?: string };
  usageBreakdownList?: {
    usageLimitWithPrecision?: number;
    currentUsageWithPrecision?: number;
    nextDateReset?: number;
    freeTrialInfo?: {
      freeTrialStatus?: string;
      usageLimitWithPrecision?: number;
      currentUsageWithPrecision?: number;
      freeTrialExpiry?: number;
    };
  }[];
};

export const parseKiroQuotaPayload = (payload: unknown): KiroQuotaPayload | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as KiroQuotaPayload;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") return payload as KiroQuotaPayload;
  return null;
};

export const buildKiroItems = (payload: KiroQuotaPayload): QuotaItem[] => {
  const usage = payload.usageBreakdownList?.[0];
  const items: QuotaItem[] = [];
  if (usage) {
    const limit = normalizeNumberValue(usage.usageLimitWithPrecision);
    const used = normalizeNumberValue(usage.currentUsageWithPrecision);
    const resetTime = normalizeNumberValue(usage.nextDateReset ?? payload.nextDateReset);
    if (limit !== null && used !== null) {
      const remaining = Math.max(0, limit - used);
      const percent = limit > 0 ? Math.round((remaining / limit) * 100) : 0;
      items.push({
        label: "基础额度",
        percent,
        resetLabel: resetTime !== null ? formatUnixSeconds(resetTime) : "--",
        meta: `used ${Math.round(used).toLocaleString()} / limit ${Math.round(limit).toLocaleString()}`,
      });
    }
    const trial = usage.freeTrialInfo;
    if (trial) {
      const trialLimit = normalizeNumberValue(trial.usageLimitWithPrecision);
      const trialUsed = normalizeNumberValue(trial.currentUsageWithPrecision);
      const trialExpiry = normalizeNumberValue(trial.freeTrialExpiry);
      const status = normalizeStringValue(trial.freeTrialStatus);
      if (trialLimit !== null && trialUsed !== null) {
        const remaining = Math.max(0, trialLimit - trialUsed);
        const percent = trialLimit > 0 ? Math.round((remaining / trialLimit) * 100) : 0;
        items.push({
          label: "试用额度",
          percent,
          resetLabel: trialExpiry !== null ? formatUnixSeconds(trialExpiry) : "--",
          meta: `${status ?? "trial"} · used ${Math.round(trialUsed).toLocaleString()} / limit ${Math.round(trialLimit).toLocaleString()}`,
        });
      }
    }
  }
  const subscriptionTitle = normalizeStringValue(payload.subscriptionInfo?.subscriptionTitle);
  if (subscriptionTitle) {
    items.unshift({ label: "订阅", percent: null, meta: subscriptionTitle });
  }
  return items;
};
