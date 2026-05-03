import {
  clampPercent,
  isRecord,
  normalizeQuotaFraction,
  normalizeStringValue,
  parseResetTimeToMs,
} from "@/modules/quota/quota-normalizers";
import type { QuotaItem } from "@/modules/quota/quota-types";

type AntigravityQuotaInfo = {
  displayName?: string;
  quotaInfo?: Record<string, unknown>;
  quota_info?: Record<string, unknown>;
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

const shouldSkipModel = (id: string): boolean => REFERENCE_SKIPPED_MODEL_IDS.has(id);

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
  if (shouldSkipModel(id)) return;
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

export const buildAntigravityItems = (
  input: AntigravityFetchAvailableModelsPayload | AntigravityModelsPayload,
): QuotaItem[] => {
  const { payload, models } = resolvePayloadAndModels(input);
  const order = collectPayloadModelOrder(payload);
  const orderedIds = new Set(order);

  Object.keys(models)
    .filter((id) => !orderedIds.has(id))
    .filter((id) => !shouldSkipModel(id))
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
