import type { TFunction } from "i18next";
import { parseAdditionalQuotaWindowLabel } from "@code-proxy/domain";
import type { QuotaCardSlot } from "./quotaCardSlots";

export const WEEKLY_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export type GroupWeeklyFamily = {
  id: string;
  label: string;
  remainingPercent: number | null;
  sampleCount: number;
};

export type GroupOverviewSummary = {
  totalCalls: number;
  averageFiveHour: number | null;
  averageWeekly: number | null;
  weeklyFamilies: GroupWeeklyFamily[];
  quotaSampleCount: number;
};

export type GroupTrendPoint = {
  date: string;
  label: string;
  calls: number;
  weeklyPercent: number | null;
  weeklyPercents: Record<string, number | null>;
};

// Distinct from the call bars (blue) and from each other so two Antigravity
// weeklies can sit on the same axis without blending into one "average".
export const WEEKLY_SERIES_COLORS = ["#0f766e", "#d97706", "#2563eb", "#7c3aed", "#db2777", "#0891b2"];

export const isWeeklyWindow = (windowSeconds: number | null | undefined): boolean =>
  typeof windowSeconds === "number" && Number.isFinite(windowSeconds) && windowSeconds >= WEEKLY_WINDOW_SECONDS;

const shortenAntigravityGroupName = (name: string): string => {
  const trimmed = name.trim();
  return trimmed.replace(/\s+models?$/i, "").trim() || trimmed;
};

export const collectWeeklyFamilies = (slotsByFile: QuotaCardSlot[][]): GroupWeeklyFamily[] => {
  const order: string[] = [];
  const buckets = new Map<string, { label: string; values: number[] }>();
  for (const slots of slotsByFile) {
    for (const slot of slots) {
      if (!isWeeklyWindow(slot.item?.windowSeconds ?? null)) continue;
      const percent = slot.item?.percent;
      if (typeof percent !== "number" || !Number.isFinite(percent)) continue;
      const existing = buckets.get(slot.id);
      if (!existing) {
        order.push(slot.id);
        buckets.set(slot.id, { label: slot.label, values: [percent] });
        continue;
      }
      existing.values.push(percent);
    }
  }
  return order.map((id) => {
    const bucket = buckets.get(id);
    if (!bucket) {
      return { id, label: id, remainingPercent: null, sampleCount: 0 };
    }
    const sum = bucket.values.reduce((total, value) => total + value, 0);
    return {
      id,
      label: bucket.label,
      remainingPercent: sum / bucket.values.length,
      sampleCount: bucket.values.length,
    };
  });
};

export type RawGroupQuotaSeries = {
  quota_key?: string;
  quota_label?: string;
  window_seconds?: number;
  points?: { date: string; percent: number | null }[];
};

export const normalizeGroupTrendSeries = (
  quotaSeries: RawGroupQuotaSeries[] | undefined,
  quotaPoints: { date: string; percent: number | null }[] | undefined,
): RawGroupQuotaSeries[] => {
  if (Array.isArray(quotaSeries) && quotaSeries.length > 0) return quotaSeries;
  if (quotaPoints && quotaPoints.length > 0) {
    return [
      {
        quota_key: "code_week",
        quota_label: "",
        window_seconds: WEEKLY_WINDOW_SECONDS,
        points: quotaPoints,
      },
    ];
  }
  return [];
};

export const formatWeeklySeriesLabel = (quotaKey: string, quotaLabel: string, t: TFunction): string => {
  const key = quotaKey.trim();
  const label = quotaLabel.trim();
  if (key === "code_week") return t("m_quota.code_weekly");
  if (key === "review_week") return t("m_quota.review_weekly");
  if (key.startsWith("antigravity:")) {
    const group = shortenAntigravityGroupName(label || key);
    return `${group} · ${t("antigravity_quota.window_weekly")}`;
  }
  if (label.startsWith("m_quota.")) return t(label);
  const additional = parseAdditionalQuotaWindowLabel(label);
  if (additional) {
    return t(`m_quota.additional_${additional.window}`, { name: additional.name });
  }
  if (label) return label;
  return key || t("auth_files.group_overview_avg_week_label");
};


