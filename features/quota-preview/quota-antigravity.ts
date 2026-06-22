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

const REFERENCE_SKIPPED_MODEL_IDS = new Set([
  "chat_20706",
  "chat_23310",
  "tab_flash_lite_preview",
  "tab_jump_flash_lite_preview",
  "gemini-2.5-flash-thinking",
  "gemini-2.5-pro",
]);

const normalizeModelId = (value: unknown): string | null => normalizeStringValue(value);

const normalizeModelIdList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(normalizeModelId).filter((id): id is string => Boolean(id)) : [];

export const shouldSkipAntigravityModelId = (id: string): boolean =>
  REFERENCE_SKIPPED_MODEL_IDS.has(id);

const ANTIGRAVITY_MODEL_KEY_PREFIX = "model:";
const ANTIGRAVITY_SUMMARY_KEY_PREFIX = "provider:";

type AntigravityQuotaGroup = "gemini3Pro" | "gemini3Flash" | "gemini3Image" | "claude";

const ANTIGRAVITY_QUOTA_GROUPS: Array<{
  group: AntigravityQuotaGroup;
  key: string;
  label: string;
}> = [
  { group: "gemini3Pro", key: "provider:gemini3-pro", label: "antigravity_quota.gemini3_pro" },
  {
    group: "gemini3Flash",
    key: "provider:gemini3-flash",
    label: "antigravity_quota.gemini3_flash",
  },
  { group: "gemini3Image", key: "provider:gemini-image", label: "antigravity_quota.gemini_image" },
  { group: "claude", key: "provider:claude", label: "antigravity_quota.claude" },
];

const ANTIGRAVITY_QUOTA_GROUP_MODEL_IDS: Record<AntigravityQuotaGroup, ReadonlySet<string>> = {
  gemini3Pro: new Set([
    "gemini-3-pro-low",
    "gemini-3-pro-high",
    "gemini-3-pro-preview",
    "gemini-3.1-pro-low",
    "gemini-3.1-pro-high",
    "gemini-3.1-pro-preview",
  ]),
  gemini3Flash: new Set(["gemini-3-flash", "gemini-3-flash-agent"]),
  gemini3Image: new Set([
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image",
    "gemini-3-pro-image",
    "gemini-3-pro-image-preview",
  ]),
  claude: new Set([
    "claude-fable-5",
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-thinking",
    "claude-opus-4-5-thinking",
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-opus-4-6-thinking",
    "claude-opus-4-7",
    "claude-opus-4-8",
  ]),
};

const normalizeAntigravityModelIdForGroup = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("models/") ? normalized.slice("models/".length) : normalized;
};

const resolveAntigravityModelIdFromQuotaItem = (item: QuotaItem): string | null => {
  const key = typeof item.key === "string" ? item.key.trim() : "";
  if (key.startsWith(ANTIGRAVITY_MODEL_KEY_PREFIX)) {
    return key.slice(ANTIGRAVITY_MODEL_KEY_PREFIX.length).trim() || null;
  }
  if (key && shouldSkipAntigravityModelId(key)) return key;

  const label = String(item.label ?? "").trim();
  const bracketModelId = label.match(/\[([^\]]+)\]\s*$/)?.[1]?.trim();
  if (bracketModelId) return bracketModelId;
  return label && shouldSkipAntigravityModelId(label) ? label : null;
};

const resolveAntigravityQuotaGroupFromModelId = (id: string): AntigravityQuotaGroup | null => {
  const modelId = normalizeAntigravityModelIdForGroup(id);
  const match = ANTIGRAVITY_QUOTA_GROUPS.find(({ group }) =>
    ANTIGRAVITY_QUOTA_GROUP_MODEL_IDS[group].has(modelId),
  );
  return match?.group ?? null;
};

const resolveAntigravityQuotaGroupFromSummaryValue = (
  value: string,
): AntigravityQuotaGroup | null =>
  ANTIGRAVITY_QUOTA_GROUPS.find((group) => group.key === value || group.label === value)?.group ??
  null;

