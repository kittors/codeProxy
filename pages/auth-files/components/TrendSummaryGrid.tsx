import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  CalendarClock,
  ChartPie,
  CircleDollarSign,
  ExternalLink,
  Gauge,
  History,
  Sparkles,
} from "lucide-react";
import type { AuthFileTrendResponse } from "@code-proxy/api-client/endpoints/usage";
import { DialogIcon, type Hue } from "@code-proxy/ui";
import { QUOTA_HUE } from "../helpers/quotaSeriesColors";
import { buildTrendQuotaSummary, formatCurrency, formatPercent } from "../hooks/trendQuotaSummary";

const VALUE_CLASS_NAME =
  "min-w-0 whitespace-nowrap text-lg font-semibold leading-tight tracking-tight tabular-nums text-ink";

/**
 * 一格统计：无边淡底 + 图标 + 墨色数值。弹窗本身是一层，统计格只用一层淡底分组。
 * 图标着色为多彩时图标垫身份色小图标块（hue，和下面趋势图里的柱 / 线同色），单色时是中性的
 * 线性图标；只给图标上色——整块染色会让数字难读。
 * 一排放七格时较长的名称会折成两行，数值用 mt-auto 压到底部，各格的数字仍然对齐在同一条线上。
 */
function TrendSummaryTile({
  icon,
  hue,
  label,
  value,
  hint,
  valueClassName = VALUE_CLASS_NAME,
  testId,
}: {
  icon: ReactNode;
  hue: Hue;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  valueClassName?: string;
  testId?: string;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-2.5 rounded-xl bg-subtle p-3" data-testid={testId}>
      <p className="flex min-w-0 items-center gap-2 text-xs leading-snug font-semibold text-ink-3">
        <span aria-hidden="true" className="shrink-0 icon-hue:hidden [&_svg.lucide]:size-[14px]">
          {icon}
        </span>
        <DialogIcon tone={hue} size="xs" className="hidden icon-hue:grid">
          {icon}
        </DialogIcon>
        {/* 折行时不让最后一个字孤零零地掉到第二行（pretty 只挪末尾，不会像 balance 那样把「小时」拆开）。 */}
        <span className="min-w-0 text-pretty">{label}</span>
      </p>
      <div className="mt-auto min-w-0">
        <p className={valueClassName}>{value}</p>
        {hint ? <p className="mt-1 text-2xs leading-tight text-ink-3">{hint}</p> : null}
      </div>
    </div>
  );
}

const formatCount = (value: number) =>
  Number.isFinite(value) ? Math.round(value).toLocaleString() : "0";

/**
 * 账号详情「用量」页签顶部的统计格：周期请求、费用、Token、预测窗口额度、已消耗、周期开始。
 * 每格靠名称和图标区分是哪类数；图标着色为多彩时图标块的颜色说明「这是哪类数」，并且和下面
 * 趋势图里的柱 / 线同色：请求蓝、费用琥珀、Token 紫、额度粉（quotaSeriesColors 的第一个色相）、时间青。
 */
