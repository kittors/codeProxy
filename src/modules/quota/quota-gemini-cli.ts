import type { AuthFileItem } from "@/lib/http/types";
import {
  isRecord,
  normalizeNumberValue,
  normalizeQuotaFraction,
  normalizeStringValue,
} from "@/modules/quota/quota-normalizers";

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

type ParsedGeminiCliBucket = {
  modelId: string;
  tokenType: string | null;
  remainingFraction: number | null;
  remainingAmount: number | null;
  resetTime?: string;
};

const GROUPS: Array<{
  id: string;
  label: string;
  preferredModelId?: string;
  modelIds: string[];
}> = [
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", preferredModelId: "gemini-2.5-pro", modelIds: ["gemini-2.5-pro", "gemini-2.5-pro-preview"] },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", preferredModelId: "gemini-2.5-flash", modelIds: ["gemini-2.5-flash", "gemini-2.5-flash-preview"] },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", preferredModelId: "gemini-2.5-flash-lite", modelIds: ["gemini-2.5-flash-lite"] },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", preferredModelId: "gemini-2.0-flash", modelIds: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.0-flash-exp"] },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", preferredModelId: "gemini-1.5-pro", modelIds: ["gemini-1.5-pro", "gemini-1.5-pro-latest"] },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", preferredModelId: "gemini-1.5-flash", modelIds: ["gemini-1.5-flash", "gemini-1.5-flash-latest"] },
];

const ORDER = new Map(GROUPS.map((group, index) => [group.id, index] as const));
const LOOKUP = new Map(GROUPS.flatMap((group) => group.modelIds.map((id) => [id, group] as const)));
const IGNORED_MODEL_PREFIXES = ["gemini-2.0-flash"];

export const normalizeGeminiCliBucket = (
  bucket: GeminiCliQuotaBucket,
): ParsedGeminiCliBucket | null => {
  const modelId = normalizeGeminiCliModelId(bucket.modelId ?? bucket.model_id);
  if (!modelId) return null;
  return {
    modelId,
    tokenType: normalizeStringValue(bucket.tokenType ?? bucket.token_type),
    remainingFraction: normalizeQuotaFraction(bucket.remainingFraction ?? bucket.remaining_fraction),
    remainingAmount: normalizeNumberValue(bucket.remainingAmount ?? bucket.remaining_amount),
    resetTime: normalizeStringValue(bucket.resetTime ?? bucket.reset_time) ?? undefined,
  };
};

export const buildGeminiCliBuckets = (buckets: ParsedGeminiCliBucket[]) => {
  const grouped = new Map<string, {
    id: string;
    label: string;
    tokenType: string | null;
    modelIds: string[];
    preferredBucket: ParsedGeminiCliBucket | null;
    fallbackRemainingFraction: number | null;
    fallbackRemainingAmount: number | null;
    fallbackResetTime?: string;
  }>();
  for (const bucket of buckets) {
    if (IGNORED_MODEL_PREFIXES.some((prefix) => bucket.modelId.startsWith(prefix))) continue;
    const groupDef = LOOKUP.get(bucket.modelId);
    const groupId = groupDef?.id ?? bucket.modelId;
    const key = `${groupId}:${bucket.tokenType ?? ""}`;
    const existing = grouped.get(key) ?? {
      id: groupId,
      label: groupDef?.label ?? bucket.modelId,
      tokenType: bucket.tokenType,
      modelIds: [],
      preferredBucket: null,
      fallbackRemainingFraction: null,
      fallbackRemainingAmount: null,
      fallbackResetTime: undefined,
    };
    existing.modelIds.push(bucket.modelId);
    if (groupDef?.preferredModelId === bucket.modelId) existing.preferredBucket = bucket;
    if (existing.fallbackRemainingFraction === null && bucket.remainingFraction !== null) existing.fallbackRemainingFraction = bucket.remainingFraction;
    if (existing.fallbackRemainingAmount === null && bucket.remainingAmount !== null) existing.fallbackRemainingAmount = bucket.remainingAmount;
    if (!existing.fallbackResetTime && bucket.resetTime) existing.fallbackResetTime = bucket.resetTime;
    grouped.set(key, existing);
  }
  return Array.from(grouped.values())
    .sort((left, right) => {
      const diff = (ORDER.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (ORDER.get(right.id) ?? Number.MAX_SAFE_INTEGER);
      return diff || (left.tokenType ?? "").localeCompare(right.tokenType ?? "");
    })
    .map((group) => {
      const preferred = group.preferredBucket;
      return {
        id: group.id,
        label: group.label,
        tokenType: group.tokenType,
        remainingFraction: preferred ? preferred.remainingFraction : group.fallbackRemainingFraction,
        remainingAmount: preferred ? preferred.remainingAmount : group.fallbackRemainingAmount,
        resetTime: preferred ? preferred.resetTime : group.fallbackResetTime,
        modelIds: Array.from(new Set(group.modelIds)),
      };
    });
};

const extractProjectId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const matches = Array.from(value.matchAll(/\(([^()]+)\)/g));
  const candidate = matches.at(-1)?.[1]?.trim();
  return candidate || null;
};

export const resolveGeminiCliProjectId = (file: AuthFileItem): string | null => {
  const metadata = isRecord(file.metadata) ? (file.metadata as Record<string, unknown>) : null;
  const attributes = isRecord(file.attributes) ? (file.attributes as Record<string, unknown>) : null;
  const candidates = [file.account, (file as any).account, metadata?.account, attributes?.account];
  for (const candidate of candidates) {
    const projectId = extractProjectId(candidate);
    if (projectId) return projectId;
  }
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
  return typeof payload === "object" ? (payload as GeminiCliQuotaPayload) : null;
};
