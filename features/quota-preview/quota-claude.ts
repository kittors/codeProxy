import type { QuotaItem } from "@features/quota-preview/quota-types";
import {
  clampPercent,
  normalizeNumberValue,
  normalizeStringValue,
  parseResetTimeToMs,
} from "@features/quota-preview/quota-normalizers";

type ClaudeUsageWindow = {
  utilization?: number | string;
  resets_at?: string;
  resetsAt?: string;
};

type ClaudeScopedLimit = {
  kind?: string;
  group?: string;
  percent?: number | string | null;
  resets_at?: string;
  resetsAt?: string;
  scope?: {
    model?: {
      id?: string;
      display_name?: string;
      displayName?: string;
    } | null;
  } | null;
};

export type ClaudeUsagePayload = {
  five_hour?: ClaudeUsageWindow | null;
  seven_day?: ClaudeUsageWindow | null;
  seven_day_oauth_apps?: ClaudeUsageWindow | null;
  seven_day_opus?: ClaudeUsageWindow | null;
  seven_day_sonnet?: ClaudeUsageWindow | null;
  seven_day_cowork?: ClaudeUsageWindow | null;
  seven_day_routines?: ClaudeUsageWindow | null;
  iguana_necktie?: ClaudeUsageWindow | null;
  limits?: ClaudeScopedLimit[] | null;
  extra_usage?: {
    is_enabled?: boolean;
    monthly_limit?: number | string;
    used_credits?: number | string;
    utilization?: number | string | null;
  } | null;
};

const CLAUDE_USAGE_WINDOW_KEYS = [
  { keys: ["five_hour"], id: "five_hour", label: "claude_quota.five_hour" },
  { keys: ["seven_day"], id: "seven_day", label: "claude_quota.seven_day" },
  {
    keys: ["seven_day_oauth_apps"],
    id: "seven_day_oauth_apps",
    label: "claude_quota.seven_day_oauth_apps",
  },
  { keys: ["seven_day_opus"], id: "seven_day_opus", label: "claude_quota.seven_day_opus" },
  { keys: ["seven_day_sonnet"], id: "seven_day_sonnet", label: "claude_quota.seven_day_sonnet" },
  {
    keys: ["seven_day_cowork", "seven_day_routines"],
    id: "seven_day_cowork",
    label: "claude_quota.seven_day_cowork",
  },
  { keys: ["iguana_necktie"], id: "iguana_necktie", label: "claude_quota.iguana_necktie" },
] as const;

const claudeModelSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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
    const window = definition.keys
      .map((key) => payload[key])
      .find((candidate) => candidate != null);
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

  // Newer payloads carry model-scoped weekly windows in `limits[]` instead of
  // flat seven_day_<model> fields; "All models" scopes duplicate seven_day.
  const seenKeys = new Set(items.map((item) => item.key));
  for (const limit of payload.limits ?? []) {
    if (limit?.kind !== "weekly_scoped" || limit.group !== "weekly") continue;
    const usedPercent = normalizeNumberValue(limit.percent);
    if (usedPercent === null) continue;
    const model = limit.scope?.model;
    const id = normalizeStringValue(model?.id) ?? "";
    const name = normalizeStringValue(model?.display_name ?? model?.displayName) ?? id;
    const slug = claudeModelSlug(id) || claudeModelSlug(name);
    if (!slug || slug === "all-models" || slug.endsWith("-all-models")) continue;
    if (claudeModelSlug(name) === "all-models") continue;
    if (
      (seenKeys.has("seven_day_opus") && slug.includes("opus")) ||
      (seenKeys.has("seven_day_sonnet") && slug.includes("sonnet"))
    ) {
      continue;
    }
    const key = `weekly_scoped_${slug}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    items.push({
      key,
      label: `claude_quota.model_weekly::${name}`,
      percent: clampPercent(100 - clampPercent(usedPercent)),
      resetAtMs: parseResetTimeToMs(limit.resets_at ?? limit.resetsAt),
    });
  }

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
