import {
  clampPercent,
  isRecord,
  normalizeQuotaFraction,
  normalizeStringValue,
  parseResetTimeToMs,
} from "@features/quota-preview/quota-normalizers";
import type { QuotaItem } from "@features/quota-preview/quota-types";

type AntigravityQuotaInfo = {
  displayName?: string;
  quotaInfo?: Record<string, unknown>;
  quota_info?: Record<string, unknown>;
  apiProvider?: unknown;
  api_provider?: unknown;
  modelProvider?: unknown;
  model_provider?: unknown;
  model?: unknown;
};

export type AntigravityModelsPayload = Record<string, AntigravityQuotaInfo>;

export type AntigravityFetchAvailableModelsPayload = {
  models?: AntigravityModelsPayload;
  deprecatedModelIds?: unknown;
  defaultAgentModelId?: unknown;
  agentModelSorts?: unknown;
  commandModelIds?: unknown;
  tabModelIds?: unknown;
  imageGenerationModelIds?: unknown;
  mqueryModelIds?: unknown;
  webSearchModelIds?: unknown;
  commitMessageModelIds?: unknown;
};

const MODEL_ID_LISTS: Array<keyof AntigravityFetchAvailableModelsPayload> = [
  "commandModelIds",
  "tabModelIds",
  "imageGenerationModelIds",
  "mqueryModelIds",
  "webSearchModelIds",
  "commitMessageModelIds",
];

export const ANTIGRAVITY_QUOTA_KEY_PREFIX = "antigravity:";

const FIVE_HOUR_SECONDS = 5 * 60 * 60;
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;
const MONTH_SECONDS = 30 * 24 * 60 * 60;

const normalizeModelId = (value: unknown): string | null => normalizeStringValue(value);

const normalizeModelIdList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(normalizeModelId).filter((id): id is string => Boolean(id)) : [];

const normalizeAntigravityModelId = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("models/") ? normalized.slice("models/".length) : normalized;
};

/**
 * The upstream's non-conversational entries. Matched by shape rather than by id
 * so a newly added internal model does not surface as a user-visible row.
 */
export const shouldSkipAntigravityModelId = (id: string): boolean => {
  const normalized = normalizeAntigravityModelId(id);
  return normalized.startsWith("chat_") || normalized.startsWith("tab_");
};

export type AntigravityQuotaCategory =
  | "gemini_pro"
  | "gemini_flash"
  | "gemini_image"
  | "claude"
  | "other";

/**
 * Group a model by the shape of its id rather than by membership in a list.
 *
 * A list has to be edited every time the upstream ships a model, and until it
 * is, the new model's quota is dropped on the floor — it does not render as
 * "unknown", it renders as nothing at all. The shapes below already cover the
 * models that do not exist yet, and anything they still miss lands in `other`
 * and is shown under its own name.
 */
export const categorizeAntigravityModel = (rawId: string): AntigravityQuotaCategory => {
  const id = normalizeAntigravityModelId(rawId);
  const isGemini = id.startsWith("gemini");
  if ((isGemini && id.includes("image")) || id.startsWith("image") || id.startsWith("imagen")) {
    return "gemini_image";
  }
  if (isGemini && id.includes("flash")) return "gemini_flash";
  if (isGemini && id.includes("pro")) return "gemini_pro";
  if (
    id.includes("claude") ||
    id.includes("opus") ||
    id.includes("sonnet") ||
    id.includes("haiku")
  ) {
    return "claude";
  }
  return "other";
};

const CATEGORY_LABELS: Record<Exclude<AntigravityQuotaCategory, "other">, string> = {
  gemini_pro: "Gemini Pro",
  gemini_flash: "Gemini Flash",
  gemini_image: "Gemini Image",
  claude: "Claude",
};

const CATEGORY_RANK: Record<AntigravityQuotaCategory, number> = {
  gemini_pro: 0,
  gemini_flash: 1,
  gemini_image: 2,
  claude: 3,
  other: 4,
};

const normalizeKeyPart = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "");

/**
 * Map the upstream's window token onto a duration. An unrecognised token yields
 * `undefined` rather than a guess, so a window we cannot classify is still shown
 * — it just never claims to be the weekly cycle.
 */
