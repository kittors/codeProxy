import { HoverTooltip, formatCompactNumber, formatInteger, formatUsd } from "@code-proxy/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * 标题下的一行汇总：跟随当前时间范围与筛选重算，悬停每一项看口径与精确值。
 * 数值占固定的最小宽度（等宽数字）：筛选后「1,354」变成「263」时后面几项不会往左挪。
 * 第一页还没回来时是占位「—」，不显示 0（「0 条记录、成功率 0%」看起来像真的没有数据）。
 */

const PENDING = "—";

function Stat({
  label,
  value,
  hint,
  width = "min-w-[5ch]",
}: {
  label: string;
  value: ReactNode;
  hint: ReactNode;
  width?: string;
}) {
  return (
    <HoverTooltip content={hint} placement="bottom">
      <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-ink-3">{label}</span>
        <span className={`inline-block font-medium tabular-nums text-ink ${width}`}>{value}</span>
      </span>
    </HoverTooltip>
  );
}

export interface RequestLogSummaryStats {
  total: number;
  /** 0–100。 */
  successRate: number;
  totalTokens: number;
  totalCost: number;
  /** 缓存命中率（0–100）与它的口径；null 是没人报告缓存用量，显示「—」。 */
  cache?: { percent: number | null; label: string; hint: string };
}

export function RequestLogSummary({
  stats,
  pending,
}: {
  stats: RequestLogSummaryStats;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const show = (render: () => ReactNode) => (pending ? PENDING : render());
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs" aria-live="polite">
      <Stat
        label={t("request_logs.summary_requests")}
        width="min-w-[6ch]"
        value={show(() => formatCompactNumber(stats.total))}
        hint={
          pending
            ? t("request_logs.summary_requests_hint")
            : `${t("request_logs.summary_requests_hint")} · ${formatInteger(stats.total)}`
        }
      />
      <Stat
        label={t("common.success_rate")}
        width="min-w-[5.5ch]"
        value={show(() => (stats.total > 0 ? `${stats.successRate.toFixed(1)}%` : PENDING))}
        hint={t("request_logs.summary_success_hint")}
      />
      <Stat
        label={t("request_logs.col_total_token")}
        value={show(() => formatCompactNumber(stats.totalTokens))}
        hint={
          pending
            ? t("request_logs.summary_tokens_hint")
            : `${t("request_logs.summary_tokens_hint")} · ${formatInteger(stats.totalTokens)}`
        }
      />
      <Stat
        label={t("request_logs.col_cost")}
        width="min-w-[7ch]"
        value={show(() => formatUsd(stats.totalCost))}
        hint={t("request_logs.summary_cost_hint")}
      />
      {stats.cache ? (
        <Stat
          label={stats.cache.label}
          value={show(() =>
            stats.cache?.percent === null || stats.cache?.percent === undefined
              ? PENDING
              : `${stats.cache.percent.toFixed(1)}%`,
          )}
          hint={stats.cache.hint}
        />
      ) : null}
    </div>
  );
}
