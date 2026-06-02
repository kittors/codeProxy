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

const resolveUsageTone = (
  value: number,
): { fillClass: string; percentClass: string } => {
  const normalized = clampPercent(value);

  if (normalized >= 60) {
    return {
      fillClass: "bg-emerald-500",
      percentClass: "text-emerald-700 dark:text-emerald-200",
    };
  }

  if (normalized >= 20) {
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

  return (
    <div className="mt-3 rounded-2xl bg-slate-50/85 px-3 py-3 transition-colors duration-200 ease-out dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-700 dark:text-white/80">
          {t("providers.opencode_go_usage_title")}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25 disabled:opacity-50 dark:text-white/55 dark:hover:bg-white/10 dark:focus-visible:ring-white/20"
          aria-label={t("providers.opencode_go_usage_refresh")}
          title={t("providers.opencode_go_usage_refresh")}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {usageEntry ? (
        <>
          <div className="mt-2 space-y-2.5">
            {(["rolling", "weekly", "monthly"] as const).map((type) => {
              const item = usageByType.get(type);
              const value = item?.percentage ?? 0;
              const tone = resolveUsageTone(value);

              return (
                <div key={type} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] font-semibold text-slate-700 dark:text-white/80">
                      {t(`providers.opencode_go_usage_${type}`)}
                    </span>
                    <span
                      className={[
                        "shrink-0 text-[11px] font-semibold tabular-nums",
                        tone.percentClass,
                      ].join(" ")}
                    >
                      {value}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                    <div
                      className={["h-full rounded-full", tone.fillClass].join(" ")}
                      style={{ width: `${clampPercent(value)}%` }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="truncate text-[10px] tabular-nums text-slate-500 dark:text-white/45">
                    {item && item.resets_in
                      ? t("providers.opencode_go_usage_resets_in", { time: item.resets_in })
                      : t("providers.opencode_go_usage_no_data")}
                  </div>
                </div>
              );
            })}
          </div>
          {usageEntry.error ? (
            <p className="mt-2 text-[11px] font-semibold text-rose-700 dark:text-rose-200">
              {usageEntry.error}
            </p>
          ) : null}
        </>
      ) : !loading ? (
        <p className="mt-2 text-xs text-slate-400 dark:text-white/45">
          {t("providers.opencode_go_usage_not_queried")}
        </p>
      ) : null}
    </div>
  );
}