export const parseAntigravityWindowSeconds = (
  window: string | undefined,
  bucketId?: string,
): number | undefined => {
  const candidates = [window, bucketId]
    .map((value) => (value ?? "").toLowerCase().replaceAll(/[\s_-]/g, ""))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes("week")) return WEEK_SECONDS;
    if (candidate.includes("month")) return MONTH_SECONDS;
    if (candidate.includes("day") || candidate.includes("daily")) return DAY_SECONDS;
    const hours = candidate.match(/(\d+)h/)?.[1];
    if (hours) {
      const parsed = Number.parseInt(hours, 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 24 * 31) return parsed * 60 * 60;
    }
  }
  return undefined;
};

// ── retrieveUserQuotaSummary ────────────────────────────────────────────────

/**
 * Read the grouped summary. Every label and every grouping comes from the
 * payload: the account's real buckets are `gemini-weekly`, `gemini-5h`,
 * `3p-weekly` and `3p-5h`, and splitting them further by model id is what made
 * one bucket render as several rows all showing the same number.
 */
export const buildAntigravitySummaryItems = (payload: unknown): QuotaItem[] => {
  if (!isRecord(payload)) return [];
  const groups = payload.groups ?? payload.quotaGroups ?? payload.quota_groups;
  if (!Array.isArray(groups)) return [];

  const items: QuotaItem[] = [];
  const seen = new Set<string>();

  groups.forEach((rawGroup, groupIndex) => {
    if (!isRecord(rawGroup)) return;
    const groupName =
      normalizeStringValue(rawGroup.displayName ?? rawGroup.display_name) ?? undefined;
    const buckets = rawGroup.buckets ?? rawGroup.quotaBuckets ?? rawGroup.quota_buckets;
    if (!Array.isArray(buckets)) return;

    buckets.forEach((rawBucket, bucketIndex) => {
      if (!isRecord(rawBucket)) return;
      const fraction = normalizeQuotaFraction(
        rawBucket.remainingFraction ?? rawBucket.remaining_fraction ?? rawBucket.remaining,
      );
      const resetTimeRaw = rawBucket.resetTime ?? rawBucket.reset_time;
      const resetAtMs =
        typeof resetTimeRaw === "string" ? parseResetTimeToMs(resetTimeRaw) : undefined;
      if (fraction === null && resetAtMs === undefined) return;

      const bucketId =
        normalizeStringValue(rawBucket.bucketId ?? rawBucket.bucket_id ?? rawBucket.id) ?? "";
      const window = normalizeStringValue(rawBucket.window) ?? "";
      const bucketName =
        normalizeStringValue(rawBucket.displayName ?? rawBucket.display_name) ?? undefined;

      let keyPart = normalizeKeyPart(bucketId);
      if (!keyPart) {
        const windowPart = normalizeKeyPart(window);
        keyPart = windowPart ? `g${groupIndex}_${windowPart}` : `g${groupIndex}_b${bucketIndex}`;
      }
      const key = `${ANTIGRAVITY_QUOTA_KEY_PREFIX}${keyPart}`;
      if (seen.has(key)) return;
      seen.add(key);

      items.push({
        key,
        label: buildSummaryLabel(groupName, bucketName, bucketId, window),
        percent: fraction === null ? null : Math.round(clampPercent(fraction * 100)),
        ...(resetAtMs === undefined ? {} : { resetAtMs }),
        ...(parseAntigravityWindowSeconds(window, bucketId) === undefined
          ? {}
          : { windowSeconds: parseAntigravityWindowSeconds(window, bucketId) }),
      });
    });
  });

  return items;
};

/**
 * Keep the upstream's own wording. Translating it here would mean maintaining a
 * table of names the upstream is free to change without telling us.
 */
const buildSummaryLabel = (
  groupName: string | undefined,
  bucketName: string | undefined,
  bucketId: string,
  window: string,
): string => {
  if (bucketName) {
    if (groupName && groupName.toLowerCase() !== bucketName.toLowerCase()) {
      return `${groupName} · ${bucketName}`;
    }
    return bucketName;
  }
  const base = groupName || bucketId;
  if (!base) return window;
  return window ? `${base} · ${window}` : base;
};

