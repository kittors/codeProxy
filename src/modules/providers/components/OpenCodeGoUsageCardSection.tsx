import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import type { OpenCodeGoUsageItem } from "@/lib/http/types";

export interface OpenCodeGoUsageCacheEntry {
  workspaceId?: string;
  usage: OpenCodeGoUsageItem[];
  updatedAt: number;
  error?: string;
}

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

export function mergeOpenCodeGoUsage(
  existing: OpenCodeGoUsageItem[],
  incoming: OpenCodeGoUsageItem[],
): OpenCodeGoUsageItem[] {
  if (!existing.length) return incoming;
  if (!incoming.length) return existing;

  const seen = new Set<string>();
  const result: OpenCodeGoUsageItem[] = [];

  for (const item of incoming) {
    const key = item.type.toLowerCase();
    seen.add(key);
    result.push(item);
  }

  for (const item of existing) {
    const key = item.type.toLowerCase();
    if (!seen.has(key)) {
      result.push(item);
      seen.add(key);
    }
  }

  return result;
}

const resolveRemainingPercent = (usagePercentage: number | undefined): number | null => {
  if (typeof usagePercentage !== "number" || !Number.isFinite(usagePercentage)) return null;
  return clampPercent(100 - clampPercent(usagePercentage));
};

const resolveRemainingTone = (
  remaining: number | null,
): { fillClass: string; percentClass: string } => {
  if (remaining === null) {
    return {
      fillClass: "bg-slate-300/50 dark:bg-white/10",
      percentClass: "text-slate-600 dark:text-white/65",
    };
  }

  if (remaining >= 60) {
    return {
      fillClass: "bg-emerald-500",
      percentClass: "text-emerald-700 dark:text-emerald-200",
    };
  }

  if (remaining >= 20) {
    return {
      fillClass: "bg-amber-500",
      percentClass: "text-amber-700 dark:text-amber-200",
    };
  }

  return {
    fillClass: "bg-rose-500",
    percentClass: "text-rose-700 dark:text-rose-200",
  };
};

const TYPE_LABELS = ["rolling", "weekly", "monthly"] as const;

const TYPE_COMPACT_LABELS: Record<string, string> = {
  rolling: "滚动",
  weekly: "每周",
  monthly: "每月",
};

export function OpenCodeGoUsageCardSection({
  usageEntry,
  loading,
  onRefresh,
}: {
  usageEntry?: OpenCodeGoUsageCacheEntry;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();

  const usageByType = new Map(
    (usageEntry?.usage ?? []).map((item) => [item.type.toLowerCase(), item]),
  );

  const hasUsage = Boolean(usageEntry && usageEntry.usage.length > 0);

  return (
    <div className="relative mt-3 pr-6">
      {hasUsage ? (
        <div className="space-y-1.5">
          {TYPE_LABELS.map((type) => {
            const item = usageByType.get(type);
            const remaining = resolveRemainingPercent(item?.percentage);
            const tone = resolveRemainingTone(remaining);
            const remainingText = remaining === null ? "剩余 --" : `剩余 ${remaining}%`;

            return (
              <div
                key={type}
                className="grid grid-cols-[2rem_minmax(0,1fr)_5.25rem] items-center gap-2"
              >
                <span className="truncate text-[11px] font-semibold text-slate-600 dark:text-white/65">
                  {TYPE_COMPACT_LABELS[type]}
                </span>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                  <div
                    className={["h-full rounded-full", tone.fillClass].join(" ")}
                    style={{ width: `${remaining ?? 0}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span
                  className={[
                    "truncate text-right text-[11px] font-semibold tabular-nums",
                    tone.percentClass,
                  ].join(" ")}
                >
                  {remainingText}
                </span>
              </div>
            );
          })}
        </div>
      ) : !loading ? (
        <p className="text-xs text-slate-400 dark:text-white/45">
          {t("providers.opencode_go_usage_not_queried")}
        </p>
      ) : null}

      {usageEntry?.error ? (
        <p className="mt-1 text-[11px] font-semibold text-rose-700 dark:text-rose-200">
          {usageEntry.error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRefresh();
        }}
        disabled={loading}
        className="absolute right-0 top-0 inline-flex items-center justify-center rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25 disabled:opacity-50 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/60 dark:focus-visible:ring-white/20"
        aria-label={t("providers.opencode_go_usage_refresh")}
        title={t("providers.opencode_go_usage_refresh")}
      >
        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
