import { clampPercent } from "@features/quota-preview/quota-normalizers";
import type { QuotaItem } from "@features/quota-preview/quota-types";

export const ANTIGRAVITY_QUOTA_KEY_PREFIX = "antigravity:";

const FIVE_HOUR_SECONDS = 5 * 60 * 60;

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

type ModelEntry = {
  id: string;
  displayName?: string;
  percent: number | null;
  resetAtMs?: number;
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
  // the backend status probe) and must pass through untouched — re-grouping
  // them by parsing model ids back out of their labels is what let a summary
  // bucket be mistaken for a model row.
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