const resolveAntigravityQuotaGroupFromItem = (item: QuotaItem): AntigravityQuotaGroup | null => {
  const key = typeof item.key === "string" ? item.key.trim() : "";
  if (key.startsWith(ANTIGRAVITY_SUMMARY_KEY_PREFIX)) {
    const group = resolveAntigravityQuotaGroupFromSummaryValue(key);
    if (group) return group;
  }
  const label = String(item.label ?? "").trim();
  const labelGroup = resolveAntigravityQuotaGroupFromSummaryValue(label);
  if (labelGroup) return labelGroup;
  const modelId = resolveAntigravityModelIdFromQuotaItem(item);
  return modelId ? resolveAntigravityQuotaGroupFromModelId(modelId) : null;
};

const resolveAntigravityQuotaGroupFromModel = (id: string): AntigravityQuotaGroup | null =>
  resolveAntigravityQuotaGroupFromModelId(id);

const earlierResetAtMs = (current: number | undefined, next: number | undefined) => {
  if (typeof next !== "number" || !Number.isFinite(next)) return current;
  if (typeof current !== "number" || !Number.isFinite(current)) return next;
  return Math.min(current, next);
};

export const summarizeAntigravityQuotaItems = (items: QuotaItem[]): QuotaItem[] => {
  const grouped = new Map<
    AntigravityQuotaGroup,
    { percent: number | null; resetAtMs?: number; count: number }
  >();

  items.forEach((item) => {
    const modelId = resolveAntigravityModelIdFromQuotaItem(item);
    if (modelId && shouldSkipAntigravityModelId(modelId)) return;

    const group = resolveAntigravityQuotaGroupFromItem(item);
    if (!group) return;

    const existing = grouped.get(group) ?? { percent: null, count: 0 };
    const percent =
      typeof item.percent === "number" && Number.isFinite(item.percent)
        ? clampPercent(item.percent)
        : null;

    grouped.set(group, {
      percent:
        percent === null
          ? existing.percent
          : existing.percent === null
            ? percent
            : Math.min(existing.percent, percent),
      resetAtMs: earlierResetAtMs(existing.resetAtMs, item.resetAtMs),
      count: existing.count + 1,
    });
  });

  return ANTIGRAVITY_QUOTA_GROUPS.flatMap(({ group, key, label }) => {
    const summary = grouped.get(group);
    if (!summary || summary.count === 0) return [];
    return [
      {
        key,
        label,
        percent: summary.percent,
        resetAtMs: summary.resetAtMs,
      },
    ];
  });
};

export const filterAntigravityQuotaItems = (items: QuotaItem[]): QuotaItem[] =>
  summarizeAntigravityQuotaItems(items);

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

const buildModelLabel = (id: string, entry: AntigravityQuotaInfo): string => {
  const displayName = normalizeStringValue(entry.displayName);
  if (!displayName || displayName === id) return id;
  return `${displayName} [${id}]`;
};

const buildAntigravityModelItems = (
  input: AntigravityFetchAvailableModelsPayload | AntigravityModelsPayload,
): QuotaItem[] => {
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
    if (!resolveAntigravityQuotaGroupFromModel(id)) return [];
    const info = quotaInfo(entry);
    if (info.remainingFraction === null && !info.resetTime) return [];
    const percent =
      info.remainingFraction === null
        ? null
        : Math.round(clampPercent(info.remainingFraction * 100));

    return [
      {
        key: `model:${id}`,
        label: buildModelLabel(id, entry),
        percent,
        resetAtMs: parseResetTimeToMs(info.resetTime),
      },
    ];
  });
};

export const buildAntigravityItems = (
  input: AntigravityFetchAvailableModelsPayload | AntigravityModelsPayload,
): QuotaItem[] => summarizeAntigravityQuotaItems(buildAntigravityModelItems(input));

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