// ── fetchAvailableModels ────────────────────────────────────────────────────

const resolvePayloadAndModels = (
  input: AntigravityFetchAvailableModelsPayload | AntigravityModelsPayload,
): { payload: AntigravityFetchAvailableModelsPayload; models: AntigravityModelsPayload } => {
  const maybePayload = input as AntigravityFetchAvailableModelsPayload;
  if (isRecord(maybePayload.models)) {
    return {
      payload: maybePayload,
      models: maybePayload.models as AntigravityModelsPayload,
    };
  }

  return {
    payload: { models: input as AntigravityModelsPayload },
    models: input as AntigravityModelsPayload,
  };
};

const quotaInfo = (entry?: AntigravityQuotaInfo) => {
  const raw = (entry?.quotaInfo ?? entry?.quota_info ?? {}) as Record<string, unknown>;
  const resetTimeRaw = raw.resetTime ?? raw.reset_time;
  return {
    remainingFraction: normalizeQuotaFraction(
      raw.remainingFraction ?? raw.remaining_fraction ?? raw.remaining,
    ),
    resetTime: typeof resetTimeRaw === "string" ? resetTimeRaw : undefined,
  };
};

const addModelToOrder = (id: string | null, order: string[]) => {
  if (!id) return;
  if (shouldSkipAntigravityModelId(id)) return;
  if (!order.includes(id)) order.push(id);
};

const collectPayloadModelOrder = (payload: AntigravityFetchAvailableModelsPayload) => {
  const order: string[] = [];

  addModelToOrder(normalizeModelId(payload.defaultAgentModelId), order);

  if (Array.isArray(payload.agentModelSorts)) {
    payload.agentModelSorts.forEach((sort) => {
      if (!isRecord(sort)) return;
      const groups = Array.isArray(sort.groups) ? sort.groups : [];
      groups.forEach((group) => {
        if (!isRecord(group)) return;
        normalizeModelIdList(group.modelIds).forEach((id) => addModelToOrder(id, order));
      });
    });
  }

  MODEL_ID_LISTS.forEach((key) => {
    normalizeModelIdList(payload[key]).forEach((id) => addModelToOrder(id, order));
  });

  return order;
};

type ModelEntry = {
  id: string;
  displayName?: string;
  percent: number | null;
  resetAtMs?: number;
};

const collectModelEntries = (
  input: AntigravityFetchAvailableModelsPayload | AntigravityModelsPayload,
): ModelEntry[] => {
  const { payload, models } = resolvePayloadAndModels(input);
  const order = collectPayloadModelOrder(payload);
  const orderedIds = new Set(order);

  Object.keys(models)
    .filter((id) => !orderedIds.has(id))
    .filter((id) => !shouldSkipAntigravityModelId(id))
    .sort((a, b) => a.localeCompare(b))
    .forEach((id) => {
      order.push(id);
      orderedIds.add(id);
    });

  return order.flatMap((id) => {
    const entry = models[id];
    if (!entry) return [];
    const info = quotaInfo(entry);
    if (info.remainingFraction === null && !info.resetTime) return [];
    const resetAtMs = parseResetTimeToMs(info.resetTime);
    return [
      {
        id: normalizeAntigravityModelId(id),
        displayName: normalizeStringValue(entry.displayName) ?? undefined,
        percent:
          info.remainingFraction === null
            ? null
            : Math.round(clampPercent(info.remainingFraction * 100)),
        ...(resetAtMs === undefined ? {} : { resetAtMs }),
      },
    ];
  });
};

const earlierResetAtMs = (current: number | undefined, next: number | undefined) => {
  if (typeof next !== "number" || !Number.isFinite(next)) return current;
  if (typeof current !== "number" || !Number.isFinite(current)) return next;
  return Math.min(current, next);
};

type GroupAccumulator = {
  key: string;
  label: string;
  rank: number;
  percent: number | null;
  resetAtMs?: number;
  count: number;
};

