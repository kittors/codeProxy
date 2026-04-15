import type { ScriptableContext } from "chart.js";
import { collectUsageDetails, extractTotalTokens } from "./details";
import { formatDayLabel, formatHourLabel } from "./formatters";

export interface ChartDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor:
    | string
    | CanvasGradient
    | ((context: ScriptableContext<"line">) => string | CanvasGradient);
  pointBackgroundColor?: string;
  pointBorderColor?: string;
  fill: boolean;
  tension: number;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

const CHART_COLORS = [
  { borderColor: "#3b82f6", backgroundColor: "rgba(59, 130, 246, 0.15)" },
  { borderColor: "#22c55e", backgroundColor: "rgba(34, 197, 94, 0.15)" },
  { borderColor: "#f59e0b", backgroundColor: "rgba(245, 158, 11, 0.15)" },
  { borderColor: "#ef4444", backgroundColor: "rgba(239, 68, 68, 0.15)" },
  { borderColor: "#8b5cf6", backgroundColor: "rgba(139, 92, 246, 0.15)" },
  { borderColor: "#06b6d4", backgroundColor: "rgba(6, 182, 212, 0.15)" },
  { borderColor: "#ec4899", backgroundColor: "rgba(236, 72, 153, 0.15)" },
  { borderColor: "#84cc16", backgroundColor: "rgba(132, 204, 22, 0.15)" },
  { borderColor: "#f97316", backgroundColor: "rgba(249, 115, 22, 0.15)" },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (![r, g, b].every((channel) => Number.isFinite(channel))) return null;
  return { r, g, b };
};

const withAlpha = (hex: string, alpha: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const clamped = clamp(alpha, 0, 1);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamped})`;
};

const buildAreaGradient = (
  context: ScriptableContext<"line">,
  baseHex: string,
  fallback: string,
) => {
  const chart = context.chart;
  const ctx = chart.ctx;
  const area = chart.chartArea;
  if (!area) return fallback;

  const gradient = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  gradient.addColorStop(0, withAlpha(baseHex, 0.28));
  gradient.addColorStop(0.6, withAlpha(baseHex, 0.12));
  gradient.addColorStop(1, withAlpha(baseHex, 0.02));
  return gradient;
};

export function buildHourlySeriesByModel(
  usageData: unknown,
  metric: "requests" | "tokens" = "requests",
  hourWindow: number = 24,
): {
  labels: string[];
  dataByModel: Map<string, number[]>;
  hasData: boolean;
} {
  const hourMs = 60 * 60 * 1000;
  const resolvedHourWindow =
    Number.isFinite(hourWindow) && hourWindow > 0
      ? Math.min(Math.max(Math.floor(hourWindow), 1), 24 * 31)
      : 24;
  const now = new Date();
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);

  const earliestBucket = new Date(currentHour);
  earliestBucket.setHours(earliestBucket.getHours() - (resolvedHourWindow - 1));
  const earliestTime = earliestBucket.getTime();

  const labels: string[] = [];
  for (let i = 0; i < resolvedHourWindow; i++) {
    const bucketStart = earliestTime + i * hourMs;
    labels.push(formatHourLabel(new Date(bucketStart)));
  }

  const details = collectUsageDetails(usageData);
  const dataByModel = new Map<string, number[]>();
  let hasData = false;

  if (!details.length) {
    return { labels, dataByModel, hasData };
  }

  details.forEach((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    if (Number.isNaN(timestamp)) return;

    const normalized = new Date(timestamp);
    normalized.setMinutes(0, 0, 0);
    const bucketStart = normalized.getTime();
    const lastBucketTime = earliestTime + (labels.length - 1) * hourMs;
    if (bucketStart < earliestTime || bucketStart > lastBucketTime) return;

    const bucketIndex = Math.floor((bucketStart - earliestTime) / hourMs);
    if (bucketIndex < 0 || bucketIndex >= labels.length) return;

    const modelName = detail.__modelName || "Unknown";
    if (!dataByModel.has(modelName)) {
      dataByModel.set(modelName, Array.from({ length: labels.length }, () => 0));
    }

    const bucketValues = dataByModel.get(modelName)!;
    bucketValues[bucketIndex] += metric === "tokens" ? extractTotalTokens(detail) : 1;
    hasData = true;
  });

  return { labels, dataByModel, hasData };
}

export function buildDailySeriesByModel(
  usageData: unknown,
  metric: "requests" | "tokens" = "requests",
): {
  labels: string[];
  dataByModel: Map<string, number[]>;
  hasData: boolean;
} {
  const details = collectUsageDetails(usageData);
  const valuesByModel = new Map<string, Map<string, number>>();
  const labelsSet = new Set<string>();
  let hasData = false;

  if (!details.length) {
    return { labels: [], dataByModel: new Map(), hasData };
  }

  details.forEach((detail) => {
    const timestamp = Date.parse(detail.timestamp);
    if (Number.isNaN(timestamp)) return;
    const dayLabel = formatDayLabel(new Date(timestamp));
    if (!dayLabel) return;

    const modelName = detail.__modelName || "Unknown";
    if (!valuesByModel.has(modelName)) {
      valuesByModel.set(modelName, new Map());
    }
    const modelDayMap = valuesByModel.get(modelName)!;
    const increment = metric === "tokens" ? extractTotalTokens(detail) : 1;
    modelDayMap.set(dayLabel, (modelDayMap.get(dayLabel) || 0) + increment);
    labelsSet.add(dayLabel);
    hasData = true;
  });

  const labels = Array.from(labelsSet).sort();
  const dataByModel = new Map<string, number[]>();
  valuesByModel.forEach((dayMap, modelName) => {
    dataByModel.set(
      modelName,
      labels.map((label) => dayMap.get(label) || 0),
    );
  });

  return { labels, dataByModel, hasData };
}

export function buildChartData(
  usageData: unknown,
  period: "hour" | "day" = "day",
  metric: "requests" | "tokens" = "requests",
  selectedModels: string[] = [],
  options: { hourWindowHours?: number } = {},
): ChartData {
  const baseSeries =
    period === "hour"
      ? buildHourlySeriesByModel(usageData, metric, options.hourWindowHours)
      : buildDailySeriesByModel(usageData, metric);

  const { labels, dataByModel } = baseSeries;

  const getAllSeries = (): number[] => {
    const summed = Array.from({ length: labels.length }, () => 0);
    dataByModel.forEach((values) => {
      values.forEach((value, idx) => {
        summed[idx] = (summed[idx] || 0) + value;
      });
    });
    return summed;
  };

  const modelsToShow = selectedModels.length > 0 ? selectedModels : ["all"];

  const datasets: ChartDataset[] = modelsToShow.map((model, index) => {
    const isAll = model === "all";
    const data = isAll
      ? getAllSeries()
      : dataByModel.get(model) || Array.from({ length: labels.length }, () => 0);
    const colorIndex = index % CHART_COLORS.length;
    const style = CHART_COLORS[colorIndex];
    const shouldFill = modelsToShow.length === 1 || (isAll && modelsToShow.length > 1);

    return {
      label: isAll ? "All Models" : model,
      data,
      borderColor: style.borderColor,
      backgroundColor: shouldFill
        ? (ctx) => buildAreaGradient(ctx, style.borderColor, style.backgroundColor)
        : style.backgroundColor,
      pointBackgroundColor: style.borderColor,
      pointBorderColor: style.borderColor,
      fill: shouldFill,
      tension: 0.35,
    };
  });

  return { labels, datasets };
}
