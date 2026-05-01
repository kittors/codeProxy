import type { QuotaItem } from "@/modules/quota/quota-types";
import {
  clampPercent,
  normalizeNumberValue,
  normalizeStringValue,
  parseResetTimeToMs,
} from "@/modules/quota/quota-normalizers";

type ClaudeUsageWindow = {
  utilization?: number | string;
  resets_at?: string;
  resetsAt?: string;
};

export type ClaudeUsagePayload = {
  five_hour?: ClaudeUsageWindow | null;
  seven_day?: ClaudeUsageWindow | null;
  seven_day_oauth_apps?: ClaudeUsageWindow | null;
  seven_day_opus?: ClaudeUsageWindow | null;
  seven_day_sonnet?: ClaudeUsageWindow | null;
  seven_day_cowork?: ClaudeUsageWindow | null;
  iguana_necktie?: ClaudeUsageWindow | null;
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number | string;
    used_credits?: number | string;
    utilization?: number | string | null;
  } | null;
};

const CLAUDE_USAGE_WINDOW_KEYS = [
  { key: "five_hour", id: "five_hour", label: "claude_quota.five_hour" },
  { key: "seven_day", id: "seven_day", label: "claude_quota.seven_day" },
  {
    key: "seven_day_oauth_apps",
    id: "seven_day_oauth_apps",
    label: "claude_quota.seven_day_oauth_apps",
  },
  { key: "seven_day_opus", id: "seven_day_opus", label: "claude_quota.seven_day_opus" },
  { key: "seven_day_sonnet", id: "seven_day_sonnet", label: "claude_quota.seven_day_sonnet" },
  { key: "seven_day_cowork", id: "seven_day_cowork", label: "claude_quota.seven_day_cowork" },
  { key: "iguana_necktie", id: "iguana_necktie", label: "claude_quota.iguana_necktie" },
] as const;

export const parseClaudeUsagePayload = (payload: unknown): ClaudeUsagePayload | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as ClaudeUsagePayload;
    } catch {
      return null;
    }
  }
  return typeof payload === "object" ? (payload as ClaudeUsagePayload) : null;
};

const resolveRemainingPercent = (window?: ClaudeUsageWindow | null): number | null => {
  if (!window) return null;
  const utilization = normalizeNumberValue(window.utilization);
  return utilization === null ? null : clampPercent(100 - clampPercent(utilization));
};

export const buildClaudeItems = (payload: ClaudeUsagePayload): QuotaItem[] => {
  const items: QuotaItem[] = CLAUDE_USAGE_WINDOW_KEYS.flatMap((definition) => {
    const window = payload[definition.key];
    if (!window) return [];
    const percent = resolveRemainingPercent(window);
    const resetAtMs = parseResetTimeToMs(window.resets_at ?? window.resetsAt);
    if (percent === null && !resetAtMs) return [];
    return [
      {
        key: definition.id,
        label: definition.label,
        percent,
        resetAtMs,
      },
    ];
  });

  const extra = payload.extra_usage;
  const extraUtilization = normalizeNumberValue(extra?.utilization);
  if (extra?.is_enabled && extraUtilization !== null) {
    const usedCredits = normalizeStringValue(extra.used_credits);
    const monthlyLimit = normalizeStringValue(extra.monthly_limit);
    const meta =
      usedCredits && monthlyLimit ? `${usedCredits} / ${monthlyLimit} credits` : undefined;
    items.push({
      key: "extra_usage",
      label: "claude_quota.extra_usage_label",
      percent: clampPercent(100 - clampPercent(extraUtilization)),
      meta,
    });
  }

  return items;
};