const groupModelEntries = (entries: ModelEntry[]): QuotaItem[] => {
  const grouped = new Map<string, GroupAccumulator>();

  entries.forEach((entry) => {
    const category = categorizeAntigravityModel(entry.id);
    const key =
      category === "other"
        ? `${ANTIGRAVITY_QUOTA_KEY_PREFIX}model_${normalizeKeyPart(entry.id)}`
        : `${ANTIGRAVITY_QUOTA_KEY_PREFIX}${category}`;
    const label = category === "other" ? (entry.displayName ?? entry.id) : CATEGORY_LABELS[category];

    const existing = grouped.get(key) ?? {
      key,
      label,
      rank: CATEGORY_RANK[category],
      percent: null,
      count: 0,
    };

    grouped.set(key, {
      ...existing,
      // Worst remaining in the group: a family shares one bucket upstream, so
      // the pessimistic reading is the one that reflects what is left.
      percent:
        entry.percent === null
          ? existing.percent
          : existing.percent === null
            ? entry.percent
            : Math.min(existing.percent, entry.percent),
      resetAtMs: earlierResetAtMs(existing.resetAtMs, entry.resetAtMs),
      count: existing.count + 1,
    });
  });

  return [...grouped.values()]
    .filter((group) => group.count > 0)
    .sort((a, b) => a.rank - b.rank)
    .map((group) => ({
      key: group.key,
      label: group.label,
      percent: group.percent,
      ...(group.resetAtMs === undefined ? {} : { resetAtMs: group.resetAtMs }),
      windowSeconds: FIVE_HOUR_SECONDS,
    }));
};

/**
 * Keys and labels written by the previous grouping, kept only so cached rows
 * still render while they age out. Nothing new is ever written in these shapes,
 * and unlike the id list this replaced, a model missing from here is classified
 * by shape rather than dropped.
 */
const LEGACY_GROUP_ALIASES: Record<string, Exclude<AntigravityQuotaCategory, "other">> = {
  "provider:gemini3-pro": "gemini_pro",
  "provider:gemini3-flash": "gemini_flash",
  "provider:gemini-image": "gemini_image",
  "provider:claude": "claude",
  "antigravity_quota.gemini3_pro": "gemini_pro",
  "antigravity_quota.gemini3_flash": "gemini_flash",
  "antigravity_quota.gemini_image": "gemini_image",
  "antigravity_quota.claude": "claude",
};

const resolveLegacyCategory = (
  item: QuotaItem,
): Exclude<AntigravityQuotaCategory, "other"> | null => {
  const key = String(item.key ?? "").trim();
  if (key && LEGACY_GROUP_ALIASES[key]) return LEGACY_GROUP_ALIASES[key];
  const label = String(item.label ?? "").trim();
  return label && LEGACY_GROUP_ALIASES[label] ? LEGACY_GROUP_ALIASES[label] : null;
};

export const summarizeAntigravityQuotaItems = (items: QuotaItem[]): QuotaItem[] => {
  // Items already carrying an antigravity key have been grouped upstream (or by
  // the fetch layer) and must pass through untouched — re-grouping them by
  // parsing model ids back out of their labels is what let a summary bucket be
  // mistaken for a model row.
  if (items.some((item) => String(item.key ?? "").startsWith(ANTIGRAVITY_QUOTA_KEY_PREFIX))) {
    return items.filter((item) => String(item.key ?? "").startsWith(ANTIGRAVITY_QUOTA_KEY_PREFIX));
  }

  const legacyGrouped = new Map<string, QuotaItem>();
  const modelEntries: ModelEntry[] = [];

  items.forEach((item) => {
    const percent =
      typeof item.percent === "number" && Number.isFinite(item.percent)
        ? clampPercent(item.percent)
        : null;

    const legacy = resolveLegacyCategory(item);
    if (legacy) {
      const key = `${ANTIGRAVITY_QUOTA_KEY_PREFIX}${legacy}`;
      const existing = legacyGrouped.get(key);
      legacyGrouped.set(key, {
        key,
        label: CATEGORY_LABELS[legacy],
        percent:
          percent === null
            ? (existing?.percent ?? null)
            : existing?.percent == null
              ? percent
              : Math.min(existing.percent, percent),
        ...(earlierResetAtMs(existing?.resetAtMs, item.resetAtMs) === undefined
          ? {}
          : { resetAtMs: earlierResetAtMs(existing?.resetAtMs, item.resetAtMs) }),
        windowSeconds: FIVE_HOUR_SECONDS,
      });
      return;
    }

    const id = resolveModelIdFromQuotaItem(item);
    if (!id || shouldSkipAntigravityModelId(id)) return;
    modelEntries.push({
      id,
      displayName: extractDisplayNameFromLabel(item.label),
      percent,
      ...(item.resetAtMs === undefined ? {} : { resetAtMs: item.resetAtMs }),
    });
  });

  const fromModels = groupModelEntries(modelEntries);
  if (legacyGrouped.size === 0) return fromModels;

  const ordered = [...legacyGrouped.values()].sort(
    (a, b) =>
      CATEGORY_RANK[categoryFromKey(a.key)] - CATEGORY_RANK[categoryFromKey(b.key)],
  );
  return [...ordered, ...fromModels.filter((item) => !legacyGrouped.has(String(item.key)))];
};

