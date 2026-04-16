import {
  normalizeQuotaFraction,
  parseResetTimeToMs,
} from "@/modules/quota/quota-normalizers";
import type { QuotaItem } from "@/modules/quota/quota-types";

type AntigravityQuotaInfo = {
  displayName?: string;
  quotaInfo?: Record<string, unknown>;
  quota_info?: Record<string, unknown>;
};

export type AntigravityModelsPayload = Record<string, AntigravityQuotaInfo>;

const GROUPS: Array<{
  id: string;
  label: string;
  identifiers: string[];
  labelFromModel?: boolean;
}> = [
  { id: "claude-gpt", label: "Claude/GPT", identifiers: ["claude-sonnet-4-5-thinking", "claude-opus-4-5-thinking", "claude-sonnet-4-5", "gpt-oss-120b-medium"] },
  { id: "gemini-3-pro", label: "Gemini 3 Pro", identifiers: ["gemini-3-pro-high", "gemini-3-pro-low"] },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", identifiers: ["gemini-2.5-flash", "gemini-2.5-flash-thinking"] },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", identifiers: ["gemini-2.5-flash-lite"] },
  { id: "gemini-2-5-cu", label: "Gemini 2.5 CU", identifiers: ["rev19-uic3-1p"] },
  { id: "gemini-3-flash", label: "Gemini 3 Flash", identifiers: ["gemini-3-flash"] },
  { id: "gemini-image", label: "gemini-3-pro-image", identifiers: ["gemini-3-pro-image"], labelFromModel: true },
];

const findModel = (models: AntigravityModelsPayload, identifier: string) => {
  const direct = models[identifier];
  if (direct) return { id: identifier, entry: direct };
  const match = Object.entries(models).find(([, entry]) =>
    String(entry?.displayName ?? "").toLowerCase() === identifier.toLowerCase(),
  );
  return match ? { id: match[0], entry: match[1] } : null;
};

const quotaInfo = (entry?: AntigravityQuotaInfo) => {
  const raw = (entry?.quotaInfo ?? entry?.quota_info ?? {}) as Record<string, unknown>;
  return {
    remainingFraction: normalizeQuotaFraction(raw.remainingFraction ?? raw.remaining_fraction ?? raw.remaining),
    resetTime: typeof (raw.resetTime ?? raw.reset_time) === "string" ? String(raw.resetTime ?? raw.reset_time) : undefined,
    displayName: typeof entry?.displayName === "string" ? entry.displayName : undefined,
  };
};

export const buildAntigravityGroups = (models: AntigravityModelsPayload) => {
  const groups: { id: string; label: string; remainingFraction: number; resetTime?: string }[] = [];
  let geminiProResetTime: string | undefined;
  for (const group of GROUPS) {
    const entries = group.identifiers
      .map((identifier) => findModel(models, identifier))
      .filter(Boolean)
      .map((match) => {
        const info = quotaInfo(match?.entry);
        return {
          label: group.labelFromModel ? (info.displayName ?? match?.id ?? group.label) : group.label,
          remainingFraction: info.remainingFraction,
          resetTime: info.resetTime,
        };
      })
      .filter((item) => item.remainingFraction !== null);
    const reset = entries.find((item) => item.resetTime)?.resetTime;
    if (group.id === "gemini-3-pro" && reset) geminiProResetTime = reset;
    groups.push({
      id: group.id,
      label: group.label,
      remainingFraction: entries.length
        ? entries.reduce((acc, item) => acc + (item.remainingFraction ?? 0), 0) / entries.length
        : 0,
      ...(reset ? { resetTime: reset } : {}),
    });
  }
  if (geminiProResetTime) {
    groups.forEach((group) => {
      if (group.id.startsWith("gemini-") && !group.resetTime) group.resetTime = geminiProResetTime;
    });
  }
  return groups;
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

export const buildAntigravityItems = (models: AntigravityModelsPayload): QuotaItem[] =>
  buildAntigravityGroups(models).map((group) => ({
    label: group.label,
    percent: Math.round(group.remainingFraction * 100),
    resetAtMs: parseResetTimeToMs(group.resetTime),
  }));