export function TrendSummaryGrid({
  trend,
  fiveHourQuotaKey,
  weeklyQuotaKey,
  showPredictedWeeklyQuota,
  hideLast7DaysRequests,
  className,
}: {
  trend: AuthFileTrendResponse;
  /** Null for providers with no 5h window (xAI reports weekly only). */
  fiveHourQuotaKey: string | null;
  weeklyQuotaKey: string;
  showPredictedWeeklyQuota: boolean;
  /** Codex 的周期请求数已经覆盖「近 7 天」，不再重复一格。 */
  hideLast7DaysRequests: boolean;
  className: string;
}) {
  const { t, i18n } = useTranslation();
  // Prefer cycle totals when the backend knows the weekly cycle start; otherwise fall back
  // so xAI cards do not show a misleading 0 before weekly_limit snapshots exist.
  const displayCycleRequestTotal =
    trend.cycle_known === true
      ? trend.cycle_request_total
      : trend.cycle_request_total > 0
        ? trend.cycle_request_total
        : trend.request_total;
  const displayCycleCostTotal = trend.cycle_cost_total;
  const displayCycleTotalTokens =
    typeof trend.cycle_total_tokens === "number" && Number.isFinite(trend.cycle_total_tokens)
      ? Math.max(0, Math.round(trend.cycle_total_tokens))
      : null;
  const cycleStart = trend.cycle_start ? new Date(trend.cycle_start).toLocaleString() : "--";
  const {
    weeklyQuotaUsedPercent,
    projectionQuotaUsedPercent,
    projectionIsAttributable,
    externalQuotaUsedPercent,
    estimatedFiveHourQuota,
    estimatedWeeklyQuota,
  } = buildTrendQuotaSummary({
    trend,
    fiveHourQuotaKey,
    weeklyQuotaKey,
    showPredictedWeeklyQuota,
    cycleCostTotal: displayCycleCostTotal,
  });
  // ponytail: hide zero noise; null/"--" is already non-zero display path
  const showLast7DaysRequests = !hideLast7DaysRequests && trend.request_total > 0;
  const showWeeklyUsed =
    typeof weeklyQuotaUsedPercent === "number" &&
    Number.isFinite(weeklyQuotaUsedPercent) &&
    weeklyQuotaUsedPercent > 0;
  // Only worth a card when the account actually spent outside the proxy;
  // a permanent "0%" would be noise on every well-behaved credential.
  const showExternalQuotaUsed =
    typeof externalQuotaUsedPercent === "number" && externalQuotaUsedPercent > 0;

  return (
    <div className={className}>
      {showLast7DaysRequests ? (
        <TrendSummaryTile
          icon={<History />}
          hue="blue"
          label={t("auth_files.trend_last_7_days_requests")}
          value={formatCount(trend.request_total)}
        />
      ) : null}
      {displayCycleRequestTotal > 0 ? (
        <TrendSummaryTile
          icon={<Activity />}
          hue="blue"
          label={t("auth_files.trend_current_weekly_cycle")}
          value={formatCount(displayCycleRequestTotal)}
        />
      ) : null}
      {displayCycleCostTotal > 0 ? (
        <TrendSummaryTile
          icon={<CircleDollarSign />}
          hue="amber"
          label={t("auth_files.trend_current_cycle_cost")}
          value={formatCurrency(displayCycleCostTotal)}
        />
      ) : null}
      <TrendSummaryTile
        icon={<Sparkles />}
        hue="violet"
        label={t("auth_files.trend_current_cycle_tokens")}
        value={
          displayCycleTotalTokens === null ? "--" : displayCycleTotalTokens.toLocaleString(i18n.language)
        }
      />
      {fiveHourQuotaKey !== null && estimatedFiveHourQuota > 0 ? (
        <TrendSummaryTile
          icon={<Gauge />}
          hue={QUOTA_HUE}
          label={t("auth_files.trend_predicted_5h_window_quota")}
          value={formatCurrency(estimatedFiveHourQuota)}
        />
      ) : null}
      {showPredictedWeeklyQuota && estimatedWeeklyQuota > 0 ? (
        <TrendSummaryTile
          testId="trend-predicted-weekly-quota"
          icon={<Gauge />}
          hue={QUOTA_HUE}
          label={t("auth_files.trend_predicted_week_window_quota")}
          value={formatCurrency(estimatedWeeklyQuota)}
          hint={
            projectionIsAttributable
              ? t("auth_files.trend_predicted_quota_attributable_hint", {
                  percent: formatPercent(projectionQuotaUsedPercent),
                })
              : undefined
          }
        />
      ) : null}
      {showWeeklyUsed ? (
        <TrendSummaryTile
          icon={<ChartPie />}
          hue={QUOTA_HUE}
          label={t("auth_files.trend_weekly_quota_used")}
          value={formatPercent(weeklyQuotaUsedPercent)}
        />
      ) : null}
      {showExternalQuotaUsed ? (
        <TrendSummaryTile
          testId="trend-external-quota-used"
          icon={<ExternalLink />}
          hue={QUOTA_HUE}
          label={t("auth_files.trend_external_quota_used")}
          value={formatPercent(externalQuotaUsedPercent)}
        />
      ) : null}
      {trend.cycle_start ? (
        <TrendSummaryTile
          icon={<CalendarClock />}
          hue="cyan"
          label={t("auth_files.trend_cycle_start")}
          value={cycleStart}
          valueClassName="whitespace-normal break-words text-sm font-semibold leading-tight text-ink"
        />
      ) : null}
    </div>
  );
}