const categoryFromKey = (key: string | undefined): AntigravityQuotaCategory => {
  const suffix = String(key ?? "").slice(ANTIGRAVITY_QUOTA_KEY_PREFIX.length);
  return suffix in CATEGORY_RANK ? (suffix as AntigravityQuotaCategory) : "other";
};

const MODEL_KEY_PREFIX = "model:";

const resolveModelIdFromQuotaItem = (item: QuotaItem): string | null => {
  const key = typeof item.key === "string" ? item.key.trim() : "";
  if (key.startsWith(MODEL_KEY_PREFIX)) {
    return key.slice(MODEL_KEY_PREFIX.length).trim() || null;
  }
  const label = String(item.label ?? "").trim();
  const bracketModelId = label.match(/\[([^\]]+)\]\s*$/)?.[1]?.trim();
  if (bracketModelId) return bracketModelId;
  return key || label || null;
};

const extractDisplayNameFromLabel = (label: string): string | undefined => {
  const trimmed = String(label ?? "").trim();
  const withoutId = trimmed.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
  return withoutId || undefined;
};

export const filterAntigravityQuotaItems = (items: QuotaItem[]): QuotaItem[] =>
  summarizeAntigravityQuotaItems(items);

export const buildAntigravityItems = (
  input: AntigravityFetchAvailableModelsPayload | AntigravityModelsPayload,
): QuotaItem[] => groupModelEntries(collectModelEntries(input));

export const buildAntigravityGroups = (
  input: AntigravityFetchAvailableModelsPayload | AntigravityModelsPayload,
) =>
  buildAntigravityItems(input).map((item) => {
    const resetTime =
      typeof item.resetAtMs === "number" && Number.isFinite(item.resetAtMs)
        ? new Date(item.resetAtMs).toISOString()
        : undefined;
    return {
      id: item.key ?? item.label,
      label: item.label,
      remainingFraction: item.percent === null ? 0 : item.percent / 100,
      ...(resetTime ? { resetTime } : {}),
    };
  });

/**
 * Deprecated model ids the upstream reports alongside the model list, as
 * `{ oldId: { newModelId } }`. The upstream drives its own retirements; nothing
 * here needs a table of which model replaced which.
 */
export const parseAntigravityForwardingRules = (payload: unknown): Record<string, string> => {
  if (!isRecord(payload)) return {};
  const deprecated = payload.deprecatedModelIds ?? payload.deprecated_model_ids;
  if (!isRecord(deprecated)) return {};

  const rules: Record<string, string> = {};
  Object.entries(deprecated).forEach(([oldId, info]) => {
    const target = isRecord(info)
      ? normalizeStringValue(info.newModelId ?? info.new_model_id)
      : normalizeStringValue(info);
    const source = normalizeStringValue(oldId);
    if (source && target) rules[source] = target;
  });
  return rules;
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
  return typeof payload === "object" ? (payload as Record<string, unknown>) : null;
};
