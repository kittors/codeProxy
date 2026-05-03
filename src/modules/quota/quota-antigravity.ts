import {
  clampPercent,
  isRecord,
  normalizeNumberValue,
  normalizeQuotaFraction,
  normalizeStringValue,
  parseResetTimeToMs,
} from "@/modules/quota/quota-normalizers";
import type { QuotaItem } from "@/modules/quota/quota-types";

type AntigravityQuotaInfo = {
  displayName?: string;
  quotaInfo?: Record<string, unknown>;
  quota_info?: Record<string, unknown>;
  maxTokens?: unknown;
  maxOutputTokens?: unknown;
  tokenizerType?: unknown;
  apiProvider?: unknown;
  modelProvider?: unknown;
  model?: unknown;
  supportsImages?: unknown;
  supportsThinking?: unknown;
  supportsVideo?: unknown;
  recommended?: unknown;
  isInternal?: unknown;
  tagTitle?: unknown;
  thinkingBudget?: unknown;
  minThinkingBudget?: unknown;
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

const MODEL_ID_LISTS: Array<[keyof AntigravityFetchAvailableModelsPayload, string]> = [
  ["commandModelIds", "Command"],
  ["tabModelIds", "Tab"],
  ["imageGenerationModelIds", "Image Generation"],
  ["mqueryModelIds", "MQuery"],
  ["webSearchModelIds", "Web Search"],
  ["commitMessageModelIds", "Commit Message"],
];

const normalizeModelId = (value: unknown): string | null => normalizeStringValue(value);

const normalizeModelIdList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(normalizeModelId).filter((id): id is string => Boolean(id)) : [];

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

const addModelRole = (
  id: string | null,
  role: string,
  order: string[],
  rolesByModel: Map<string, Set<string>>,
) => {
  if (!id) return;
  if (!rolesByModel.has(id)) rolesByModel.set(id, new Set());
  rolesByModel.get(id)?.add(role);
  if (!order.includes(id)) order.push(id);
};

const collectPayloadModelOrder = (payload: AntigravityFetchAvailableModelsPayload) => {
  const order: string[] = [];
  const rolesByModel = new Map<string, Set<string>>();

  addModelRole(normalizeModelId(payload.defaultAgentModelId), "Default Agent", order, rolesByModel);

  if (Array.isArray(payload.agentModelSorts)) {
    payload.agentModelSorts.forEach((sort) => {
      if (!isRecord(sort)) return;
      const sortLabel = normalizeStringValue(sort.displayName) ?? "Agent Models";
      const groups = Array.isArray(sort.groups) ? sort.groups : [];
      groups.forEach((group) => {
        if (!isRecord(group)) return;
        normalizeModelIdList(group.modelIds).forEach((id) =>
          addModelRole(id, sortLabel, order, rolesByModel),
        );
      });
    });
  }

  MODEL_ID_LISTS.forEach(([key, label]) => {
    normalizeModelIdList(payload[key]).forEach((id) =>
      addModelRole(id, label, order, rolesByModel),
    );
  });

  return { order, rolesByModel };
};

const buildModelLabel = (id: string, entry: AntigravityQuotaInfo): string => {
  const displayName = normalizeStringValue(entry.displayName);
  if (!displayName || displayName === id) return id;
  return `${displayName} [${id}]`;
};

const appendStringMeta = (parts: string[], label: string, value: unknown) => {
  const normalized = normalizeStringValue(value);
  if (normalized) parts.push(`${label}=${normalized}`);
};

const appendNumberMeta = (parts: string[], label: string, value: unknown) => {
  const normalized = normalizeNumberValue(value);
  if (normalized !== null) parts.push(`${label}=${normalized}`);
};

const buildModelMeta = (entry: AntigravityQuotaInfo, roles?: Set<string>): string | undefined => {
  const parts: string[] = [];
  if (roles) parts.push(...Array.from(roles));
  appendNumberMeta(parts, "maxTokens", entry.maxTokens);
  appendNumberMeta(parts, "maxOutputTokens", entry.maxOutputTokens);
  appendStringMeta(parts, "apiProvider", entry.apiProvider);
  appendStringMeta(parts, "modelProvider", entry.modelProvider);
  appendStringMeta(parts, "model", entry.model);
  appendStringMeta(parts, "tokenizer", entry.tokenizerType);
  appendStringMeta(parts, "tag", entry.tagTitle);
  appendNumberMeta(parts, "thinkingBudget", entry.thinkingBudget);
  appendNumberMeta(parts, "minThinkingBudget", entry.minThinkingBudget);

  if (entry.supportsThinking === true) parts.push("thinking");
  if (entry.supportsImages === true) parts.push("images");
  if (entry.supportsVideo === true) parts.push("video");
  if (entry.recommended === true) parts.push("recommended");
  if (entry.isInternal === true) parts.push("internal");

  const uniqueParts = parts.filter((part, index, all) => all.indexOf(part) === index);
  return uniqueParts.length > 0 ? uniqueParts.join(" · ") : undefined;
};

export const buildAntigravityItems = (
  input: AntigravityFetchAvailableModelsPayload | AntigravityModelsPayload,
): QuotaItem[] => {
  const { payload, models } = resolvePayloadAndModels(input);
  const { order, rolesByModel } = collectPayloadModelOrder(payload);
  const orderedIds = new Set(order);

  Object.keys(models)
    .filter((id) => !orderedIds.has(id))
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
        meta: buildModelMeta(entry, rolesByModel.get(id)),
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
