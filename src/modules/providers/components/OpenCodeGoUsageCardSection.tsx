import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import type { OpenCodeGoUsageItem } from "@/lib/http/types";

export interface OpenCodeGoUsageCacheEntry {
  workspaceId?: string;
  usage: OpenCodeGoUsageItem[];
  updatedAt: number;
  error?: string;
}

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
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/40">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700 dark:text-white/75">
          {t("providers.opencode_go_usage_title")}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25 disabled:opacity-50 dark:text-white/55 dark:hover:bg-white/10 dark:focus-visible:ring-white/20"
          aria-label={t("providers.opencode_go_usage_refresh")}
          title={t("providers.opencode_go_usage_refresh")}
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {usageEntry ? (
        <>
          <div className="mt-2 grid gap-2">
            {(["rolling", "weekly", "monthly"] as const).map((type) => {
              const item = usageByType.get(type);
              const value = item?.percentage ?? 0;
              return (
                <div key={type}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-600 dark:text-white/65">
                      {t(`providers.opencode_go_usage_${type}`)}
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-white/80">
                      {value}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400 dark:text-white/45">
                    {item && item.resets_in
                      ? t("providers.opencode_go_usage_resets_in", { time: item.resets_in })
                      : t("providers.opencode_go_usage_no_data")}
                  </p>
                </div>
              );
            })}
          </div>
          {usageEntry.error ? (
            <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
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
